import type {
  CharacterRoutine,
  CharacterRoutineInput,
  CharacterRoutinePeriod,
  CharacterRoutineTimeRange,
  CharacterRoutineWeekday,
} from "./characterRoutineTypes";

const PERIODS: readonly CharacterRoutinePeriod[] = ["morning", "afternoon", "evening", "night"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const parseClock = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

const normalizeRanges = (value: unknown): CharacterRoutineTimeRange[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((range) => {
    if (!isRecord(range)) return [];
    const start = parseClock(range.start);
    const end = parseClock(range.end);
    return start && end ? [{ start, end }] : [];
  });
};

const normalizeWeekdays = (value: unknown): CharacterRoutineWeekday[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((left, right) => left - right) as CharacterRoutineWeekday[];
};

const normalizePeriods = (value: unknown): CharacterRoutinePeriod[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((period): period is CharacterRoutinePeriod =>
    typeof period === "string" && PERIODS.includes(period as CharacterRoutinePeriod)))] as CharacterRoutinePeriod[];
};

const normalizeTimezone = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return undefined;
  }
};

/**
 * Normalizes optional persisted/configured routine data without inventing a
 * routine. An empty or absent configuration remains undefined for legacy use.
 */
export function buildCharacterRoutine(input?: CharacterRoutineInput): CharacterRoutine | undefined {
  if (!input) return undefined;

  const activeHours = normalizeRanges(input.activeHours);
  const sleepHours = normalizeRanges(input.sleepHours);
  const workHours = normalizeRanges(input.workHours);
  const restDays = normalizeWeekdays(input.restDays);
  const preferredActivityPeriods = normalizePeriods(input.preferredActivityPeriods);
  const timezone = normalizeTimezone(input.timezone);

  if (activeHours.length === 0
    && sleepHours.length === 0
    && workHours.length === 0
    && restDays.length === 0
    && preferredActivityPeriods.length === 0
    && !timezone) return undefined;

  return {
    ...(activeHours.length > 0 ? { activeHours } : {}),
    ...(sleepHours.length > 0 ? { sleepHours } : {}),
    ...(workHours.length > 0 ? { workHours } : {}),
    ...(restDays.length > 0 ? { restDays } : {}),
    ...(preferredActivityPeriods.length > 0 ? { preferredActivityPeriods } : {}),
    ...(timezone ? { timezone } : {}),
  };
}
