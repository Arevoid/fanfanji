import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryManagementActions.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /clearOfflineSession/);
assert.match(hook, /onDeleteOfflineStory/);
assert.match(hook, /故事名称不能为空/);
assert.match(hook, /ifPrompt: editingStoryIfPrompt\.trim\(\)/);
assert.match(appOffline, /useOfflineStoryManagementActions/);
assert.doesNotMatch(appOffline, /const handleDeleteStory =/);
assert.doesNotMatch(appOffline, /const handleSaveStoryEdit =/);

console.log("PASS offline story management actions are isolated behind its hook");
