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
const { StoryForumReplyRepository } = await import("../src/features/forumStory/storyReplyRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryUpdateRepository } = await import("../src/features/forumStory/storyUpdateRepository");
const { ForumStoryExecutionLogRepository } = await import("../src/features/forumStory/forumStoryExecutionLogRepository");
const { runForumStoryProgression, ForumStoryProgressionRunner } = await import("../src/features/forumStory/services/forumStoryProgressionRunner");

const makeStory = (id: string, nextUpdateAt: number, status: "active" | "completed" = "active") => {
  const threadId = `${id}:thread:main`;
  const story = {
    id,
    title: `Story ${id}`,
    seed: "public seed",
    premise: "public premise",
    status,
    creationSource: "user" as const,
    createdAt: 100,
    updatedAt: 100,
    currentEpisode: 1,
    mainThreadId: threadId,
    nextUpdateAt,
    version: 1,
  };
  assert.equal(ForumStoryRepository.createStory(story).success, true);
  assert.equal(StoryThreadRepository.createThread({
    id: threadId,
    storyId: id,
    title: "Public story thread",
    initialContent: "A public opening post",
    status: "open",
    episode: 1,
    createdAt: 100,
    updatedAt: 100,
  }).success, true);
  return { story, threadId };
};

const addCharacter = (storyId: string, now = 100) => {
  assert.equal(StoryCharacterRepository.createStoryCharacter({
    id: `${storyId}:character:author`,
    storyId,
    identity: { name: "楼主", actorKey: `${storyId}:actor:author` },
    role: "author",
    personaSummary: "careful public narrator",
    knowledgeScope: [],
    isAuthor: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).success, true);
};

const addInitialEvent = (storyId: string, threadId: string, now = 100) => {
  assert.equal(StoryEventRepository.appendEvent({
    id: `${storyId}:event:post`,
    storyId,
    type: "post_created",
    source: "system",
    status: "confirmed",
    summary: "Public opening post",
    storyVersion: 1,
    occurredAt: now,
    createdAt: now,
    forumThreadId: threadId,
  }).success, true);
};

const settings = { apiKey: "test-key", selectedModel: "test-model" };

const updateStory = makeStory("story-runner-update", 0);
addCharacter(updateStory.story.id);
addInitialEvent(updateStory.story.id, updateStory.threadId);
const updateResult = await runForumStoryProgression(updateStory.story.id, {
  now: 200,
  settings,
  updateAiCall: async () => ({ text: JSON.stringify({
    title: "A public update",
    content: "The narrator found a new public clue.",
    eventProgression: "The public investigation advances.",
  }) }),
});
assert.equal(updateResult.success, true);
assert.equal(updateResult.action, "generate_update");
if (updateResult.success && updateResult.action === "generate_update") {
  assert.equal(updateResult.result.update.status, "published");
}
assert.equal(ForumStoryRepository.getStory(updateStory.story.id)?.status, "waiting_update");
assert.equal(StoryUpdateRepository.listUpdates(updateStory.story.id).length, 1);
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(updateStory.story.id)[0].status, "success");

const commentStory = makeStory("story-runner-comment", 1_000_000);
addCharacter(commentStory.story.id);
assert.equal(StoryForumReplyRepository.appendReply({
  id: `${commentStory.story.id}:reply:hot`,
  storyId: commentStory.story.id,
  threadId: commentStory.threadId,
  ownerIdentityId: `story-scope:${commentStory.story.id}`,
  publicAuthor: { displayName: "围观网友", kind: "virtual", isAnonymous: false },
  body: "This discussion is getting hot.",
  source: "ai-virtual",
  occurredAt: 150,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: 150,
  updatedAt: 150,
  storyCommentStyle: "gossip",
  storyCommentLabel: "吃瓜网友",
  hotScore: 20,
}).success, true);
const commentResult = await runForumStoryProgression(commentStory.story.id, {
  now: 200,
  settings,
  commentCount: 1,
  commentAiCall: async () => ({ text: JSON.stringify({ comments: [
    { style: "ordinary", authorName: "楼主", content: "我也在继续确认这个线索。" },
  ] }) }),
});
assert.equal(commentResult.success, true);
assert.equal(commentResult.action, "generate_comment_reaction");
if (commentResult.success && commentResult.action === "generate_comment_reaction") {
  assert.equal(commentResult.result.replies.length, 1);
}
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(commentStory.story.id)[0].status, "success");

const noneStory = makeStory("story-runner-none", 1_000_000);
const noneResult = await runForumStoryProgression(noneStory.story.id, { now: 200 });
assert.deepEqual(noneResult, { success: true, action: "none" });
assert.equal(ForumStoryExecutionLogRepository.getLogsByStoryId(noneStory.story.id)[0].status, "success");
assert.equal(ForumStoryProgressionRunner.run === runForumStoryProgression, true);

const completedStory = makeStory("story-runner-completed", 0, "completed");
const completedResult = await runForumStoryProgression(completedStory.story.id, {
  now: 200,
  settings,
});
assert.equal(completedResult.success, true);
assert.equal(completedResult.action, "none");

const failureStory = makeStory("story-runner-failure", 0);
addCharacter(failureStory.story.id);
addInitialEvent(failureStory.story.id, failureStory.threadId);
const beforeFailureStory = ForumStoryRepository.getStory(failureStory.story.id);
const beforeFailureEvents = StoryEventRepository.listEvents(failureStory.story.id);
const failureResult = await runForumStoryProgression(failureStory.story.id, {
  now: 200,
  settings,
  updateAiCall: async () => { throw new Error("simulated AI failure"); },
});
assert.equal(failureResult.success, false);
assert.equal(failureResult.action, "generate_update");
assert.match(failureResult.error, /simulated AI failure/);
assert.deepEqual(ForumStoryRepository.getStory(failureStory.story.id), beforeFailureStory, "failed generation must not change story state");
assert.deepEqual(StoryEventRepository.listEvents(failureStory.story.id), beforeFailureEvents, "failed generation must not append events");
assert.equal(StoryUpdateRepository.listUpdates(failureStory.story.id).length, 0);
const failureLogs = ForumStoryExecutionLogRepository.getLogsByStoryId(failureStory.story.id);
assert.equal(failureLogs[0].status, "failed");
assert.match(failureLogs[0].error || "", /simulated AI failure/);

const isolatedStory = makeStory("story-runner-isolated", 1_000_000);
const foreignStory = makeStory("story-runner-foreign", 1_000_000);
addCharacter(foreignStory.story.id);
assert.equal(StoryForumReplyRepository.appendReply({
  id: `${foreignStory.story.id}:reply:hot`,
  storyId: foreignStory.story.id,
  threadId: foreignStory.threadId,
  ownerIdentityId: `story-scope:${foreignStory.story.id}`,
  publicAuthor: { displayName: "Foreign", kind: "virtual", isAnonymous: false },
  body: "Foreign hot discussion",
  source: "ai-virtual",
  occurredAt: 150,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: 150,
  updatedAt: 150,
  storyCommentStyle: "ordinary",
  storyCommentLabel: "普通网友",
  hotScore: 50,
}).success, true);
const isolatedResult = await runForumStoryProgression(isolatedStory.story.id, { now: 200 });
assert.equal(isolatedResult.success, true);
assert.equal(isolatedResult.action, "none", "foreign story activity must not trigger this story");
const foreignThreadResult = await runForumStoryProgression(isolatedStory.story.id, {
  threadId: foreignStory.threadId,
  now: 200,
  settings,
});
assert.equal(foreignThreadResult.success, true);
assert.equal(foreignThreadResult.action, "none", "foreign thread selection must be isolated");

console.log("forum story progression runner tests passed");
