import assert from "node:assert/strict";
import {
  DEFAULT_FORUM_STORY_PROGRESSION_POLICY,
  ForumStoryProgressionPolicy,
  canProgressForumStory,
  evaluateForumStoryProgression,
  type ForumStoryEngagementStats,
  type ForumStoryProgressionInput,
  type ForumStoryThreadStats,
} from "../src/domain/forumStory/forumStoryProgressionPolicy";
import type { ForumStory, StoryEvent } from "../src/domain/forumStory/forumStoryTypes";

const story: ForumStory = {
  id: "story-policy-a",
  title: "Policy story",
  seed: "A seed",
  premise: "A public story",
  status: "active",
  creationSource: "user",
  createdAt: 1_000,
  updatedAt: 1_000,
  currentEpisode: 1,
  mainThreadId: "story-policy-a:thread",
  nextUpdateAt: 10_000,
  version: 1,
};

const threadStats: ForumStoryThreadStats = {
  storyId: story.id,
  threadId: story.mainThreadId!,
  commentCount: 0,
};

const engagement: ForumStoryEngagementStats = {
  storyId: story.id,
  threadId: story.mainThreadId!,
  viewCount: 12,
  likeCount: 2,
  hotReplyCount: 0,
  maxHotScore: 0,
};

const event = (storyId: string, id: string, type: StoryEvent["type"] = "post_created"): StoryEvent => ({
  id,
  storyId,
  type,
  source: "system",
  status: "confirmed",
  summary: id,
  sequence: 1,
  storyVersion: 1,
  occurredAt: 1_000,
  createdAt: 1_000,
});

const input = (overrides: Partial<ForumStoryProgressionInput> = {}): ForumStoryProgressionInput => ({
  story,
  events: [event(story.id, "post-1")],
  threadStats,
  engagement,
  now: 2_000,
  ...overrides,
});

const timeDecision = evaluateForumStoryProgression(input({ now: 10_000 }));
assert.deepEqual(timeDecision, {
  canProgress: true,
  reason: "Story update time reached",
  trigger: "time",
});
assert.equal(ForumStoryProgressionPolicy.evaluate(input({ now: 10_000 })).trigger, "time");

const commentDecision = evaluateForumStoryProgression(input({
  threadStats: { ...threadStats, commentCount: DEFAULT_FORUM_STORY_PROGRESSION_POLICY.commentThreshold },
}));
assert.equal(commentDecision.canProgress, true);
assert.equal(commentDecision.trigger, "comment_activity");

const hotDecision = evaluateForumStoryProgression(input({
  engagement: { ...engagement, maxHotScore: DEFAULT_FORUM_STORY_PROGRESSION_POLICY.hotScoreThreshold },
}));
assert.equal(hotDecision.canProgress, true);
assert.equal(hotDecision.trigger, "hot_discussion");

const hotCountDecision = evaluateForumStoryProgression(input({
  engagement: { ...engagement, hotReplyCount: 1 },
}));
assert.equal(hotCountDecision.trigger, "hot_discussion");

const manualDecision = canProgressForumStory(input({ manual: true }));
assert.equal(manualDecision.canProgress, true);
assert.equal(manualDecision.trigger, "manual");

const completedDecision = evaluateForumStoryProgression(input({
  story: { ...story, status: "completed" },
  now: 20_000,
}));
assert.equal(completedDecision.canProgress, false);

const archivedDecision = evaluateForumStoryProgression(input({
  story: { ...story, status: "archived" } as unknown as ForumStory,
  now: 20_000,
}));
assert.equal(archivedDecision.canProgress, false, "archived stories cannot progress");

assert.equal(evaluateForumStoryProgression({ ...input(), story: undefined }).canProgress, false);
assert.equal(evaluateForumStoryProgression(input({
  events: [event("story-policy-other", "foreign-event")],
})).canProgress, false);
assert.equal(evaluateForumStoryProgression(input({
  threadStats: { ...threadStats, storyId: "story-policy-other" },
})).canProgress, false);
assert.equal(evaluateForumStoryProgression(input({
  engagement: { ...engagement, storyId: "story-policy-other" },
})).canProgress, false);

const untouchedInput = input();
const before = JSON.stringify(untouchedInput);
evaluateForumStoryProgression(untouchedInput);
assert.equal(JSON.stringify(untouchedInput), before, "policy must be pure and must not mutate input");

console.log("forum story progression policy tests passed");
