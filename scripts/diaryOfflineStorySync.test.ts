import assert from "node:assert/strict";
import { buildDiaryPromptContext, formatDiaryPromptContext } from "../src/features/characterCognitive/promptAdapters/diaryPromptAdapter";
import { buildDiaryCognitiveContext, isDiaryEventEligible } from "../src/features/diary/services/diaryCognitiveContext";
import type { Character } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";

const character = {
  id: "char-diary",
  name: "范千",
  personality: "克制",
  backstory: "只写已确认的事",
  routine: {},
} as Character;
const relation = {
  id: "relation-diary-a",
  characterId: character.id,
  userIdentityId: "user-diary",
  conversationId: "conversation-diary-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
} as CharacterRelationship;
const confirmedOfflineEvent: CharacterEvent = {
  id: "event-offline-confirmed",
  relationId: relation.id,
  characterId: character.id,
  userIdentityId: relation.userIdentityId,
  kind: "offline_story_completed",
  summary: "线下剧情已确认：范千带来了炸鸡",
  source: "offline_story:story-a:completed",
  occurredAt: 2,
  recordedAt: 2,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};
const unconfirmedEvent = { ...confirmedOfflineEvent, id: "event-offline-unconfirmed", status: "candidate", summary: "未确认的剧情猜测" };
const foreignEvent = { ...confirmedOfflineEvent, id: "event-foreign", relationId: "relation-diary-b", userIdentityId: "other-user", summary: "其他关系的事件" };

assert.equal(isDiaryEventEligible(confirmedOfflineEvent), true);
assert.equal(isDiaryEventEligible(unconfirmedEvent), false);

const context = buildDiaryCognitiveContext({
  character,
  relation,
  events: [confirmedOfflineEvent, unconfirmedEvent, foreignEvent],
  now: 10,
});
const promptContext = buildDiaryPromptContext(context);
const prompt = formatDiaryPromptContext(promptContext);
assert.match(prompt, /线下剧情已确认：范千带来了炸鸡/);
assert.doesNotMatch(prompt, /未确认的剧情猜测/);
assert.doesNotMatch(prompt, /其他关系的事件/);
assert.doesNotMatch(prompt, /relation-diary|user-diary|event-offline/);

console.log("diaryOfflineStorySync.test.ts passed");
