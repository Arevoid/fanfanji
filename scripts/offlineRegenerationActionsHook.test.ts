import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineRegenerationActions.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /regenerateMessageId/);
assert.match(hook, /setActiveNodeMenuId\(null\)/);
assert.match(appOffline, /useOfflineRegenerationActions/);
assert.doesNotMatch(appOffline, /const handleRegenerateMessage =/);

console.log("PASS offline regeneration entry is isolated behind its hook");
