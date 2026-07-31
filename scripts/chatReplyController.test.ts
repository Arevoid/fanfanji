import { strict as assert } from "node:assert";
import type { Message } from "../src/types";
import { createChatRuntimeContext } from "../src/features/chat/context/chatRuntimeContext";
import { createChatReplyController } from "../src/features/chat/controllers/chatReplyController";

const userMessage = {
  id: "user-1",
  characterId: "character-1",
  sender: "user",
  content: "hello",
  timestamp: 1,
} as Message;

const calls: string[] = [];
const directContext = createChatRuntimeContext({
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "direct:relation-1",
  userIdentityId: "identity-1",
});
const directController = createChatReplyController({
  getContext: () => directContext,
  generateGroupReply: () => {
    calls.push("group");
  },
  generateDirectReply: ({ context, userMsg }) => {
    calls.push(`direct:${context.relationId}:${userMsg?.id}`);
  },
});
await directController.generate({ userMsg: userMessage });
assert.deepEqual(calls, ["direct:relation-1:user-1"]);

const groupController = createChatReplyController({
  getContext: () => createChatRuntimeContext({
    characterId: "group-1",
    conversationId: "group:group-1",
    userIdentityId: "identity-1",
    isGroup: true,
    groupId: "group-1",
  }),
  generateGroupReply: (message) => {
    calls.push(`group:${message?.id}`);
  },
  generateDirectReply: () => {
    calls.push("unexpected-direct");
  },
});
await groupController.generate({ userMsg: userMessage });
assert.deepEqual(calls, ["direct:relation-1:user-1", "group:user-1"]);

console.log("Chat reply controller: 4 fixed acceptance checks passed");
