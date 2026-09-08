import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryExitFinalization.ts", import.meta.url), "utf8");

assert.match(appOffline, /useOfflineStoryExitFinalization\(/);
assert.doesNotMatch(appOffline, /const finalizeStoryBeforeLeaving = async/);
assert.match(hook, /handleSyncMemoryToBrain/);
assert.match(hook, /createPendingOfflineHandoff/);
assert.match(hook, /completeAppointmentOfflineSession/);
assert.match(hook, /saveActiveStorySnapshot/);

console.log("PASS offline exit finalization preserves handoff, appointment, and persistence boundaries");
