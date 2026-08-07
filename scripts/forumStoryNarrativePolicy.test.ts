import assert from "node:assert/strict";
import {
  DEFAULT_FORUM_STORY_NARRATIVE_POLICY,
  ForumStoryNarrativePolicy,
  evaluateForumStoryNarrative,
  type ForumStoryNarrativeInput,
} from "../src/domain/forumStory/forumStoryNarrativePolicy";
import type { ForumStory, StoryEvent, StoryUpdate } from "../src/domain/forumStory/forumStoryTypes";

const DAY = 24 * 60 * 60 * 1000;

const story: ForumStory = {
  id: "narrative-story-a",
  title: "A narrative story",
  seed: "A seed",
  premise: "A public premise",
  status: "active",
  creationSource: "user",
  createdAt: 1_000,
  updatedAt: 1_000,
  currentEpisode: 1,
  version: 1,
};

const otherStory: ForumStory = { ...story, id: "narrative-story-b" };

const event = (
  storyId: string,
  sequence: number,
  occurredAt = 1_000 + sequence,
  status: StoryEvent["status"] = "confirmed",
): StoryEvent => ({
  id: `${storyId}:event:${sequence}`,
  storyId,
  type: sequence === 1 ? "post_created" : "comment_added",
  source: "system",
  status,
  summary: `event ${sequence}`,
  sequence,
  storyVersion: 1,
  occurredAt,
  createdAt: occurredAt,
});

const update = (storyId: string, index: number, updatedAt = 1_000 + index): StoryUpdate => ({
  id: `${storyId}:update:${index}`,
  storyId,
  updatedAt,
  content: `update ${index}`,
  triggerReason: "manual",
  status: "published",
  eventIds: [],
  createdAt: updatedAt,
});

const input = (overrides: Partial<ForumStoryNarrativeInput> = {}): ForumStoryNarrativeInput => ({
  story,
  events: [event(story.id, 1)],
  updates: [],
  now: 2_000,
  ...overrides,
});

const opening = evaluateForumStoryNarrative({
  ...input(),
  story: { ...story, status: "draft" },
  events: [],
});
assert.equal(opening.stage, "opening", "a new story starts in opening");
assert.deepEqual(opening.allowedActions, ["generate_comment", "generate_update"]);

const developing = evaluateForumStoryNarrative(input({
  events: [event(story.id, 1), event(story.id, 2)],
  updates: [update(story.id, 1)],
}));
assert.equal(developing.stage, "developing");
assert.deepEqual(ForumStoryNarrativePolicy.evaluate(input({
  events: [event(story.id, 1), event(story.id, 2)],
  updates: [update(story.id, 1)],
})), developing);

const climax = evaluateForumStoryNarrative(input({
  events: Array.from({ length: DEFAULT_FORUM_STORY_NARRATIVE_POLICY.climaxEventCount }, (_, index) =>
    event(story.id, index + 1)),
}));
assert.equal(climax.stage, "climax", "enough events reach the climax");
assert.deepEqual(climax.allowedActions, ["generate_major_update"]);

const ending = evaluateForumStoryNarrative(input({
  events: Array.from({ length: DEFAULT_FORUM_STORY_NARRATIVE_POLICY.endingEventCount }, (_, index) =>
    event(story.id, index + 1)),
}));
assert.equal(ending.stage, "ending", "enough events reach the ending");
assert.deepEqual(ending.allowedActions, ["complete_story"]);

const completed = evaluateForumStoryNarrative(input({
  story: { ...story, status: "completed" },
  events: [],
}));
assert.equal(completed.stage, "completed");
assert.deepEqual(completed.allowedActions, []);

const timeDeveloping = evaluateForumStoryNarrative(input({
  events: [event(story.id, 1)],
  now: story.createdAt + DEFAULT_FORUM_STORY_NARRATIVE_POLICY.developingDurationMs,
}));
assert.equal(timeDeveloping.stage, "developing", "time span can enter development");

const timeClimax = evaluateForumStoryNarrative(input({
  events: [event(story.id, 1)],
  now: story.createdAt + DEFAULT_FORUM_STORY_NARRATIVE_POLICY.climaxDurationMs,
}));
assert.equal(timeClimax.stage, "climax", "time span can enter the climax");

const timeEnding = evaluateForumStoryNarrative(input({
  events: [event(story.id, 1)],
  now: story.createdAt + DEFAULT_FORUM_STORY_NARRATIVE_POLICY.endingDurationMs,
}));
assert.equal(timeEnding.stage, "ending", "time span can enter the ending");

const foreignRecordsDoNotCount = evaluateForumStoryNarrative(input({
  events: [
    event(story.id, 1),
    ...Array.from({ length: DEFAULT_FORUM_STORY_NARRATIVE_POLICY.endingEventCount }, (_, index) =>
      event(otherStory.id, index + 1)),
  ],
  updates: Array.from({ length: DEFAULT_FORUM_STORY_NARRATIVE_POLICY.endingUpdateCount }, (_, index) =>
    update(otherStory.id, index + 1)),
}));
assert.equal(foreignRecordsDoNotCount.stage, "developing", "foreign story records are ignored");

const rejectedAndCancelledDoNotAdvance = evaluateForumStoryNarrative(input({
  events: Array.from({ length: DEFAULT_FORUM_STORY_NARRATIVE_POLICY.endingEventCount }, (_, index) =>
    event(story.id, index + 1, 1_000 + index, "rejected")),
  updates: Array.from({ length: DEFAULT_FORUM_STORY_NARRATIVE_POLICY.endingUpdateCount }, (_, index) => ({
    ...update(story.id, index + 1),
    status: "cancelled" as const,
  })),
}));
assert.equal(rejectedAndCancelledDoNotAdvance.stage, "opening");

const untouched = input();
const before = JSON.stringify(untouched);
evaluateForumStoryNarrative(untouched);
assert.equal(JSON.stringify(untouched), before, "narrative policy must be pure");

console.log("forum story narrative policy tests passed");
