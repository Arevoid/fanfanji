import assert from "node:assert/strict";
import { acquireBackgroundTaskLease, releaseBackgroundTaskLease, renewBackgroundTaskLease } from "../src/core/scheduler/schedulerTaskRepository";

const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
Object.assign(globalThis, { window: { localStorage } });

assert.equal(acquireBackgroundTaskLease("task", "tab-a", 1000, 5000), true);
assert.equal(acquireBackgroundTaskLease("task", "tab-b", 2000, 5000), false);
assert.equal(renewBackgroundTaskLease("task", "tab-a", 4000, 5000), true);
assert.equal(acquireBackgroundTaskLease("task", "tab-b", 7000, 5000), false);
assert.equal(acquireBackgroundTaskLease("task", "tab-b", 10000, 5000), true);
assert.equal(releaseBackgroundTaskLease("task", "tab-b"), true);
assert.equal(acquireBackgroundTaskLease("task", "tab-a", 11000, 5000), true);
console.log("PASS scheduler lease prevents duplicate active task execution across tabs");
