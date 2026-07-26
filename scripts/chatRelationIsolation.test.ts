import assert from "node:assert/strict";
import { createUserTextMessage } from "../src/features/chat/services/messageFactory";
import { isMessageInConversationRelation } from "../src/features/chat/services/conversationRelationScope";
import { createStableRelationId } from "../src/domain/relationship/relationshipService";
import type { Message } from "../src/types";

const characterId = "contact-shared-character";
const relationA = createStableRelationId("canonical-character", "identity-a");
const relationB = createStableRelationId("canonical-character", "identity-b");

const messageA: Message = { id: "a", characterId, relationId: relationA, conversationId: characterId, sender: "user", content: "A 的聊天", timestamp: 1 };
const messageB: Message = { id: "b", characterId, relationId: relationB, conversationId: characterId, sender: "user", content: "B 的聊天", timestamp: 2 };
const legacyContactMessage: Message = { id: "legacy", characterId, sender: "character", content: "旧联系人消息", timestamp: 3 };

const scopeA = { characterId, relationId: relationA, allowLegacyCharacterMessages: true };
const scopeB = { characterId, relationId: relationB, allowLegacyCharacterMessages: true };

assert.equal(isMessageInConversationRelation(messageA, scopeA), true);
assert.equal(isMessageInConversationRelation(messageB, scopeA), false);
assert.equal(isMessageInConversationRelation(messageA, scopeB), false);
assert.equal(isMessageInConversationRelation(messageB, scopeB), true);
assert.equal(isMessageInConversationRelation(legacyContactMessage, scopeA), true, "legacy contact messages remain readable");

const archiveScopeB = { characterId, relationId: relationB, allowLegacyCharacterMessages: false };
assert.equal(isMessageInConversationRelation(legacyContactMessage, archiveScopeB), false, "legacy shared-profile messages do not leak into a non-default relationship");

const created = createUserTextMessage({
  id: "created",
  characterId,
  relationId: relationA,
  conversationId: characterId,
  content: "new message",
  timestamp: 4,
});
assert.equal(created.relationId, relationA);
assert.equal(created.conversationId, characterId);

console.log("PASS chat messages isolate by relationId and preserve legacy contact compatibility");
