import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appOffline = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
const creationHook = readFileSync(new URL("../src/features/offline/hooks/useOfflineStoryCreationActions.ts", import.meta.url), "utf8");

assert.match(appOffline, /useOfflineStoryCreationActions/);
assert.match(appOffline, /const \{ handleCreateStory \} = useOfflineStoryCreationActions/);
assert.doesNotMatch(appOffline, /const handleCreateStory\s*=\s*\(\)\s*=>/);
assert.match(creationHook, /多人线下至少需要选择两名参与角色/);
assert.match(creationHook, /getOfflineModeStorageKey\(relationship\.id\)/);
assert.match(creationHook, /getOfflineGroupModeStorageKey\(selectedCharacter\.id\)/);
assert.match(creationHook, /buildOfflineHandoffFacts\(relationMessages\)/);
assert.match(creationHook, /loadKnowledgeClaims\(\)\.value/);
assert.match(creationHook, /buildOfflineMemberKnowledgeSnapshots/);
assert.match(creationHook, /memberKnowledgeSnapshots/);
assert.match(creationHook, /onSaveStorySnapshot\(newStory\)/);
assert.match(creationHook, /sourceChatMsgCount: newStartFromChat \? \(importedContext\?\.messages\.length \|\| 0\)/);
assert.match(appOffline, /已尝试引用线上聊天，但当前没有可导入的消息，本故事将从空白开始/);

console.log("PASS offline story creation is isolated behind a relation/group-scoped action hook");
