import assert from "node:assert/strict";
import { acquireBackgroundTaskLease, releaseBackgroundTaskLease, renewBackgroundTaskLease } from "../src/core/scheduler/schedulerTaskRepository";

const localStorage = {
  get length() { return 0; },
  getItem: () => null,
  setItem: () => { throw new DOMException("Storage quota exceeded", "QuotaExceededError"); },
  removeItem: () => undefined,
  key: () => null,
  clear: () => undefined,
} as Storage;
Object.assign(globalThis, { window: { localStorage } });

assert.equal(acquireBackgroundTaskLease("quota-task", "tab-a", 1000, 5000), true);
assert.equal(renewBackgroundTaskLease("quota-task", "tab-a", 4000, 5000), true);
assert.equal(releaseBackgroundTaskLease("quota-task", "tab-a"), true);
console.log("PASS scheduler keeps volatile leases alive when LocalStorage is full");
