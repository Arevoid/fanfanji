export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number | undefined => {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
};

const getLocalDateTimeParts = (timestamp: number): ZonedDateTimeParts => {
  const date = new Date(timestamp);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
  };
};

/** Reads an instant as calendar-clock fields in the requested IANA timezone. */
export function getZonedDateTimeParts(timestamp: number, timeZone?: string): ZonedDateTimeParts {
  if (!timeZone) return getLocalDateTimeParts(timestamp);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const year = getPart(parts, "year");
    const month = getPart(parts, "month");
    const day = getPart(parts, "day");
    const hour = getPart(parts, "hour");
    const minute = getPart(parts, "minute");
    const second = getPart(parts, "second");
    if ([year, month, day, hour, minute, second].some((value) => value === undefined)) {
      throw new Error("Incomplete timezone date-time parts");
    }
    return {
      year: year!,
      month: month!,
      day: day!,
      hour: hour!,
      minute: minute!,
      second: second!,
      millisecond: new Date(timestamp).getMilliseconds(),
    };
  } catch {
    // Keep legacy behavior for an absent/invalid timezone while ensuring that
    // callers with a valid timezone never depend on the runner's local clock.
    return getLocalDateTimeParts(timestamp);
  }
}

/** Adds calendar days without letting the host timezone change the date. */
export function addCalendarDays(parts: ZonedDateTimeParts, days: number): ZonedDateTimeParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** Converts calendar-clock fields in an IANA timezone to an epoch timestamp. */
export function zonedDateTimeToTimestamp(parts: ZonedDateTimeParts, timeZone?: string): number {
  if (!timeZone) {
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ).getTime();
  }

  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  let timestamp = utcGuess;
  try {
    // Iterating resolves the timezone offset while keeping the requested
    // calendar date/time stable, including daylight-saving transitions.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const local = getZonedDateTimeParts(timestamp, timeZone);
      const representedUtc = Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
        local.millisecond,
      );
      timestamp = utcGuess - (representedUtc - timestamp);
    }
    return timestamp;
  } catch {
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ).getTime();
  }
}
