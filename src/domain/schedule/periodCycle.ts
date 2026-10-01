import type { PeriodRecord } from "./calendarTypes";

export type PeriodPhaseKind = "menstrual" | "predicted_menstrual" | "follicular" | "ovulation" | "luteal";

export interface PeriodCalendarPhase {
  kind: PeriodPhaseKind;
  label: string;
  isActual: boolean;
  cycleDay?: number;
}

export interface PeriodCycleStats {
  cycleLength: number;
  periodLength: number;
  latestStartDate?: string;
}

const DAY_MS = 86_400_000;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

const toUtcDay = (dateKey: string): number => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const fromUtcDay = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

export const addPeriodDays = (dateKey: string, amount: number): string => fromUtcDay(toUtcDay(dateKey) + amount * DAY_MS);

export const periodDaysBetween = (fromDateKey: string, toDateKey: string): number =>
  Math.round((toUtcDay(toDateKey) - toUtcDay(fromDateKey)) / DAY_MS);

const validRecords = (records: readonly PeriodRecord[]): PeriodRecord[] => records
  .filter((record) => record.startDate)
  .slice()
  .sort((left, right) => left.startDate.localeCompare(right.startDate));

export const getPeriodCycleStats = (records: readonly PeriodRecord[]): PeriodCycleStats => {
  const sorted = validRecords(records);
  const intervals = sorted.slice(1).map((record, index) => periodDaysBetween(sorted[index].startDate, record.startDate)).filter((value) => value >= 18 && value <= 45);
  const durations = sorted.map((record) => record.endDate ? periodDaysBetween(record.startDate, record.endDate) + 1 : undefined).filter((value): value is number => value !== undefined && value >= 1 && value <= 14);
  const cycleLength = clamp(intervals.length ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length) : 28, 21, 35);
  const periodLength = clamp(durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 5, 3, 8);
  return { cycleLength, periodLength, latestStartDate: sorted.at(-1)?.startDate };
};

export const getPeriodRecordForDate = (
  dateKey: string,
  records: readonly PeriodRecord[],
  todayDateKey: string,
): PeriodRecord | undefined => records.find((record) => {
  const effectiveEnd = record.endDate || (record.startDate <= todayDateKey ? todayDateKey : record.startDate);
  return record.startDate <= dateKey && effectiveEnd >= dateKey;
});

const phaseForCycleDay = (cycleDay: number, periodLength: number, cycleLength: number): PeriodCalendarPhase => {
  if (cycleDay < periodLength) return { kind: "predicted_menstrual", label: "预测经期", isActual: false, cycleDay };
  const ovulationDay = clamp(cycleLength - 14, periodLength + 1, cycleLength - 3);
  const ovulationStart = Math.max(periodLength, ovulationDay - 1);
  const ovulationEnd = Math.min(cycleLength - 1, ovulationDay + 1);
  if (cycleDay >= ovulationStart && cycleDay <= ovulationEnd) return { kind: "ovulation", label: "排卵期", isActual: false, cycleDay };
  if (cycleDay < ovulationStart) return { kind: "follicular", label: "卵泡期", isActual: false, cycleDay };
  return { kind: "luteal", label: "黄体期", isActual: false, cycleDay };
};

export const getPeriodCalendarPhase = (
  dateKey: string,
  records: readonly PeriodRecord[],
  todayDateKey: string,
): PeriodCalendarPhase | undefined => {
  if (records.length === 0) return undefined;
  const actual = getPeriodRecordForDate(dateKey, records, todayDateKey);
  if (actual) return { kind: "menstrual", label: "月经期", isActual: true, cycleDay: periodDaysBetween(actual.startDate, dateKey) + 1 };

  const stats = getPeriodCycleStats(records);
  if (!stats.latestStartDate) return undefined;
  for (let offset = -3; offset <= 3; offset += 1) {
    const cycleStart = addPeriodDays(stats.latestStartDate, offset * stats.cycleLength);
    const cycleDay = periodDaysBetween(cycleStart, dateKey);
    if (cycleDay >= 0 && cycleDay < stats.cycleLength) return phaseForCycleDay(cycleDay, stats.periodLength, stats.cycleLength);
  }
  return undefined;
};

