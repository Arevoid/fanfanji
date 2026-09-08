import type {
  CharacterRoutine,
  CharacterRoutinePeriod,
  CharacterRoutineState,
} from "./characterRoutineTypes";

const MINUTES_PER_DAY = 24 * 60;

interface RoutineClock {
  hour: number;
  minute: number;
  dayOfWeek: number;
}

const toTimestamp = (value: number | Date): number => {
  const timestamp = value instanceof Date ? value.getTime() : value;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number | undefined => {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
};

const getRoutineClock = (value: number | Date, timezone?: string): RoutineClock => {
  const timestamp = toTimestamp(value);
  if (!timezone) {
    const local = new Date(timestamp);
    return { hour: local.getHours(), minute: local.getMinutes(), dayOfWeek: local.getDay() };
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const hour = getPart(parts, "hour");
    const minute = getPart(parts, "minute");
    const year = getPart(parts, "year");
    const month = getPart(parts, "month");
    const day = getPart(parts, "day");
    if (hour === undefined || minute === undefined || year === undefined || month === undefined || day === undefined) {
      throw new Error("Incomplete timezone clock");
    }
    return { hour, minute, dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
  } catch {
    const local = new Date(timestamp);
    return { hour: local.getHours(), minute: local.getMinutes(), dayOfWeek: local.getDay() };
  }
};

const parseMinutes = (value: string): number | undefined => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return hour * 60 + minute;
};

const isWithinRange = (minuteOfDay: number, startValue: string, endValue: string): boolean => {
  const start = parseMinutes(startValue);
  const end = parseMinutes(endValue);
  if (start === undefined || end === undefined) return false;
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
};

const isWithinRanges = (
  minuteOfDay: number,
  ranges: CharacterRoutine["activeHours"],
): boolean => Boolean(ranges?.some((range) => isWithinRange(minuteOfDay, range.start, range.end)));

const getMinuteOfDay = (clock: RoutineClock): number => clock.hour * 60 + clock.minute;

/** Morning 05:00-11:59, afternoon 12:00-16:59, evening 17:00-20:59, night 21:00-04:59. */
export function classifyTimeOfDay(
  value: number | Date = Date.now(),
  timezone?: string,
): CharacterRoutinePeriod {
  const hour = getRoutineClock(value, timezone).hour;
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** Returns whether the local clock is an acceptable active window. */
export function isWithinActivePeriod(
  routine: CharacterRoutine | undefined,
  value: number | Date = Date.now(),
): boolean {
  if (!routine) return true;
  const clock = getRoutineClock(value, routine.timezone);
  const minuteOfDay = getMinuteOfDay(clock);
  if (isWithinRanges(minuteOfDay, routine.sleepHours)) return false;
  if (routine.activeHours?.length) return isWithinRanges(minuteOfDay, routine.activeHours);
  if (routine.preferredActivityPeriods?.length) {
    return routine.preferredActivityPeriods.includes(classifyTimeOfDay(value, routine.timezone));
  }
  return true;
}

/**
 * Reads the current routine state only. It never schedules or suppresses a
 * message; callers decide how to use this signal.
 */
export function getCurrentRoutineState(
  routine: CharacterRoutine | undefined,
  value: number | Date = Date.now(),
): CharacterRoutineState {
  if (!routine) return "active";
  const clock = getRoutineClock(value, routine.timezone);
  const minuteOfDay = getMinuteOfDay(clock);
  if (isWithinRanges(minuteOfDay, routine.sleepHours)) return "sleeping";
  const isRestDay = routine.restDays?.includes(clock.dayOfWeek as CharacterRoutine["restDays"] extends readonly (infer Day)[] ? Day : never) || false;
  if (!isRestDay && isWithinRanges(minuteOfDay, routine.workHours)) return "working";
  if (isRestDay) return "resting";
  if (isWithinActivePeriod(routine, value)) return "active";
  return "resting";
}

export const ROUTINE_MINUTES_PER_DAY = MINUTES_PER_DAY;
