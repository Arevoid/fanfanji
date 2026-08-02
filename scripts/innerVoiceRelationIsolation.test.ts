import assert from "node:assert/strict";
import type { InnerVoiceRecord } from "../src/types";
import {
  findInnerVoiceByMessage,
  listInnerVoicesByRelation,
  removeInnerVoicesByCharacter,
  removeInnerVoicesByRelation,
} from "../src/core/storage/repositories/innerVoiceRepository";
import { buildInnerVoicePrompt } from "../src/domain/prompt/innerVoicePrompt";
import type { Character, Message } from "../src/types";

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

const promptCharacter = {
  id: "character-1",
  name: "范千",
  personality: "嘴硬但记得共同经历",
  backstory: "",
} as Character;
const triggerMessage = {
  id: "trigger-1",
  characterId: "character-1",
  relationId: "relation-one",
  conversationId: "direct:relation-one",
  sender: "user",
  content: "老公~",
  timestamp: 100,
} as Message;
const offlineContinuityContext = "用户接受了范千的表白，双方正式确立恋爱关系。";
const innerVoicePrompt = buildInnerVoicePrompt({
  character: promptCharacter,
  relationship: {
    id: "relation-one",
    characterId: "character-1",
    userIdentityId: "identity-one",
    conversationId: "direct:relation-one",
    relationship: "friend",
    createdAt: 1,
    updatedAt: 1,
  },
  relationId: "relation-one",
  triggerMessage,
  recentMessages: [triggerMessage],
  userName: "饭饭",
  offlineContinuityContext,
});
assert.match(innerVoicePrompt, /双方正式确立恋爱关系/, "inner voice receives the just-ended offline relationship fact");
assert.match(innerVoicePrompt, /若旧关系标签与线下明确确立的新关系冲突，以线下新事实为准/, "new offline facts override a stale relationship label");

console.log("PASS inner voice relation isolation and cascade cleanup");
