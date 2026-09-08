import assert from "node:assert/strict";
import type { ForumStory, StoryEvent, StoryThread, StoryUpdate } from "../src/domain/forumStory/forumStoryTypes";

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

const {
  ForumStoryRepository,
} = await import("../src/features/forumStory/forumStoryRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { StoryUpdateRepository } = await import("../src/features/forumStory/storyUpdateRepository");

const storyA: ForumStory = {
  id: "story-a",
  title: "雨夜的蓝色雨伞",
  seed: "楼主在雨夜发现一把不属于自己的蓝色雨伞。",
  premise: "一个公开论坛中的小谜团。",
  status: "draft",
  creationSource: "user",
  createdAt: 100,
  updatedAt: 100,
  currentEpisode: 1,
  version: 1,
};
const storyB: ForumStory = {
  ...storyA,
  id: "story-b",
  title: "另一条独立故事",
};

assert.equal(ForumStoryRepository.createStory(storyA).success, true);
assert.equal(ForumStoryRepository.createStory(storyB).success, true);
assert.deepEqual(ForumStoryRepository.getStory(storyA.id), storyA);
assert.deepEqual(ForumStoryRepository.listStories().map((story) => story.id), [storyA.id, storyB.id]);

assert.equal(ForumStoryRepository.updateStory(storyA.id, { status: "active", updatedAt: 200 }).success, true);
assert.equal(ForumStoryRepository.getStory(storyA.id)?.status, "active");
assert.equal(ForumStoryRepository.getStory(storyA.id)?.updatedAt, 200);
assert.equal(ForumStoryRepository.getStory(storyB.id)?.status, "draft", "更新必须限制在目标 story scope");

const threadA: StoryThread = {
  id: "thread-shared",
  storyId: storyA.id,
  title: storyA.title,
  initialContent: storyA.premise,
  status: "open",
  forumThreadId: "forum-thread-a",
  episode: 1,
  createdAt: 101,
  updatedAt: 101,
};
const threadB: StoryThread = { ...threadA, storyId: storyB.id, forumThreadId: "forum-thread-b" };
assert.equal(StoryThreadRepository.createThread(threadA).success, true);
assert.equal(StoryThreadRepository.createThread(threadB).success, true);
assert.equal(StoryThreadRepository.getThread(storyA.id, threadA.id)?.forumThreadId, "forum-thread-a");
assert.equal(StoryThreadRepository.getThread(storyB.id, threadB.id)?.forumThreadId, "forum-thread-b");
assert.equal(StoryThreadRepository.updateThread(storyA.id, threadA.id, { status: "closed", updatedAt: 300 }).success, true);
assert.equal(StoryThreadRepository.getThread(storyA.id, threadA.id)?.status, "closed");
assert.equal(StoryThreadRepository.getThread(storyB.id, threadB.id)?.status, "open");

const eventA: StoryEvent = {
  id: "event-shared",
  storyId: storyA.id,
  type: "post_created",
  source: "system",
  status: "confirmed",
  summary: "故事 A 的主楼已发布。",
  sequence: 1,
  storyVersion: 1,
  occurredAt: 110,
  createdAt: 110,
  forumThreadId: threadA.forumThreadId,
  idempotencyKey: "post-created",
};
const eventB: StoryEvent = { ...eventA, storyId: storyB.id, summary: "故事 B 的主楼已发布。", forumThreadId: threadB.forumThreadId };
assert.equal(StoryEventRepository.appendEvent(eventA).success, true);
assert.equal(StoryEventRepository.appendEvent(eventB).success, true);
assert.deepEqual(StoryEventRepository.listEvents(storyA.id).map((event) => event.summary), [eventA.summary]);
assert.deepEqual(StoryEventRepository.listEvents(storyB.id).map((event) => event.summary), [eventB.summary]);

const replacementAttempt: StoryEvent = { ...eventA, summary: "试图覆盖历史事件。" };
assert.equal(StoryEventRepository.appendEvent(replacementAttempt).success, false, "历史事件不可覆盖");
assert.equal(StoryEventRepository.listEvents(storyA.id)[0]?.summary, eventA.summary);
const loadedEvent = StoryEventRepository.listEvents(storyA.id)[0] as StoryEvent & { summary: string };
loadedEvent.summary = "只修改读取结果，不应写回存储。";
assert.equal(StoryEventRepository.listEvents(storyA.id)[0]?.summary, eventA.summary, "读取结果不可改变持久化历史");

const updateA: StoryUpdate = {
  id: "update-a",
  storyId: storyA.id,
  updatedAt: 400,
  content: "我又翻了一遍照片。",
  triggerReason: "manual",
  status: "published",
  eventIds: [eventA.id],
  forumReplyId: "forum-reply-a",
  createdAt: 400,
};
assert.equal(StoryUpdateRepository.appendUpdate(updateA).success, true);
assert.deepEqual(StoryUpdateRepository.listUpdates(storyA.id).map((update) => update.id), [updateA.id]);
assert.deepEqual(StoryUpdateRepository.listUpdates(storyB.id), []);

const forbiddenStory = { ...storyA, id: "story-forbidden", userIdentityId: "identity-a" } as ForumStory & { userIdentityId: string };
assert.equal(ForumStoryRepository.createStory(forbiddenStory).success, false, "禁止把 userIdentityId 写入 story scope");
const forbiddenEvent = { ...eventA, id: "event-forbidden", Memory: { secret: "private" } } as StoryEvent & { Memory: object };
assert.equal(StoryEventRepository.appendEvent(forbiddenEvent).success, false, "禁止把 Memory 写入 story scope");

assert.equal(values.has("phone_forum_threads"), false, "Story storage 不得改写旧 Forum key");
console.log("forum story storage tests passed");
