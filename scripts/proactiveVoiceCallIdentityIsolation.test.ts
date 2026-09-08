import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import {
  createVoiceCallRecordMessage,
  isCurrentVoiceCallScope,
  resolveDirectVoiceCallScope,
} from "../src/features/chat/services/voiceCallScope";

const relationA = createRelationship({ id: "relation-a", characterId: "shared-character", userIdentityId: "identity-a", now: 1 });
const relationB = createRelationship({ id: "relation-b", characterId: "shared-character", userIdentityId: "identity-b", now: 1 });

const scopeA = resolveDirectVoiceCallScope({ activeIdentityId: "identity-a", relationship: relationA, isGroupChat: false });
const scopeB = resolveDirectVoiceCallScope({ activeIdentityId: "identity-b", relationship: relationB, isGroupChat: false });

assert.deepEqual(scopeA, { relationId: "relation-a", conversationId: "direct:relation-a" });
assert.deepEqual(scopeB, { relationId: "relation-b", conversationId: "direct:relation-b" });
assert.equal(resolveDirectVoiceCallScope({ activeIdentityId: "identity-b", relationship: relationA, isGroupChat: false }), undefined, "a foreign identity cannot start a call");
assert.equal(resolveDirectVoiceCallScope({ activeIdentityId: "identity-a", relationship: relationA, isGroupChat: true }), undefined, "group chats cannot use a direct voice-call scope");
assert.equal(isCurrentVoiceCallScope("relation-a", scopeA), true);
assert.equal(isCurrentVoiceCallScope("relation-a", scopeB), false, "switching identity invalidates the prior call session");

const callRecord = createVoiceCallRecordMessage({
  id: "call-record-1",
  characterId: "shared-character",
  scope: scopeB!,
  content: "[call-record]",
  timestamp: 12,
});
assert.equal(callRecord.relationId, "relation-b");
assert.equal(callRecord.conversationId, "direct:relation-b");
assert.notEqual(callRecord.relationId, relationA.id, "a second identity's record cannot fall back to the first relation");

console.log("proactive voice-call identity isolation tests passed");
