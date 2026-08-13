import type { AppointmentActor, AppointmentMode, AppointmentTimePrecision } from "../../../domain/schedule/scheduleTypes";
import { PROACTIVE_OFFLINE_DIRECTIVE_END, PROACTIVE_OFFLINE_DIRECTIVE_START } from "../prompts/proactiveOfflineInvitationPrompt";

const TIME_PRECISIONS = new Set<AppointmentTimePrecision>(["exact", "morning", "afternoon", "evening", "date_only", "undetermined"]);
const TRAVELERS = new Set<AppointmentActor>(["character", "user", "both", "undetermined"]);
const MAX_FIELD_LENGTH = 160;

export interface ProactiveOfflineInvitationDirective {
  mode: AppointmentMode;
  startAt?: number;
  timePrecision: AppointmentTimePrecision;
  activity?: string;
  location?: string;
  traveler: AppointmentActor;
  transport?: string;
}

export type ProactiveOfflineDirectiveError = "multiple_directives" | "malformed_json" | "invalid_directive";

export interface ProactiveOfflineDirectiveParseResult {
  visibleText: string;
  directive?: ProactiveOfflineInvitationDirective;
  error?: ProactiveOfflineDirectiveError;
}

const cleanVisibleText = (value: string) => value.replace(/\n{3,}/g, "\n\n").trim();
const optionalText = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_FIELD_LENGTH ? normalized : undefined;
};

const parseStartAt = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const validateDirective = (
  value: unknown,
  allowedModes: readonly AppointmentMode[],
  now: number,
): ProactiveOfflineInvitationDirective | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if ((raw.mode !== "immediate" && raw.mode !== "scheduled") || !allowedModes.includes(raw.mode)) return undefined;
  if (typeof raw.timePrecision !== "string" || !TIME_PRECISIONS.has(raw.timePrecision as AppointmentTimePrecision)) return undefined;
  if (typeof raw.traveler !== "string" || !TRAVELERS.has(raw.traveler as AppointmentActor)) return undefined;

  const startAt = parseStartAt(raw.startAt);
  if (raw.startAt !== null && raw.startAt !== undefined && raw.startAt !== "" && startAt === undefined) return undefined;
  if (startAt === undefined && raw.timePrecision !== "undetermined") return undefined;
  if (startAt !== undefined && raw.timePrecision === "undetermined") return undefined;
  if (raw.mode === "scheduled" && startAt !== undefined && startAt < now) return undefined;
  if (raw.mode === "immediate" && startAt !== undefined && (startAt < now - 10 * 60 * 1000 || startAt > now + 24 * 60 * 60 * 1000)) return undefined;

  const fields = ["activity", "location", "transport"] as const;
  for (const field of fields) {
    const rawField = raw[field];
    if (rawField !== null && rawField !== undefined && rawField !== "" && optionalText(rawField) === undefined) return undefined;
  }

  return {
    mode: raw.mode,
    ...(startAt === undefined ? {} : { startAt }),
    timePrecision: raw.timePrecision as AppointmentTimePrecision,
    ...(optionalText(raw.activity) ? { activity: optionalText(raw.activity) } : {}),
    ...(optionalText(raw.location) ? { location: optionalText(raw.location) } : {}),
    traveler: raw.traveler as AppointmentActor,
    ...(optionalText(raw.transport) ? { transport: optionalText(raw.transport) } : {}),
  };
};

/** Extracts and always hides internal blocks, including malformed model output. */
export function parseProactiveOfflineInvitationDirective(input: {
  text: string;
  allowedModes: readonly AppointmentMode[];
  now?: number;
}): ProactiveOfflineDirectiveParseResult {
  const completePattern = /\[\[OFFLINE_INVITATION\]\]([\s\S]*?)\[\[\/OFFLINE_INVITATION\]\]/g;
  const matches = [...input.text.matchAll(completePattern)];
  const withoutComplete = input.text.replace(completePattern, "");
  const unmatchedStart = withoutComplete.indexOf(PROACTIVE_OFFLINE_DIRECTIVE_START);
  const withoutResidual = unmatchedStart >= 0 ? withoutComplete.slice(0, unmatchedStart) : withoutComplete;
  const visibleText = cleanVisibleText(withoutResidual.replaceAll(PROACTIVE_OFFLINE_DIRECTIVE_END, ""));

  if (matches.length === 0) return { visibleText };
  if (matches.length > 1) return { visibleText, error: "multiple_directives" };
  try {
    const parsed = JSON.parse(matches[0][1].trim());
    const directive = validateDirective(parsed, input.allowedModes, input.now ?? Date.now());
    return directive ? { visibleText, directive } : { visibleText, error: "invalid_directive" };
  } catch {
    return { visibleText, error: "malformed_json" };
  }
}
