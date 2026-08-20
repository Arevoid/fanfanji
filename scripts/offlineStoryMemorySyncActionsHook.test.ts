import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const memoryHook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryMemorySyncActions.ts", import.meta.url), "utf8");

assert.match(appOffline, /useOfflineStoryMemorySyncActions/);
assert.match(appOffline, /const \{ handleSyncMemoryToBrain \} = useOfflineStoryMemorySyncActions/);
assert.doesNotMatch(appOffline, /const handleSyncMemoryToBrain\s*=\s*async/);
assert.match(memoryHook, /memorySyncInFlightRef\.current\.add\(story\.id\)/);
assert.match(memoryHook, /canSyncOfflineStoryToMemory\(offlineStoryPolicyInput\)/);
assert.match(memoryHook, /createOfflineGroupParticipantMemories/);
assert.match(memoryHook, /appendKnowledgeClaims\(result\.acceptedClaims\)/);
assert.match(memoryHook, /applyConfirmedOfflineRelationshipTransition/);
assert.match(memoryHook, /memorySyncStatus: "failed"/);

console.log("PASS offline story memory sync is isolated with policy, group-scope, fallback, and failure handling");
