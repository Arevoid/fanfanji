import assert from "node:assert/strict";
import { getPeriodCalendarPhase, getPeriodCycleStats, getPeriodRecordForDate } from "../src/domain/schedule/periodCycle";
import type { PeriodRecord } from "../src/domain/schedule/calendarTypes";

const records: PeriodRecord[] = [
  { id: "period-1", schemaVersion: 1, userIdentityId: "user-1", startDate: "2026-09-10", endDate: "2026-09-14", createdAt: 1, updatedAt: 1 },
  { id: "period-2", schemaVersion: 1, userIdentityId: "user-1", startDate: "2026-09-08", endDate: "2026-09-13", createdAt: 2, updatedAt: 2 },
];

const stats = getPeriodCycleStats(records);
assert.equal(stats.cycleLength, 28);
assert.equal(stats.periodLength, 6);
assert.equal(stats.latestStartDate, "2026-09-10");

const actual = getPeriodCalendarPhase("2026-09-12", records, "2026-10-02");
assert.deepEqual(actual, { kind: "menstrual", label: "月经期", isActual: true, cycleDay: 3 });
assert.equal(getPeriodCalendarPhase("2026-09-16", records, "2026-10-02")?.kind, "follicular");
assert.equal(getPeriodCalendarPhase("2026-09-23", records, "2026-10-02")?.kind, "ovulation");
assert.equal(getPeriodCalendarPhase("2026-09-27", records, "2026-10-02")?.kind, "luteal");
assert.equal(getPeriodCalendarPhase("2026-10-08", records, "2026-10-02")?.kind, "predicted_menstrual");

const ongoing: PeriodRecord = { id: "period-ongoing", schemaVersion: 1, userIdentityId: "user-1", startDate: "2026-10-01", createdAt: 3, updatedAt: 3 };
assert.equal(getPeriodRecordForDate("2026-10-02", [ongoing], "2026-10-02")?.id, ongoing.id);
assert.equal(getPeriodRecordForDate("2026-10-05", [ongoing], "2026-10-02"), undefined);

console.log("periodCycle.test.ts passed");
