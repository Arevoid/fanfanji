import assert from "node:assert/strict";
import {
  ForumStoryEventPlanner,
  planForumStoryEvent,
  type ForumStoryEventPlan,
  type ForumStoryEventPlannerInput,
} from "../src/domain/forumStory/forumStoryEventPlanner";
import type { ForumStory, StoryEvent } from "../src/domain/forumStory/forumStoryTypes";

const story: ForumStory = {
  id: "planner-story-a",
  title: "Planner story",
  seed: "A seed",
  premise: "A public premise",
  status: "active",
  creationSource: "user",
  createdAt: 1_000,
  updatedAt: 1_000,
  currentEpisode: 1,
  version: 1,
};

const otherStory: ForumStory = { ...story, id: "planner-story-b" };

const event = (
  storyId: string,
  type: StoryEvent["type"],
  sequence: number,
  status: StoryEvent["status"] = "confirmed",
): StoryEvent => ({
  id: `${storyId}:${type}:${sequence}`,
  storyId,
  type,
  source: "system",
  status,
  summary: `${type} ${sequence}`,
  sequence,
  storyVersion: 1,
  occurredAt: 1_000 + sequence,
  createdAt: 1_000 + sequence,
});

const input = (overrides: Partial<ForumStoryEventPlannerInput> = {}): ForumStoryEventPlannerInput => ({
  story,
  events: [event(story.id, "post_created", 1)],
  stage: "opening",
  ...overrides,
});

const assertPlanType = (candidate: ForumStoryEventPlan | null, expected: ForumStoryEventPlan["type"]): void => {
  assert.ok(candidate);
  assert.equal(candidate.type, expected);
  assert.equal(typeof candidate.reason, "string");
  assert.ok(candidate.reason.length > 0);
  assert.ok(["low", "medium", "high"].includes(candidate.importance));
};

// Stage restrictions: opening permits reveal/interaction only.
assertPlanType(planForumStoryEvent(input()), "interaction");
assertPlanType(planForumStoryEvent(input({ events: [] })), "character_reveal");
assert.notEqual(planForumStoryEvent(input()).type, "discovery");
assert.notEqual(planForumStoryEvent(input()).type, "conflict");

// Developing progresses through discovery, conflict, then interaction.
assertPlanType(planForumStoryEvent(input({ stage: "developing" })), "discovery");
assertPlanType(planForumStoryEvent(input({
  stage: "developing",
  events: [
    event(story.id, "post_created", 1),
    event(story.id, "story_progressed", 2),
  ],
})), "conflict");
assertPlanType(planForumStoryEvent(input({
  stage: "developing",
  events: [
    event(story.id, "post_created", 1),
    event(story.id, "story_progressed", 2),
    event(story.id, "comment_added", 3),
  ],
})), "interaction");

// Climax permits conflict/resolution; once conflict exists, resolution follows.
const climaxConflict = planForumStoryEvent(input({ stage: "climax" }));
assertPlanType(climaxConflict, "conflict");
assert.equal(climaxConflict?.importance, "high");
assertPlanType(planForumStoryEvent(input({
  stage: "climax",
  events: [event(story.id, "comment_added", 1)],
})), "resolution");

// Ending only permits resolution.
const ending = planForumStoryEvent(input({ stage: "ending" }));
assertPlanType(ending, "resolution");
assert.equal(ending?.importance, "high");

// Every returned type belongs to the documented event vocabulary.
const legalTypes = new Set([
  "character_reveal",
  "conflict",
  "discovery",
  "interaction",
  "resolution",
  "daily_event",
]);
for (const stage of ["opening", "developing", "climax", "ending"] as const) {
  const candidate = planForumStoryEvent(input({ stage }));
  assert.ok(candidate);
  assert.ok(legalTypes.has(candidate.type));
}

// Foreign events cannot satisfy stage requirements for this story.
const isolated = planForumStoryEvent(input({
  stage: "developing",
  events: [
    event(story.id, "post_created", 1),
    event(otherStory.id, "story_progressed", 2),
    event(otherStory.id, "comment_added", 3),
  ],
}));
assertPlanType(isolated, "discovery");

// Completed stories and absent stories are rejected.
assert.equal(planForumStoryEvent(input({ stage: "completed" })), null);
assert.equal(planForumStoryEvent(input({ story: { ...story, status: "completed" } })), null);
assert.equal(planForumStoryEvent(input({ story: undefined })), null);

assert.deepEqual(
  ForumStoryEventPlanner.plan(input({ stage: "ending" })),
  ending,
);

const untouched = input({
  events: [event(story.id, "post_created", 1)],
});
const before = JSON.stringify(untouched);
planForumStoryEvent(untouched);
assert.equal(JSON.stringify(untouched), before, "event planner must be pure");

console.log("forum story event planner tests passed");
