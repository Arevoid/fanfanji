import assert from "node:assert/strict";
import {
  clearScheduledMemoryProjectionDrainForTests,
  scheduleMemoryProjectionDrain,
} from "../src/core/memory/memoryProjectionDrainScheduler";

clearScheduledMemoryProjectionDrainForTests();
assert.equal(scheduleMemoryProjectionDrain(), true);
assert.equal(scheduleMemoryProjectionDrain(), false, "multiple realtime jobs coalesce into one pending timer");
clearScheduledMemoryProjectionDrainForTests();
assert.equal(scheduleMemoryProjectionDrain(), true, "a later enqueue can schedule a new bounded drain");
clearScheduledMemoryProjectionDrainForTests();

console.log("memory projection drain scheduler coalescing tests passed");
