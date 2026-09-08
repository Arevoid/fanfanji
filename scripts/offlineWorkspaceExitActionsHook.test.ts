import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineWorkspaceExitActions.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /await storyPersistenceRef\.current/);
assert.match(hook, /clearActiveStorySnapshot/);
assert.match(hook, /未找到当前身份对应的线上聊天关系/);
assert.match(appOffline, /useOfflineWorkspaceExitActions/);
assert.doesNotMatch(appOffline, /const handleExitStoryWorkspace =/);
assert.doesNotMatch(appOffline, /const handleReturnToOnlineChat =/);

console.log("PASS offline workspace exit actions are isolated behind its hook");
