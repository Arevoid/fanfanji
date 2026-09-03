import assert from "node:assert/strict";
import { buildReadingPromptProjection } from "../src/features/reading/coReading/readingPromptAdapter";
import type { AiReadingContextProjection } from "../src/features/reading/coReading/aiReadingBoundary";
import type { ReadingRoom } from "../src/domain/reading/coReadingTypes";
import type { Character } from "../src/types";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";

const room: ReadingRoom = {
  userIdentityId: "identity-a", bookId: "book-a", readingRoomId: "room-a", relationId: "relation-a", characterId: "character-a", conversationId: "direct:relation-a",
  id: "room-a", status: "active", characterSnapshot: { characterId: "character-a", name: "沈砚" },
  settings: { sharePreciseProgress: false, allowSummon: true, allowUnreadParagraphPreview: false, spoilerPolicy: "strict" }, invitedAt: 1, createdAt: 1, updatedAt: 1,
};
const character: Character = { id: "character-a", name: "沈砚", avatar: "", personality: "寡言、谨慎，习惯先观察再下结论", backstory: "曾在边城生活多年" };
const relationship: CharacterRelationship = { id: "relation-a", characterId: "character-a", userIdentityId: "identity-a", conversationId: "direct:relation-a", relationship: "close_friend", createdAt: 1, updatedAt: 1 };
const knownAnchor = { id: "anchor-known", userIdentityId: "identity-a", bookId: "book-a", chapterId: "chapter-1", ordinal: 0, normalizedTextHash: "hash", characterStart: 0, characterEnd: 8 };
const blockedAnchor = { id: "anchor-future", userIdentityId: "identity-a", bookId: "book-a", chapterId: "chapter-9", ordinal: 0, normalizedTextHash: "future", characterStart: 9, characterEnd: 18 };
const projection: AiReadingContextProjection = { scope: room, aiReadingPace: "persona_driven", spoilerPolicy: "strict", knownFragments: [{ anchor: knownAnchor, textSnapshot: "灯影在门缝里晃动。" }], userRevealedSpoilers: [], blockedAnchorIds: [blockedAnchor.id] };
const prompt = buildReadingPromptProjection({ character, relationship, room, aiContext: projection, currentFragment: { anchor: blockedAnchor, textSnapshot: "凶手在下一章现身。" }, discussion: { userPrompt: "你觉得他为什么沉默？", recentMessages: [{ author: "user", body: "我有点担心他。" }] } });
assert.equal(prompt.priority[0], "role_card_persona");
assert.match(prompt.system, /寡言、谨慎/);
assert.match(prompt.system, /close_friend/);
assert.match(prompt.system, /第一人称/);
assert.match(prompt.system, /不要描述自己的动作/);
assert.match(prompt.user, /灯影在门缝里晃动/);
assert.match(prompt.user, /你觉得他为什么沉默/);
assert.doesNotMatch(prompt.user, /凶手在下一章现身/);
assert.doesNotMatch(prompt.system, /room-a|relation-a|book-a/);
assert.equal(prompt.blockedFragmentCount, 1);
console.log("co-reading prompt adapter tests passed");
