import {
  appendAppointmentProposal,
  getCurrentAppointmentProposal,
  transitionAppointment,
} from "../../../domain/schedule/appointmentPolicy";
import type {
  Appointment,
  AppointmentActor,
  AppointmentTimePrecision,
} from "../../../domain/schedule/scheduleTypes";
import {
  PROACTIVE_OFFLINE_RESPONSE_END,
  PROACTIVE_OFFLINE_RESPONSE_START,
} from "../prompts/proactiveOfflineResponsePrompt";

const TIME_PRECISIONS = new Set<AppointmentTimePrecision>(["exact", "morning", "afternoon", "evening", "date_only", "undetermined"]);
const TRAVELERS = new Set<AppointmentActor>(["character", "user", "both", "undetermined"]);
const MAX_FIELD_LENGTH = 160;
const COUNTER_CHANGE_EVIDENCE = /(?:改(?:成|到|为)?|换(?:成|到)?|推迟|提前|另约|要不|不如|那(?:就)?(?:周|星期|明天|后天|上午|下午|晚上)|(?:周|星期)[一二三四五六日天](?:上午|中午|下午|晚上)?(?:呢|可以吗|怎么样)|instead|change|reschedule|rather|대신|바꿔|변경|그러면|明日なら|変更|代わり)/iu;
const TEMPORAL_OR_PLACE_EVIDENCE = /(?:下次|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]|上午|中午|下午|晚上|今晚|凌晨|\d{1,2}\s*点(?:钟)?|\d{1,2}\s*[号日月]|地点|地方|tomorrow|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d|내일|모레|주말|요일|오전|오후|\d{1,2}\s*시|明日|明後日|来週|午前|午後|\d{1,2}\s*時)/iu;
const DECLINE_EVIDENCE = /(?:不方便|没空|没有空|不行|不能|去不了|见不了|别来|不要来|算了|拒绝|不想|改天吧|下次吧|not available|can't|cannot|no thanks|don't come|바빠|안 돼|못 만나|오지 마|会えない|無理|来ないで)/iu;
const ACCEPT_EVIDENCE = /(?:^|[，。！？!?,.\s])(?:好(?:啊|呀|的)?|可以|行(?:啊|呀)?|没问题|就这么定|那就这样|答应|同意|我去|我等你|来吧|ok(?:ay)?|sure|sounds good|deal|좋아|그래|알겠어|응|いいよ|わかった|そうしよう)(?:$|[，。！？!?,.\s])/iu;

export type ProactiveOfflineResponseAction = "accept" | "decline" | "counter";

export interface ProactiveOfflineResponseDirective {
  appointmentId: string;
  action: ProactiveOfflineResponseAction;
  startAt?: number;
  timePrecision?: AppointmentTimePrecision;
  activity?: string;
  location?: string;
  traveler?: AppointmentActor;
  transport?: string;
  characterAccepts?: boolean;
}

export interface ProactiveOfflineResponseParseResult {
  visibleText: string;
  directive?: ProactiveOfflineResponseDirective;
  error?: "multiple_directives" | "malformed_json" | "invalid_directive" | "unsupported_by_user_message";
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
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const validateDirective = (input: {
  raw: unknown;
  appointment: Appointment;
  latestUserText: string;
  now: number;
}): ProactiveOfflineResponseDirective | "unsupported_by_user_message" | undefined => {
  if (!input.raw || typeof input.raw !== "object" || Array.isArray(input.raw)) return undefined;
  const raw = input.raw as Record<string, unknown>;
  if (raw.appointmentId !== input.appointment.id) return undefined;
  if (raw.action !== "accept" && raw.action !== "decline" && raw.action !== "counter") return undefined;
  const hasDeclineEvidence = DECLINE_EVIDENCE.test(input.latestUserText);
  const hasAcceptEvidence = ACCEPT_EVIDENCE.test(input.latestUserText);
  const hasExplicitCounterEvidence = COUNTER_CHANGE_EVIDENCE.test(input.latestUserText);
  const hasCounterEvidence = hasExplicitCounterEvidence
    || (!hasDeclineEvidence && !hasAcceptEvidence && TEMPORAL_OR_PLACE_EVIDENCE.test(input.latestUserText));

  if (raw.action === "accept") {
    if (hasExplicitCounterEvidence || hasDeclineEvidence || !hasAcceptEvidence) return "unsupported_by_user_message";
    return { appointmentId: input.appointment.id, action: "accept" };
  }
  if (raw.action === "decline") {
    if (hasExplicitCounterEvidence || !hasDeclineEvidence) return "unsupported_by_user_message";
    return { appointmentId: input.appointment.id, action: "decline" };
  }
  if (!hasCounterEvidence) return "unsupported_by_user_message";
  if (typeof raw.timePrecision !== "string" || !TIME_PRECISIONS.has(raw.timePrecision as AppointmentTimePrecision)) return undefined;
  if (typeof raw.traveler !== "string" || !TRAVELERS.has(raw.traveler as AppointmentActor)) return undefined;
  if (typeof raw.characterAccepts !== "boolean") return undefined;
  const startAt = parseStartAt(raw.startAt);
  if (raw.startAt !== null && raw.startAt !== undefined && raw.startAt !== "" && startAt === undefined) return undefined;
  if (startAt === undefined && raw.timePrecision !== "undetermined") return undefined;
  if (startAt !== undefined && raw.timePrecision === "undetermined") return undefined;
  if (startAt !== undefined && startAt < input.now - 10 * 60 * 1000) return undefined;
  for (const field of ["activity", "location", "transport"] as const) {
    if (raw[field] !== null && raw[field] !== undefined && raw[field] !== "" && optionalText(raw[field]) === undefined) return undefined;
  }
  return {
    appointmentId: input.appointment.id,
    action: "counter",
    ...(startAt === undefined ? {} : { startAt }),
    timePrecision: raw.timePrecision as AppointmentTimePrecision,
    ...(optionalText(raw.activity) ? { activity: optionalText(raw.activity) } : {}),
    ...(optionalText(raw.location) ? { location: optionalText(raw.location) } : {}),
    traveler: raw.traveler as AppointmentActor,
    ...(optionalText(raw.transport) ? { transport: optionalText(raw.transport) } : {}),
    characterAccepts: raw.characterAccepts,
  };
};

/** Always removes internal response blocks, including forged or malformed ones. */
export function parseProactiveOfflineResponseDirective(input: {
  text: string;
  appointment?: Appointment;
  latestUserText: string;
  now?: number;
}): ProactiveOfflineResponseParseResult {
  const completePattern = /\[\[OFFLINE_RESPONSE\]\]([\s\S]*?)\[\[\/OFFLINE_RESPONSE\]\]/g;
  const matches = [...input.text.matchAll(completePattern)];
  const withoutComplete = input.text.replace(completePattern, "");
  const unmatchedStart = withoutComplete.indexOf(PROACTIVE_OFFLINE_RESPONSE_START);
  const withoutResidual = unmatchedStart >= 0 ? withoutComplete.slice(0, unmatchedStart) : withoutComplete;
  const visibleText = cleanVisibleText(withoutResidual.replaceAll(PROACTIVE_OFFLINE_RESPONSE_END, ""));
  if (matches.length === 0 || !input.appointment) return { visibleText };
  if (matches.length > 1) return { visibleText, error: "multiple_directives" };
  try {
    const validated = validateDirective({
      raw: JSON.parse(matches[0][1].trim()),
      appointment: input.appointment,
      latestUserText: input.latestUserText,
      now: input.now ?? Date.now(),
    });
    if (validated === "unsupported_by_user_message") return { visibleText, error: validated };
    return validated ? { visibleText, directive: validated } : { visibleText, error: "invalid_directive" };
  } catch {
    return { visibleText, error: "malformed_json" };
  }
}

export function applyProactiveOfflineResponse(input: {
  appointment: Appointment;
  directive: ProactiveOfflineResponseDirective;
  userMessageId: string;
  characterMessageId?: string;
  now?: number;
}): Appointment | undefined {
  if (input.appointment.id !== input.directive.appointmentId) return undefined;
  const now = input.now ?? Date.now();
  const sourceMessageIds = [...new Set([
    ...input.appointment.sourceMessageIds,
    input.userMessageId,
    ...(input.characterMessageId ? [input.characterMessageId] : []),
  ])];
  if (input.directive.action === "accept" || input.directive.action === "decline") {
    const transition = transitionAppointment(input.appointment, input.directive.action === "accept" ? "confirmed" : "declined", now);
    return transition.success ? { ...transition.appointment, sourceMessageIds } : undefined;
  }

  const previous = getCurrentAppointmentProposal(input.appointment);
  const proposal = appendAppointmentProposal(input.appointment, {
    id: `proposal:${input.userMessageId}`,
    proposedBy: "user",
    proposedAt: now,
    ...(input.directive.startAt === undefined ? {} : { startAt: input.directive.startAt }),
    timePrecision: input.directive.timePrecision || "undetermined",
    ...(input.directive.activity || previous?.activity ? { activity: input.directive.activity || previous?.activity } : {}),
    ...(input.directive.location || previous?.location ? { location: input.directive.location || previous?.location } : {}),
    traveler: input.directive.traveler || previous?.traveler || "undetermined",
    ...(input.directive.transport || previous?.transport ? { transport: input.directive.transport || previous?.transport } : {}),
    status: "active",
    sourceMessageIds: [input.userMessageId],
  }, now);
  if (!proposal.success) return undefined;
  const negotiated = { ...proposal.appointment, sourceMessageIds };
  if (!input.directive.characterAccepts) return negotiated;
  const confirmed = transitionAppointment(negotiated, "confirmed", now);
  return confirmed.success ? { ...confirmed.appointment, sourceMessageIds } : negotiated;
}
