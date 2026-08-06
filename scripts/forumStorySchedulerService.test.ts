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

const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryCharacterRepository } = await import("../src/features/forumStory/storyCharacterRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { ForumStoryExecutionLogRepository } = await import("../src/features/forumStory/forumStoryExecutionLogRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { ForumStorySchedulerService, runForumStorySchedulerTick } = await import("../src/features/forumStory/services/forumStorySchedulerService");

const makeStory = (id: string, status: "active" | "completed" = "active") => {
  const threadId = `${id}:thread:main`;
  assert.equal(ForumStoryRepository.createStory({
    id,
    title: `Story ${id}`,
    seed: "public seed",
    premise: "public premise",
    status,
    creationSource: "user",
    createdAt: 100,
    updatedAt: 100,
    currentEpisode: 1,
    mainThreadId: threadId,
    nextUpdateAt: 0,
    version: 1,
  }).success, true);
  assert.equal(StoryThreadRepository.createThread({
    id: threadId,
    storyId: id,
    title: "Public thread",
    initialContent: "Opening post",
    status: "open",
    episode: 1,
    createdAt: 100,
    updatedAt: 100,
  }).success, true);
  return threadId;
};

const addAuthorAndEvent = (storyId: string, threadId: string) => {
  assert.equal(StoryCharacterRepository.createStoryCharacter({
    id: `${storyId}:character:author`,
    storyId,
    identity: { name: "楼主", actorKey: `${storyId}:actor:author` },
    role: "author",
    personaSummary: "careful public narrator",
    knowledgeScope: [],
    isAuthor: true,
    status: "active",
    createdAt: 100,
    updatedAt: 100,
  }).success, true);
  assert.equal(StoryEventRepository.appendEvent({
    id: `${storyId}:event:post`,
    storyId,
    type: "post_created",
    source: "system",
    status: "confirmed",
    summary: "Public opening post",
    storyVersion: 1,
    occurredAt: 100,
    createdAt: 100,
    forumThreadId: threadId,
  }).success, true);
};

const successStoryId = "story-scheduler-success";
const successThreadId = makeStory(successStoryId);
addAuthorAndEvent(successStoryId, successThreadId);

const failureStoryId = "story-scheduler-failure";
makeStory(failureStoryId);

const completedStoryId = "story-scheduler-completed";
makeStory(completedStoryId, "completed");

const runningStoryId = "story-scheduler-running";
makeStory(runningStoryId);
assert.equal(ForumStoryExecutionLogRepository.createLog({
  id: `${runningStoryId}:execution:running`,
  storyId: runningStoryId,
  action: "generate_update",
  trigger: "time",
  status: "running",
  startedAt: 150,
}).success, true);

const settings = { apiKey: "test-key", selectedModel: "test-model" };
const tick = await ForumStorySchedulerService.tick({
  now: 200,
  runnerContext: {
    settings,
    updateAiCall: async () => ({ text: JSON.stringify({
      title: "A public update",
      content: "The public story advances.",
      eventProgression: "A new public clue appears.",
    }) }),
  },
});
assert.equal(tick.checked, 4);
assert.equal(tick.executed, 1, "one eligible story should execute successfully");
assert.equal(tick.failed, 1, "one story failure must be isolated");
assert.equal(tick.skipped, 2, "completed and running stories should be skipped by policy");
assert.equal(tick.results.length, 2, "only policy-selected stories are runner candidates");
assert.equal(tick.results.find((item) => item.storyId === successStoryId)?.success, true);
assert.equal(tick.results.find((item) => item.storyId === failureStoryId)?.success, false);
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(successStoryId).at(-1)?.status, "success");
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(failureStoryId).at(-1)?.status, "failed");
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(runningStoryId).length, 1, "running story must not be invoked again");
assert.equal(ForumStoryRepository.getStory(completedStoryId)?.status, "completed");

const directTick = await runForumStorySchedulerTick({ now: 200 });
assert.equal(directTick.checked, 4);

console.log("forum story scheduler service tests passed");

