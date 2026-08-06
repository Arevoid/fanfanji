import assert from "node:assert/strict";
import {
  validateForumStoryCommentCandidates,
  validateForumStoryInitialCandidate,
  validateForumStoryUpdateCandidate,
} from "../src/features/forumStory/validators/forumStoryOutputValidator";
import { parseForumStoryInitialCandidate } from "../src/features/characterCognitive/promptAdapters/forumStoryPromptAdapter";
import { parseForumStoryCommentCandidates } from "../src/features/characterCognitive/promptAdapters/forumStoryCommentPromptAdapter";
import { parseForumStoryUpdateCandidate } from "../src/features/characterCognitive/promptAdapters/forumStoryUpdatePromptAdapter";

const validInitial = {
  title: "楼下的蓝色雨伞",
  body: "昨晚回家时，我在门口看到一把没人认领的蓝色雨伞。有人知道它是谁的吗？",
  author: { name: "楼主", role: "观察者", personaSummary: "谨慎，先记录再求证。" },
  characters: [
    { name: "楼主", role: "观察者", personaSummary: "谨慎，先记录再求证。" },
    { name: "小周", role: "邻居", personaSummary: "热心，喜欢补充生活线索。" },
  ],
  storyBackground: "故事发生在一栋连续下雨的居民楼里。",
  initialState: "雨伞的来历尚未确认。",
};

const allowed = validateForumStoryInitialCandidate(validInitial, { storyId: "story-a" });
assert.equal(allowed.allowed, true);
assert.deepEqual(allowed.rejectedReasons, []);
assert.notEqual(allowed.sanitizedData, validInitial, "allowed output should be copied before persistence");

const withForbiddenField = {
  ...validInitial,
  relationId: "relationship-private",
};
const forbidden = validateForumStoryInitialCandidate(withForbiddenField, { storyId: "story-a" });
assert.equal(forbidden.allowed, false);
assert.ok(forbidden.rejectedReasons.some((reason) => /private|real Character/i.test(reason)));
assert.equal(forbidden.sanitizedData, undefined);

const privateLeak = validateForumStoryInitialCandidate({
  ...validInitial,
  body: "PRIVATE_MEMORY_SENTINEL: this came from a private chat",
}, { storyId: "story-a" });
assert.equal(privateLeak.allowed, false);
assert.ok(privateLeak.rejectedReasons.length > 0);

const crossStory = validateForumStoryInitialCandidate({
  ...validInitial,
  storyId: "story-b",
  characters: [{
    ...validInitial.characters[0],
    storyId: "story-b",
    storyCharacterId: "story-b:character:1",
  }],
}, { storyId: "story-a" });
assert.equal(crossStory.allowed, false);
assert.ok(crossStory.rejectedReasons.some((reason) => /cross-story/i.test(reason)));

const realCharacterReference = validateForumStoryInitialCandidate({
  ...validInitial,
  metadata: { characterId: "real-character-1" },
}, { storyId: "story-a", forbiddenCharacterIds: ["real-character-1"] });
assert.equal(realCharacterReference.allowed, false);

assert.throws(() => parseForumStoryInitialCandidate(JSON.stringify({ ...validInitial, relationId: "private" })));
assert.throws(() => parseForumStoryCommentCandidates(JSON.stringify({
  comments: [{ style: "ordinary", authorName: "小周", content: "ok", conversationId: "private" }],
})));
assert.throws(() => parseForumStoryUpdateCandidate(JSON.stringify({
  content: "ok",
  eventProgression: "next",
  characterId: "real-character",
})));

const comments = validateForumStoryCommentCandidates([
  { style: "ordinary", authorName: "小周", content: "我昨晚也看见有人经过。" },
], { storyId: "story-a", storyCharacterIds: ["story-a:character:1"] });
assert.equal(comments.allowed, true);

const emptyComments = validateForumStoryCommentCandidates([], { storyId: "story-a" });
assert.equal(emptyComments.allowed, false);

const update = validateForumStoryUpdateCandidate({
  storyId: "story-a",
  content: "楼主补充了门口监控的线索。",
  eventProgression: "故事进入查找雨伞来源的阶段。",
}, { storyId: "story-a" });
assert.equal(update.allowed, true);

const emptyUpdate = validateForumStoryUpdateCandidate({}, { storyId: "story-a" });
assert.equal(emptyUpdate.allowed, false);

console.log("forum story output validator tests passed");
