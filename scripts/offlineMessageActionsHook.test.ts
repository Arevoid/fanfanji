import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineMessageActions.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /saveActiveStorySnapshot/);
assert.match(hook, /剧情记录已删除/);
assert.match(hook, /filter\(\(message\) => message\.id !== messageId\)/);
assert.match(appOffline, /useOfflineMessageActions/);
assert.doesNotMatch(appOffline, /const handleDeleteMessage =/);

console.log("PASS offline message actions are isolated behind its hook");
