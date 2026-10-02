import type { AppointmentActor, AppointmentMode, AppointmentTimePrecision } from "../../../domain/schedule/scheduleTypes";
import { addCalendarDays, getZonedDateTimeParts, zonedDateTimeToTimestamp } from "../../../domain/schedule/zonedDateTime";
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

/**
 * A model can occasionally omit the private invitation block while its
 * visible reply still confirms an explicit user-requested invitation.  The
 * fallback below is deliberately narrow: it requires an explicit request,
 * concrete user-supplied timing, and confirmation language from the reply.
 * It must never turn an unsolicited or vague sentence into a calendar fact.
 */
const deriveExplicitRequestFallback = (input: {
  text: string;
  userText?: string;
  allowedModes: readonly AppointmentMode[];
  now: number;
  timeZone?: string;
}): ProactiveOfflineInvitationDirective | undefined => {
  const userText = input.userText?.trim();
  if (!userText || !input.allowedModes.length) return undefined;
  const hasInvitationRequest = /(?:发起|提出|安排|约|邀请).{0,24}(?:线下|见面|碰面|会面)|(?:线下|见面|碰面|会面).{0,24}(?:邀请|邀约|约一下)/iu.test(userText);
  if (!hasInvitationRequest) return undefined;
  const hasAssistantConfirmation = /(?:邀约|邀请).{0,24}(?:已|已经|重新)?(?:发出|发起|确认|安排好)|(?:明天|后天|今晚|今天).{0,32}(?:见面|碰面|会面)|(?:见一面|碰个面|见面吧)/iu.test(input.text);
  if (!hasAssistantConfirmation) return undefined;

  const immediate = /(?:立马|立即|马上|现在|就现在|当下|此刻)/u.test(userText);
  const scheduled = /(?:明天|后天|今晚|明晚|今天晚上|下周|周[一二三四五六日天]|\d{1,2}\s*(?:月|\/|-|日)|\d{1,2}\s*(?::|：|点))/u.test(userText);
  const mode: AppointmentMode = immediate && input.allowedModes.includes("immediate")
    ? "immediate"
    : scheduled && input.allowedModes.includes("scheduled")
      ? "scheduled"
      : input.allowedModes.includes("scheduled")
        ? "scheduled"
        : input.allowedModes.includes("immediate")
          ? "immediate"
          : input.allowedModes[0];

  const relativeMatch = userText.match(/(今天|今晚|明天|明晚|后天|后晚)/u);
  const dayOffset = relativeMatch
    ? /后/u.test(relativeMatch[1]) ? 2 : /明/u.test(relativeMatch[1]) ? 1 : 0
    : 0;
  const timeMatch = userText.match(/(?:早上|上午|中午|下午|傍晚|晚上|晚间)?\s*(\d{1,2})(?::|：|点)(\d{0,2})?/u);
  let startAt: number | undefined;
  let timePrecision: AppointmentTimePrecision = "undetermined";
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    if (/(?:下午|傍晚|晚上|晚间)/u.test(timeMatch[0]) && hour < 12) hour += 12;
    const date = addCalendarDays(getZonedDateTimeParts(input.now, input.timeZone), dayOffset);
    startAt = zonedDateTimeToTimestamp({ ...date, hour, minute, second: 0, millisecond: 0 }, input.timeZone);
    timePrecision = "exact";
  } else if (/(?:早上|上午)/u.test(userText)) {
    timePrecision = "morning";
  } else if (/(?:下午|傍晚)/u.test(userText)) {
    timePrecision = "afternoon";
  } else if (/(?:晚上|晚间|今晚|明晚|后晚)/u.test(userText)) {
    timePrecision = "evening";
  } else if (relativeMatch) {
    timePrecision = "date_only";
  }

  if (mode === "scheduled" && startAt !== undefined && startAt < input.now) return undefined;
  if (mode === "immediate" && startAt !== undefined && startAt < input.now - 10 * 60 * 1000) return undefined;
  const locationMatch = userText.match(/(?:在|去|到)\s*([^，。！？!?\n]{1,48}?)\s*(?:见面|碰面|会面|集合|见(?:一面)?)/u);
  const activity = /(?:吃饭|用餐|看电影|逛街|散步|喝咖啡|咖啡厅)/u.test(userText)
    ? userText.match(/(?:吃饭|用餐|看电影|逛街|散步|喝咖啡|咖啡厅)/u)?.[0]
    : "线下见面";
  return {
    mode,
    ...(startAt === undefined ? {} : { startAt }),
    timePrecision,
    activity,
    ...(locationMatch?.[1] ? { location: locationMatch[1].trim() } : {}),
    traveler: "character",
  };
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
  /** IANA timezone used for relative natural-language dates. */
  timeZone?: string;
  /** User-authored request used only for the narrow missing-block fallback. */
  userText?: string;
}): ProactiveOfflineDirectiveParseResult {
  const completePattern = /\[\[OFFLINE_INVITATION\]\]([\s\S]*?)\[\[\/OFFLINE_INVITATION\]\]/g;
  const matches = [...input.text.matchAll(completePattern)];
  const withoutComplete = input.text.replace(completePattern, "");
  const unmatchedStart = withoutComplete.indexOf(PROACTIVE_OFFLINE_DIRECTIVE_START);
  const withoutResidual = unmatchedStart >= 0 ? withoutComplete.slice(0, unmatchedStart) : withoutComplete;
  const visibleText = cleanVisibleText(withoutResidual.replaceAll(PROACTIVE_OFFLINE_DIRECTIVE_END, ""));

  if (matches.length === 0) {
    const fallback = deriveExplicitRequestFallback({
      text: visibleText,
      userText: input.userText,
      allowedModes: input.allowedModes,
      now: input.now ?? Date.now(),
      timeZone: input.timeZone,
    });
    return fallback ? { visibleText, directive: fallback } : { visibleText };
  }
  if (matches.length > 1) return { visibleText, error: "multiple_directives" };
  try {
    const parsed = JSON.parse(matches[0][1].trim());
    const directive = validateDirective(parsed, input.allowedModes, input.now ?? Date.now());
    if (directive) return { visibleText, directive };
    const fallback = deriveExplicitRequestFallback({
      text: visibleText,
      userText: input.userText,
      allowedModes: input.allowedModes,
      now: input.now ?? Date.now(),
      timeZone: input.timeZone,
    });
    return fallback ? { visibleText, directive: fallback } : { visibleText, error: "invalid_directive" };
  } catch {
    const fallback = deriveExplicitRequestFallback({
      text: visibleText,
      userText: input.userText,
      allowedModes: input.allowedModes,
      now: input.now ?? Date.now(),
      timeZone: input.timeZone,
    });
    return fallback ? { visibleText, directive: fallback } : { visibleText, error: "malformed_json" };
  }
}
