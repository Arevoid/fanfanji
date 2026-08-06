import assert from "node:assert/strict";

const values = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => { values.clear(); },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  get length() { return values.size; },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: localStorageStub } });
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageStub });

const { ForumStoryExecutionLogRepository } = await import("../src/features/forumStory/forumStoryExecutionLogRepository");
const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { runForumStoryProgression } = await import("../src/features/forumStory/services/forumStoryProgressionRunner");

const logA = {
  id: "story-log-a:execution:1",
  storyId: "story-log-a",
  action: "generate_update" as const,
  trigger: "time" as const,
  status: "pending" as const,
  startedAt: 100,
};
assert.equal(ForumStoryExecutionLogRepository.createLog(logA).success, true);
assert.equal(ForumStoryExecutionLogRepository.updateLog(logA.storyId, logA.id, {
  status: "running",
}).success, true);
assert.equal(ForumStoryExecutionLogRepository.updateLog(logA.storyId, logA.id, {
  status: "success",
  finishedAt: 200,
}).success, true);
assert.deepEqual(ForumStoryExecutionLogRepository.getLogsByStoryId(logA.storyId)[0], {
  ...logA,
  status: "success",
  finishedAt: 200,
});

const logB = {
  id: "story-log-b:execution:1",
  storyId: "story-log-b",
  action: "generate_comment_reaction" as const,
  trigger: "hot_discussion" as const,
  status: "running" as const,
  startedAt: 150,
};
assert.equal(ForumStoryExecutionLogRepository.createLog(logB).success, true);
assert.equal(ForumStoryExecutionLogRepository.updateLog(logB.storyId, logB.id, {
  status: "failed",
  finishedAt: 250,
  error: "simulated failure",
}).success, true);
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(logB.storyId)[0].status, "failed");
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(logB.storyId)[0].error, "simulated failure");
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(logA.storyId).length, 1, "logs are isolated by storyId");
assert.equal(ForumStoryExecutionLogRepository.updateLog(logA.storyId, logB.id, { status: "failed" }).success, false);
assert.equal(ForumStoryExecutionLogRepository.createLog({
  ...logA,
  id: "story-log-a:execution:unsafe",
  relationId: "private-relation",
} as never).success, false, "private scope fields must be rejected");

const runnerStoryId = "story-log-runner";
const runnerThreadId = `${runnerStoryId}:thread:main`;
assert.equal(ForumStoryRepository.createStory({
  id: runnerStoryId,
  title: "Runner log story",
  seed: "public seed",
  premise: "public premise",
  status: "active",
  creationSource: "user",
  createdAt: 100,
  updatedAt: 100,
  currentEpisode: 1,
  mainThreadId: runnerThreadId,
  nextUpdateAt: 1_000_000,
  version: 1,
}).success, true);
assert.equal(StoryThreadRepository.createThread({
  id: runnerThreadId,
  storyId: runnerStoryId,
  title: "Runner thread",
  initialContent: "Opening post",
  status: "open",
  episode: 1,
  createdAt: 100,
  updatedAt: 100,
}).success, true);
const runnerNoop = await runForumStoryProgression(runnerStoryId, { now: 200 });
assert.deepEqual(runnerNoop, { success: true, action: "none" });
const runnerLog = ForumStoryExecutionLogRepository.getLogsByStoryId(runnerStoryId);
assert.equal(runnerLog.length, 1);
assert.equal(runnerLog[0].action, "none");
assert.equal(runnerLog[0].status, "success");

console.log("forum story execution log tests passed");

