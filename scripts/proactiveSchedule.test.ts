import assert from "node:assert/strict";
import { scheduleNextProactiveMessage } from "../src/features/chat/services/proactiveScheduleService";

const friend = { proactiveStartTime: "09:00", proactiveEndTime: "22:00" };
const atNoon = new Date("2026-08-20T12:00:00");
const atNine = new Date("2026-08-20T09:00:00");
const atNight = new Date("2026-08-20T23:00:00");
assert.equal(scheduleNextProactiveMessage(friend, atNoon, () => 0), atNoon.getTime());
assert.equal(scheduleNextProactiveMessage(friend, atNoon, () => 1), new Date("2026-08-20T22:00:00").getTime());
assert.equal(scheduleNextProactiveMessage(friend, atNine, () => 0), atNine.getTime());
assert.equal(scheduleNextProactiveMessage(friend, atNight, () => 0), new Date("2026-08-21T09:00:00").getTime());
const overnight = { proactiveStartTime: "22:00", proactiveEndTime: "02:00" };
assert.equal(scheduleNextProactiveMessage(overnight, new Date("2026-08-20T23:00:00"), () => 1), new Date("2026-08-21T02:00:00").getTime());
console.log("PASS proactive schedule windows preserve daytime, overnight, and next-day boundaries");
