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
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryForumReplyRepository } = await import("../src/features/forumStory/storyReplyRepository");
const { executeForumStoryProgression, ForumStoryProgressionExecutor } = await import("../src/features/forumStory/services/forumStoryProgressionExecutor");

const makeStory = (id: string, status: "active" | "completed" = "active", nextUpdateAt = 1_000_000) => {
  const threadId = `${id}:thread:main`;
  const story = {
    id,
    title: `Story ${id}`,
    seed: "seed",
    premise: "A public story",
    status,
    creationSource: "user" as const,
    createdAt: 1_000,
    updatedAt: 1_000,
    currentEpisode: 1,
    mainThreadId: threadId,
    nextUpdateAt,
    version: 1,
  };
  assert.equal(ForumStoryRepository.createStory(story).success, true);
  assert.equal(StoryThreadRepository.createThread({
    id: threadId,
    storyId: id,
    title: "Story thread",
    initialContent: "Initial post",
    status: "open",
    episode: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
  }).success, true);
  return { story, threadId };
};

const appendHotReply = (storyId: string, threadId: string, id: string, hotScore: number) => {
  const result = StoryForumReplyRepository.appendReply({
    storyId,
    id,
    threadId,
    ownerIdentityId: `story-scope:${storyId}`,
    publicAuthor: { displayName: "Story user", kind: "virtual", isAnonymous: false },
    body: `Reply ${id}`,
    source: "ai-virtual",
    occurredAt: 2_000,
    baseLikeCount: 0,
    likedByIdentityIds: [],
    createdAt: 2_000,
    updatedAt: 2_000,
    storyCommentStyle: "ordinary",
    storyCommentLabel: "普通网友",
    hotScore,
  });
  assert.equal(result.success, true);
};

const timeStory = makeStory("story-executor-time");
const timePlan = executeForumStoryProgression(timeStory.story.id, { now: 1_000_000 });
assert.equal(timePlan.action, "generate_update");
assert.match(timePlan.reason, /time/i);
assert.equal(ForumStoryProgressionExecutor.execute(timeStory.story.id, { now: 1_000_000 }).action, "generate_update");

const completedStory = makeStory("story-executor-completed", "completed", 0);
const completedPlan = executeForumStoryProgression(completedStory.story.id, { now: 10_000 });
assert.equal(completedPlan.action, "none");
assert.match(completedPlan.reason, /active/i);

const hotStory = makeStory("story-executor-hot");
appendHotReply(hotStory.story.id, hotStory.threadId, "hot-reply", 20);
const hotPlan = executeForumStoryProgression(hotStory.story.id, { now: 2_000 });
assert.equal(hotPlan.action, "generate_comment_reaction");
assert.match(hotPlan.reason, /hot/i);

const isolatedStory = makeStory("story-executor-isolated");
const foreignStory = makeStory("story-executor-foreign");
appendHotReply(foreignStory.story.id, foreignStory.threadId, "foreign-hot-reply", 50);
const isolatedPlan = executeForumStoryProgression(isolatedStory.story.id, { now: 2_000 });
assert.equal(isolatedPlan.action, "none", "another story's hot reply must not trigger this story");
const crossThreadPlan = executeForumStoryProgression(isolatedStory.story.id, {
  threadId: foreignStory.threadId,
  now: 2_000,
});
assert.equal(crossThreadPlan.action, "none", "a foreign thread selector must be rejected");

assert.equal(executeForumStoryProgression("missing-story", { now: 2_000 }).action, "none");

console.log("forum story progression executor tests passed");

