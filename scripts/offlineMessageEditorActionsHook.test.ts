import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/offline/hooks/useOfflineMessageEditorActions.ts", import.meta.url), "utf8");
const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");

assert.match(hook, /saveActiveStorySnapshot/);
assert.match(hook, /修改内容已保存/);
assert.match(hook, /updatedAt: Date\.now\(\)/);
assert.match(appOffline, /useOfflineMessageEditorActions/);
assert.doesNotMatch(appOffline, /const handleSaveEdit =/);

console.log("PASS offline message editor actions are isolated behind its hook");
