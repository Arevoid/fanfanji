import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineReadingState.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /OfflineReadingPreferences/);
assert.match(hook, /pendingDeleteMessageId/);
assert.match(hook, /guidanceDraft/);
assert.match(appOffline, /useOfflineReadingState/);
assert.doesNotMatch(appOffline, /const \[readingPreferences, setReadingPreferences\] = useState/);

console.log("PASS offline reading preferences and transient controls are isolated behind their hook");
