import { strict as assert } from "node:assert";
import type { Character, Message } from "../src/types";
import { createChatContext, readChatConversationId, readChatRelationId, readChatUserIdentityId } from "../src/features/chat/context/chatContext";
import { createChatUserMessage, formatQuotedChatInput } from "../src/features/chat/controllers/chatController";

const character = { id: "char-1", name: "小狸花", remark: "狸花" } as Character;
const quotedMessage = {
  id: "message-1",
  characterId: "char-1",
  sender: "character",
  content: "[文件]|备忘录|正文内容",
  timestamp: 1,
} as Message;

assert.equal(
  formatQuotedChatInput("请看看", quotedMessage, character),
  "「引用 狸花：[文件] 备忘录」\n请看看",
);
const groupCharacter = { id: "group-1", name: "不请自来的某两人", isGroupChat: true } as Character;
assert.equal(
  formatQuotedChatInput("好的", { ...quotedMessage, senderId: "member-1" }, groupCharacter, "书容"),
  "「引用 书容：[文件] 备忘录」\n好的",
);

const context = createChatContext({
  characterId: "char-1",
  relationId: "relation-1",
  conversationId: "direct:relation-1",
  userIdentityId: "identity-2",
});
assert.equal(readChatRelationId(context), "relation-1");
assert.equal(readChatConversationId(context), "direct:relation-1");
assert.equal(readChatUserIdentityId(context), "identity-2");
assert.equal(createChatContext().userIdentityId, "identity-1");
const createdMessage = createChatUserMessage({ characterId: "char-1", content: "你好", isOfflineModeActive: false, isInputNarration: false });
assert.equal(createdMessage.sender, "user");
assert.equal(createdMessage.characterId, "char-1");

console.log("Chat controller/context: 7 fixed acceptance checks passed");
