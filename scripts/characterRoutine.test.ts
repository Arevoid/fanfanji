import assert from "node:assert/strict";
import { buildCharacterRoutine } from "../src/domain/characterLife/characterRoutine/characterRoutineBuilder";
import {
  classifyTimeOfDay,
  getCurrentRoutineState,
  isWithinActivePeriod,
} from "../src/domain/characterLife/characterRoutine/characterRoutinePolicy";

const localRoutine = buildCharacterRoutine({
  activeHours: [{ start: "09:00", end: "18:00" }],
  sleepHours: [{ start: "23:00", end: "07:00" }],
  workHours: [{ start: "09:00", end: "17:00" }],
  restDays: [0],
  preferredActivityPeriods: ["morning", "afternoon", "evening"],
  timezone: "UTC",
});
assert.ok(localRoutine);

const midday = Date.UTC(2026, 0, 5, 12, 0);
assert.equal(isWithinActivePeriod(localRoutine, midday), true);
assert.equal(getCurrentRoutineState(localRoutine, midday), "working");
assert.equal(classifyTimeOfDay(midday, "UTC"), "afternoon");

const lateNight = Date.UTC(2026, 0, 5, 23, 30);
assert.equal(isWithinActivePeriod(localRoutine, lateNight), false);
assert.equal(getCurrentRoutineState(localRoutine, lateNight), "sleeping");
assert.equal(classifyTimeOfDay(lateNight, "UTC"), "night");

const sunday = Date.UTC(2026, 0, 4, 12, 0);
assert.equal(getCurrentRoutineState(localRoutine, sunday), "resting");

const crossMidnight = buildCharacterRoutine({
  activeHours: [{ start: "20:00", end: "02:00" }],
  sleepHours: [{ start: "02:00", end: "08:00" }],
  timezone: "UTC",
});
assert.ok(crossMidnight);
assert.equal(isWithinActivePeriod(crossMidnight, Date.UTC(2026, 0, 5, 21, 0)), true);
assert.equal(isWithinActivePeriod(crossMidnight, Date.UTC(2026, 0, 6, 1, 30)), true);
assert.equal(isWithinActivePeriod(crossMidnight, Date.UTC(2026, 0, 6, 3, 0)), false);
assert.equal(getCurrentRoutineState(crossMidnight, Date.UTC(2026, 0, 6, 3, 0)), "sleeping");

const timezoneInstant = Date.UTC(2026, 0, 5, 1, 0);
const shanghaiRoutine = buildCharacterRoutine({
  activeHours: [{ start: "08:00", end: "10:00" }],
  timezone: "Asia/Shanghai",
});
const losAngelesRoutine = buildCharacterRoutine({
  activeHours: [{ start: "16:00", end: "18:00" }],
  timezone: "America/Los_Angeles",
});
assert.equal(isWithinActivePeriod(shanghaiRoutine, timezoneInstant), true, "01:00 UTC is 09:00 in Shanghai");
assert.equal(isWithinActivePeriod(losAngelesRoutine, timezoneInstant), true, "01:00 UTC is 17:00 in Los Angeles");
assert.equal(classifyTimeOfDay(timezoneInstant, "Asia/Shanghai"), "morning");
assert.equal(classifyTimeOfDay(timezoneInstant, "America/Los_Angeles"), "evening");

assert.equal(buildCharacterRoutine(undefined), undefined);
assert.equal(buildCharacterRoutine({}), undefined);
assert.equal(isWithinActivePeriod(undefined, lateNight), true);
assert.equal(getCurrentRoutineState(undefined, lateNight), "active");

console.log("PASS character routine active, sleep, work, rest-day, cross-midnight, timezone, and legacy compatibility rules");
