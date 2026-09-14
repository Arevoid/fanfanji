export type TemporalDistance = "just_now" | "recent" | "today" | "yesterday" | "long_ago" | "future" | "unknown";

export interface TemporalContext {
  now: number;
  nowDayKey: string;
  localHour: number;
  elapsedSinceLastInteractionMs?: number;
  elapsedSinceLastMeaningfulEventMs?: number;
  lastInteractionDistance: TemporalDistance;
  lastMeaningfulEventDistance: TemporalDistance;
  interactedToday: boolean;
  meaningfulEventToday: boolean;
  nextScheduleAt?: number;
  nextScheduleInMs?: number;
  scheduleOverdue: boolean;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const getLocalDayKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export const getElapsedDurationMs = (from: number | undefined, to: number): number | undefined =>
  typeof from === "number" && Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : undefined;

/** Relative labels are derived from timestamps and local calendar boundaries. */
export const classifyTemporalDistance = (timestamp: number | undefined, now: number): TemporalDistance => {
  if (timestamp === undefined || !Number.isFinite(timestamp) || !Number.isFinite(now)) return "unknown";
  if (timestamp > now) return "future";
  const elapsed = now - timestamp;
  if (elapsed < 2 * MINUTE) return "just_now";
  if (getLocalDayKey(timestamp) === getLocalDayKey(now)) return elapsed < 6 * HOUR ? "recent" : "today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalDayKey(timestamp) === getLocalDayKey(yesterday.getTime()) ? "yesterday" : "long_ago";
};

export const buildTemporalContext = (input: {
  now: number;
  lastInteractionAt?: number;
  lastMeaningfulEventAt?: number;
  nextScheduleAt?: number;
}): TemporalContext => {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const interactionDistance = classifyTemporalDistance(input.lastInteractionAt, now);
  const eventDistance = classifyTemporalDistance(input.lastMeaningfulEventAt, now);
  const nextScheduleInMs = getElapsedDurationMs(now, input.nextScheduleAt ?? Number.NaN);
  return {
    now,
    nowDayKey: getLocalDayKey(now),
    localHour: new Date(now).getHours(),
    ...(getElapsedDurationMs(input.lastInteractionAt, now) !== undefined
      ? { elapsedSinceLastInteractionMs: getElapsedDurationMs(input.lastInteractionAt, now) } : {}),
    ...(getElapsedDurationMs(input.lastMeaningfulEventAt, now) !== undefined
      ? { elapsedSinceLastMeaningfulEventMs: getElapsedDurationMs(input.lastMeaningfulEventAt, now) } : {}),
    lastInteractionDistance: interactionDistance,
    lastMeaningfulEventDistance: eventDistance,
    interactedToday: interactionDistance === "just_now" || interactionDistance === "recent" || interactionDistance === "today",
    meaningfulEventToday: eventDistance === "just_now" || eventDistance === "recent" || eventDistance === "today",
    ...(typeof input.nextScheduleAt === "number" && Number.isFinite(input.nextScheduleAt)
      ? { nextScheduleAt: input.nextScheduleAt } : {}),
    ...(nextScheduleInMs !== undefined ? { nextScheduleInMs } : {}),
    scheduleOverdue: typeof input.nextScheduleAt === "number" && Number.isFinite(input.nextScheduleAt) && input.nextScheduleAt < now,
  };
};

export const isSameLocalDay = (left: number, right: number): boolean => getLocalDayKey(left) === getLocalDayKey(right);
