import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatRelationshipCleanupActions.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatRelationshipCleanupActions/);
assert.match(appChat, /clearFriendScopedMemory/);
assert.doesNotMatch(appChat, /const clearFriendScopedMemory = \(friendId: string, relationId: string\)/);
assert.match(hook, /removeCharacterLifeEventsForRelations/);
assert.match(hook, /removeCharacterTruthForRelations/);
assert.match(hook, /removeProactiveTopicsForRelations/);
assert.match(hook, /cleanupDiaryForRelations/);
assert.match(hook, /commitForumMutation/);
assert.match(hook, /onClearMomentState\(relationMomentIds, relationCommentIds\)/);
assert.match(hook, /getOfflineModeStorageKey/);
assert.match(hook, /USER_MEMO_MENTION_LEDGER_KEY/);

console.log("chat relationship cleanup actions hook contract passed");
