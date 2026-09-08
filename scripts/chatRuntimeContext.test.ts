import { strict as assert } from "node:assert";
import { createChatUserMessage } from "../src/features/chat/controllers/chatController";
import {
  createChatRuntimeContext,
  isDirectChatRuntimeContext,
  isGroupChatRuntimeContext,
} from "../src/features/chat/context/chatRuntimeContext";
import { createDirectReplyCandidates } from "../src/features/chat/services/directChatService";
import { createCharacterTextMessage } from "../src/features/chat/services/messageFactory";

const firstContext = createChatRuntimeContext({
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "direct:relation-a",
  userIdentityId: "identity-a",
});
const secondContext = createChatRuntimeContext({
  characterId: "character-b",
  relationId: "relation-b",
  conversationId: "direct:relation-b",
  userIdentityId: "identity-b",
});

assert.equal(isDirectChatRuntimeContext(firstContext), true);
assert.equal(isGroupChatRuntimeContext(firstContext), false);
assert.equal(isGroupChatRuntimeContext(createChatRuntimeContext({ isGroup: true, groupId: "group-1" })), true);

const contextMessage = createCharacterTextMessage({
  id: "message-context",
  context: firstContext,
  content: "context reply",
  timestamp: 1,
});
assert.deepEqual(
  {
    characterId: contextMessage.characterId,
    relationId: contextMessage.relationId,
    conversationId: contextMessage.conversationId,
  },
  {
    characterId: "character-a",
    relationId: "relation-a",
    conversationId: "direct:relation-a",
  },
);

const legacyBoundaryMessage = createCharacterTextMessage({
  id: "message-legacy",
  characterId: "character-a",
  context: secondContext,
  relationId: "relation-legacy",
  conversationId: "direct:relation-legacy",
  content: "legacy reply",
  timestamp: 2,
});
assert.equal(legacyBoundaryMessage.relationId, "relation-legacy");
assert.equal(legacyBoundaryMessage.conversationId, "direct:relation-legacy");

const userMessage = createChatUserMessage({
  context: firstContext,
  content: "context message",
  isOfflineModeActive: false,
  isInputNarration: false,
});
assert.equal(userMessage.characterId, "character-a");
assert.equal(userMessage.relationId, "relation-a");
assert.equal(userMessage.conversationId, "direct:relation-a");

const firstReply = createDirectReplyCandidates({
  rawText: "reply a",
  disableBracketActions: false,
  keepPeriods: false,
  context: firstContext,
  createId: () => "reply-a",
  currentTime: () => 3,
});
const secondReply = createDirectReplyCandidates({
  rawText: "reply b",
  disableBracketActions: false,
  keepPeriods: false,
  context: secondContext,
  createId: () => "reply-b",
  currentTime: () => 4,
});
assert.equal(firstReply.messages[0].relationId, "relation-a");
assert.equal(firstReply.messages[0].conversationId, "direct:relation-a");
assert.equal(secondReply.messages[0].relationId, "relation-b");
assert.equal(secondReply.messages[0].conversationId, "direct:relation-b");

console.log("Chat runtime context: 15 fixed acceptance checks passed");
