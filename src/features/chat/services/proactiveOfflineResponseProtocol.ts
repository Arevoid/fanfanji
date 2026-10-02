import {
  appendAppointmentProposal,
  getCurrentAppointmentProposal,
  transitionAppointment,
} from "../../../domain/schedule/appointmentPolicy";
import { addCalendarDays, getZonedDateTimeParts, zonedDateTimeToTimestamp } from "../../../domain/schedule/zonedDateTime";
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
const CHARACTER_COUNTER_CONFIRMATION_EVIDENCE = /(?:参数已(?:经)?更新|邀约参数已|已(?:经)?(?:改成|改为|更新为)|邀约已发出|那就.{0,12}(?:见面|碰面|会面)|(?:可以|好|行).{0,20}(?:改到|改成|换到|换成|地点)|(?:明天|后天|今晚|今天).{0,24}(?:见面|碰面|会面))/iu;

export const isProactiveOfflineCounterRequest = (text: string): boolean =>
  COUNTER_CHANGE_EVIDENCE.test(text) && (
    TEMPORAL_OR_PLACE_EVIDENCE.test(text)
    || /(?:周|星期)[一二三四五六日天]/u.test(text)
    || /(?:改|换)(?:到|成|为)?[^。！？!?\n]{1,40}(?:见面|碰面|会面)/u.test(text)
    || /(?:地点|地方)[^。！？!?\n]{0,20}(?:改|换|变)/u.test(text)
  );

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

const resolveCounterTime = (text: string, now: number, previousStartAt?: number, timeZone?: string): { startAt?: number; timePrecision: AppointmentTimePrecision } | undefined => {
  const dayReference = text.match(/今天|今晚|明天|明晚|后天/u)?.[0];
  const weekdayReference = text.match(/(?:周|星期)([一二三四五六日天])/u)?.[1];
  const timeMatch = text.match(/(\d{1,2})(?::|：|点|时)(\d{1,2})?(?:分)?/u);
  if (!dayReference && !weekdayReference && !timeMatch) return undefined;
  const current = getZonedDateTimeParts(now, timeZone);
  const weekdayIndex: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const dayOffset = dayReference === "后天" ? 2 : dayReference === "明天" || dayReference === "明晚" ? 1 : weekdayReference
    ? (weekdayIndex[weekdayReference] - new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay() + 7) % 7 || 7
    : 0;
  const date = addCalendarDays(current, dayOffset);
  if (!timeMatch) {
    const period = /晚上|明晚|今晚/u.test(text) ? "evening"
      : /下午/u.test(text) ? "afternoon"
        : /上午|早上/u.test(text) ? "morning"
          : dayReference || weekdayReference ? "date_only" : undefined;
    if (!period) return undefined;
    if (previousStartAt !== undefined) {
      const previous = getZonedDateTimeParts(previousStartAt, timeZone);
      return {
        startAt: zonedDateTimeToTimestamp({ ...date, hour: previous.hour, minute: previous.minute, second: 0, millisecond: 0 }, timeZone),
        timePrecision: period === "date_only" ? "exact" : period,
      };
    }
    return { timePrecision: period };
  }
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return undefined;
  if (/(晚上|明晚|今晚)/u.test(text) && hour < 12) hour += 12;
  const startAt = zonedDateTimeToTimestamp({ ...date, hour, minute, second: 0, millisecond: 0 }, timeZone);
  return Number.isFinite(startAt) ? { startAt, timePrecision: "exact" } : undefined;
};

const deriveCounterFallback = (input: {
  text: string;
  appointment: Appointment;
  latestUserText: string;
  now: number;
  timeZone?: string;
}): ProactiveOfflineResponseDirective | undefined => {
  if (!COUNTER_CHANGE_EVIDENCE.test(input.latestUserText) || !CHARACTER_COUNTER_CONFIRMATION_EVIDENCE.test(input.text)) return undefined;
  const previous = getCurrentAppointmentProposal(input.appointment);
  const location = input.latestUserText.match(/(?:地点|地方)\s*(?:改成|改为|换成|是|为)?\s*([^，。！？,!?]+?)(?:见面|碰面|会面|集合|见|吧|。|！|！|$)/u)?.[1]?.trim()
    || input.latestUserText.match(/(?:在|去|到)\s*([^，。！？,!?]+?)(?:见面|碰面|会面|集合|见)/u)?.[1]?.trim();
  const timing = resolveCounterTime(input.latestUserText, input.now, previous?.startAt, input.timeZone)
    || (location && previous?.startAt !== undefined
      ? { startAt: previous.startAt, timePrecision: previous.timePrecision as AppointmentTimePrecision }
      : undefined);
  if (!timing) return undefined;
  return {
    appointmentId: input.appointment.id,
    action: "counter",
    ...(timing.startAt === undefined ? {} : { startAt: timing.startAt }),
    timePrecision: timing.timePrecision,
    ...(previous?.activity ? { activity: previous.activity } : {}),
    ...(location ? { location } : previous?.location ? { location: previous.location } : {}),
    traveler: previous?.traveler || "undetermined",
    ...(previous?.transport ? { transport: previous.transport } : {}),
    characterAccepts: true,
  };
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
  /** IANA timezone used for relative natural-language dates. */
  timeZone?: string;
}): ProactiveOfflineResponseParseResult {
  const completePattern = /\[\[OFFLINE_RESPONSE\]\]([\s\S]*?)\[\[\/OFFLINE_RESPONSE\]\]/g;
  const matches = [...input.text.matchAll(completePattern)];
  const withoutComplete = input.text.replace(completePattern, "");
  const unmatchedStart = withoutComplete.indexOf(PROACTIVE_OFFLINE_RESPONSE_START);
  const withoutResidual = unmatchedStart >= 0 ? withoutComplete.slice(0, unmatchedStart) : withoutComplete;
  const visibleText = cleanVisibleText(withoutResidual.replaceAll(PROACTIVE_OFFLINE_RESPONSE_END, ""));
  if (!input.appointment) return { visibleText };
  if (matches.length === 0) {
    const fallback = deriveCounterFallback({
      text: visibleText,
      appointment: input.appointment,
      latestUserText: input.latestUserText,
      now: input.now ?? Date.now(),
      timeZone: input.timeZone,
    });
    return fallback ? { visibleText, directive: fallback } : { visibleText };
  }
  if (matches.length > 1) return { visibleText, error: "multiple_directives" };
  try {
    const validated = validateDirective({
      raw: JSON.parse(matches[0][1].trim()),
      appointment: input.appointment,
      latestUserText: input.latestUserText,
      now: input.now ?? Date.now(),
    });
    if (validated === "unsupported_by_user_message") return { visibleText, error: validated };
    if (validated) return { visibleText, directive: validated };
    const fallback = deriveCounterFallback({
      text: visibleText,
      appointment: input.appointment,
      latestUserText: input.latestUserText,
      now: input.now ?? Date.now(),
      timeZone: input.timeZone,
    });
    return fallback ? { visibleText, directive: fallback } : { visibleText, error: "invalid_directive" };
  } catch {
    const fallback = deriveCounterFallback({
      text: visibleText,
      appointment: input.appointment,
      latestUserText: input.latestUserText,
      now: input.now ?? Date.now(),
      timeZone: input.timeZone,
    });
    return fallback ? { visibleText, directive: fallback } : { visibleText, error: "malformed_json" };
  }
}

export function applyProactiveOfflineResponse(input: {
  appointment: Appointment;
  directive: ProactiveOfflineResponseDirective;
  userMessageId: string;
  characterMessageId?: string;
  now?: number;
  latestUserText?: string;
  /** IANA timezone used when resolving a date-only counter proposal. */
  timeZone?: string;
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
  if (!input.directive.characterAccepts) return input.appointment;
  const resolvedTiming = input.directive.startAt === undefined
    && input.directive.timePrecision === "date_only"
    && input.latestUserText
    ? resolveCounterTime(input.latestUserText, now, previous?.startAt, input.timeZone)
    : undefined;
  const startAt = input.directive.startAt ?? resolvedTiming?.startAt;
  const timePrecision = startAt !== undefined && input.directive.timePrecision === "date_only"
    ? "exact" as const
    : input.directive.timePrecision || "undetermined" as const;
  const proposal = appendAppointmentProposal(input.appointment, {
    id: `proposal:${input.userMessageId}`,
    proposedBy: "user",
    proposedAt: now,
    ...(startAt === undefined ? {} : { startAt }),
    timePrecision,
    ...(input.directive.activity || previous?.activity ? { activity: input.directive.activity || previous?.activity } : {}),
    ...(input.directive.location || previous?.location ? { location: input.directive.location || previous?.location } : {}),
    traveler: input.directive.traveler || previous?.traveler || "undetermined",
    ...(input.directive.transport || previous?.transport ? { transport: input.directive.transport || previous?.transport } : {}),
    status: "active",
    sourceMessageIds: [input.userMessageId],
  }, now, { allowConfirmed: true });
  if (!proposal.success) return undefined;
  const negotiated = { ...proposal.appointment, sourceMessageIds };
  const confirmed = transitionAppointment(negotiated, "confirmed", now);
  return confirmed.success ? { ...confirmed.appointment, sourceMessageIds } : negotiated;
}
