import assert from "node:assert/strict";
import {
  ForumStorySchedulerPolicy,
  DEFAULT_FORUM_STORY_SCHEDULER_POLICY,
  selectForumStoriesForCheck,
  type ForumStorySchedulerPolicyInput,
} from "../src/domain/forumStory/forumStorySchedulerPolicy";
import type { ForumStory, ForumStoryExecutionLog } from "../src/domain/forumStory/forumStoryTypes";

const makeStory = (id: string, status: ForumStory["status"] = "active"): ForumStory => ({
  id,
  title: id,
  seed: "public seed",
  premise: "public premise",
  status,
  creationSource: "user",
  createdAt: 0,
  updatedAt: 0,
  currentEpisode: 1,
  version: 1,
});

const log = (
  storyId: string,
  status: ForumStoryExecutionLog["status"],
  startedAt: number,
  finishedAt?: number,
): ForumStoryExecutionLog => ({
  id: `${storyId}:${status}:${startedAt}`,
  storyId,
  action: "generate_update",
  trigger: "time",
  status,
  startedAt,
  ...(finishedAt === undefined ? {} : { finishedAt }),
});

const baseInput = (overrides: Partial<ForumStorySchedulerPolicyInput> = {}): ForumStorySchedulerPolicyInput => ({
  stories: [makeStory("story-a")],
  now: 1_000,
  executionLogs: [],
  policy: {
    successCooldownMs: 100,
    failureRetryDelayMs: 100,
    runningLeaseMs: 100,
  },
  ...overrides,
});

assert.deepEqual(selectForumStoriesForCheck(baseInput()), [
  { storyId: "story-a", reason: "Active story has not been checked" },
]);
assert.deepEqual(ForumStorySchedulerPolicy.select(baseInput()).map((item) => item.storyId), ["story-a"]);

const filtered = selectForumStoriesForCheck(baseInput({
  stories: [
    makeStory("story-a"),
    makeStory("story-a"),
    makeStory("story-waiting", "waiting_update"),
    makeStory("story-completed", "completed"),
    { ...makeStory("story-archived"), status: "archived" } as unknown as ForumStory,
  ],
}));
assert.deepEqual(filtered.map((item) => item.storyId), ["story-a"], "only active stories are selected once");

assert.deepEqual(selectForumStoriesForCheck(baseInput({
  executionLogs: [log("story-a", "success", 800, 950)],
})), [], "recent success must be cooled down");
const successReady = selectForumStoriesForCheck(baseInput({
  executionLogs: [log("story-a", "success", 700, 850)],
}));
assert.equal(successReady[0].reason, "Successful execution cooldown elapsed");

assert.deepEqual(selectForumStoriesForCheck(baseInput({
  executionLogs: [log("story-a", "running", 950)],
})), [], "recent running execution must block duplicate checks");
const staleRunning = selectForumStoriesForCheck(baseInput({
  executionLogs: [log("story-a", "running", 800)],
}));
assert.equal(staleRunning[0].reason, "Previous execution is stale; checking again");

assert.deepEqual(selectForumStoriesForCheck(baseInput({
  executionLogs: [log("story-a", "failed", 900, 950)],
})), [], "failure retry delay must be respected");
const failureReady = selectForumStoriesForCheck(baseInput({
  executionLogs: [log("story-a", "failed", 700, 850)],
}));
assert.equal(failureReady[0].reason, "Retrying after the failure retry delay");

const isolated = selectForumStoriesForCheck(baseInput({
  stories: [makeStory("story-a"), makeStory("story-b")],
  executionLogs: [log("story-b", "success", 700, 850)],
}));
assert.deepEqual(isolated.map((item) => item.storyId), ["story-a", "story-b"], "logs cannot cross story scope");

assert.deepEqual(selectForumStoriesForCheck(baseInput({ now: Number.NaN })), []);
assert.deepEqual(selectForumStoriesForCheck(baseInput({
  policy: { successCooldownMs: -1 },
})), []);
assert.equal(DEFAULT_FORUM_STORY_SCHEDULER_POLICY.runningLeaseMs > 0, true);

console.log("forum story scheduler policy tests passed");
