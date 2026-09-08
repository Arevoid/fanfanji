import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatDeleteFriendAction.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatDeleteFriendAction/);
assert.match(appChat, /const \{ handleDeleteFriend \}/);
assert.doesNotMatch(appChat, /const handleDeleteFriend = \(\) =>/);
assert.match(hook, /activeRelationship\?\.userIdentityId === activeIdentityId/);
assert.match(hook, /orphanRelationId/);
assert.match(hook, /canonical characters and sibling identities/);
assert.match(hook, /character\.isGroupChat/);
assert.match(hook, /memberIds\?\.filter/);
assert.match(hook, /setActiveChatCharId\(null\)/);
assert.match(hook, /setActiveChatRelationId\(null\)/);

console.log("chat delete friend action hook contract passed");
