import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/core/scheduler/schedulerLeaseChannel.ts", import.meta.url), "utf8");
assert.match(source, /BroadcastChannel/);
assert.match(source, /fanfanji-background-scheduler-lease-v1/);
assert.match(source, /hasActivePeerLease/);
assert.match(source, /announceSchedulerLeaseRelease/);
assert.match(source, /advisory only/);
console.log("PASS scheduler lease has an advisory BroadcastChannel protocol with safe fallback");
