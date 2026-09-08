import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/features/chat/hooks/useChatGroupMemberActions.ts", import.meta.url), "utf8");

assert.match(appChat, /useChatGroupMemberActions/);
assert.match(appChat, /handleRemoveGroupMember/);
assert.match(appChat, /handleAddGroupMembers/);
assert.doesNotMatch(appChat, /const handleRemoveGroupMember =/);
assert.doesNotMatch(appChat, /const handleAddGroupMembers =/);
assert.match(hook, /memberIds\.filter/);
assert.match(hook, /您将 \$\{memberName\} 移出了群聊/);
assert.match(hook, /您邀请了 \$\{invitedNames\} 加入了群聊/);
assert.match(hook, /setShowAddMemberModal\(false\)/);

console.log("chat group member actions hook contract passed");
