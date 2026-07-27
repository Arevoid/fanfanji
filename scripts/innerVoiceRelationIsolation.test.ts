import assert from "node:assert/strict";
import type { InnerVoiceRecord } from "../src/types";
import {
  findInnerVoiceByMessage,
  listInnerVoicesByRelation,
  removeInnerVoicesByCharacter,
  removeInnerVoicesByRelation,
} from "../src/core/storage/repositories/innerVoiceRepository";

const base = {
  characterId: "character-1",
  messageId: "message-1",
  state: "calm",
  content: "A private thought.",
  createdAt: 1,
};

// The same canonical character and message ID may exist in two user identities.
// Direct-chat identity is the relationship, never characterId alone.
const relationOne: InnerVoiceRecord = {
  ...base,
  id: "voice-relation-one",
  relationId: "relation-one",
  conversationId: "direct:relation-one",
  content: "Thought for relation one.",
  triggerMessageSummary: "one",
};
const relationTwo: InnerVoiceRecord = {
  ...base,
  id: "voice-relation-two",
  relationId: "relation-two",
  conversationId: "direct:relation-two",
  content: "Thought for relation two.",
  triggerMessageSummary: "two",
};
const groupVoice: InnerVoiceRecord = {
  ...base,
  id: "voice-group",
  groupId: "group-1",
  conversationId: "group:group-1",
  triggerMessageSummary: "group",
};

const records = [relationOne, relationTwo, groupVoice];

assert.equal(
  findInnerVoiceByMessage(records, { kind: "direct", relationId: "relation-one", messageId: "message-1" })?.id,
  relationOne.id,
);
assert.equal(
  findInnerVoiceByMessage(records, { kind: "direct", relationId: "relation-two", messageId: "message-1" })?.id,
  relationTwo.id,
);
assert.deepEqual(listInnerVoicesByRelation(records, "relation-one").map((record) => record.id), [relationOne.id]);
assert.deepEqual(listInnerVoicesByRelation(records, "relation-two").map((record) => record.id), [relationTwo.id]);

const afterRelationOneDelete = removeInnerVoicesByRelation(records, "relation-one");
assert.deepEqual(afterRelationOneDelete.map((record) => record.id).sort(), [groupVoice.id, relationTwo.id].sort());
assert.equal(
  findInnerVoiceByMessage(afterRelationOneDelete, { kind: "direct", relationId: "relation-two", messageId: "message-1" })?.id,
  relationTwo.id,
);

const afterCanonicalDelete = removeInnerVoicesByCharacter(records, "character-1");
assert.equal(afterCanonicalDelete.length, 0, "canonical deletion removes every direct and group record for that character");

console.log("PASS inner voice relation isolation and cascade cleanup");
