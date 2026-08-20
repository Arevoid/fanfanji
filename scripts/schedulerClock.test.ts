import assert from "node:assert/strict";
import { getSchedulerNow } from "../src/core/scheduler/schedulerClock";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
Object.assign(globalThis, { window: { localStorage } });

assert.equal(getSchedulerNow(10_000), 10_000);
assert.equal(getSchedulerNow(9_000), 10_000, "a wall-clock rollback cannot expire a cooldown early");
assert.equal(getSchedulerNow(10_500), 10_500, "the logical clock resumes once wall time catches up");
console.log("PASS scheduler logical clock protects cooldowns and leases from wall-clock rollback");
