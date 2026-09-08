import assert from "node:assert/strict";
import type {
  ForumStory,
  ForumStoryStatus,
  StoryCharacter,
  StoryEvent,
  StoryThread,
  StoryUpdate,
} from "../src/domain/forumStory/forumStoryTypes";

const now = 1_000;

const story: ForumStory = {
  id: "story-a",
  title: "雨夜的蓝色雨伞",
  seed: "楼主在雨夜发现一把不属于自己的蓝色雨伞。",
  premise: "一个公开论坛中的小谜团。",
  status: "draft",
  creationSource: "user",
  createdAt: now,
  updatedAt: now,
  currentEpisode: 1,
  version: 1,
};

const thread: StoryThread = {
  id: "story-thread-a",
  storyId: story.id,
  title: story.title,
  initialContent: story.premise,
  status: "open",
  forumThreadId: "forum-thread-a",
  episode: 1,
  createdAt: now,
  updatedAt: now,
};

const character: StoryCharacter = {
  id: "story-character-a",
  storyId: story.id,
  identity: { name: "楼主", actorKey: "story-a:author" },
  role: "目击者兼楼主",
  personaSummary: "谨慎、喜欢先记录再求证。",
  knowledgeScope: [],
  isAuthor: true,
  status: "active",
  createdAt: now,
  updatedAt: now,
};

const event: StoryEvent = {
  id: "story-event-a",
  storyId: story.id,
  type: "post_created",
  source: "system",
  status: "confirmed",
  summary: "故事主楼已发布。",
  sequence: 1,
  storyVersion: 1,
  occurredAt: now,
  createdAt: now,
  actorIds: [character.id],
  forumThreadId: thread.forumThreadId,
  idempotencyKey: "story-a:post-created",
};

const update: StoryUpdate = {
  id: "story-update-a",
  storyId: story.id,
  updatedAt: now + 1,
  content: "我又翻了一遍照片，发现右下角的时间标记不对。",
  triggerReason: "manual",
  status: "candidate",
  eventIds: [event.id],
  createdAt: now + 1,
};

assert.equal(story.status, "draft");
assert.equal(thread.status, "open");
assert.equal(character.storyId, story.id);
assert.equal(event.type, "post_created");
assert.equal(update.triggerReason, "manual");
assert.deepEqual(
  ["draft", "active", "waiting_update", "completed"] satisfies readonly ForumStoryStatus[],
  ["draft", "active", "waiting_update", "completed"],
);

const storyB: ForumStory = {
  ...story,
  id: "story-b",
  title: "另一条独立故事",
  status: "active",
};
const threadB: StoryThread = { ...thread, id: "story-thread-b", storyId: storyB.id };
assert.notEqual(story.id, storyB.id);
assert.equal(thread.storyId, story.id);
assert.equal(threadB.storyId, storyB.id);
assert.notEqual(thread.storyId, threadB.storyId, "StoryThread 必须绑定自己的 story scope");

const domainRecords: readonly object[] = [story, thread, character, event, update];
const forbiddenKeys = ["userIdentityId", "relationId", "memory", "Memory", "relationship", "Relationship"];
for (const record of domainRecords) {
  for (const key of forbiddenKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(record, key), false, `禁止字段泄漏: ${key}`);
  }
}

console.log("forum story domain type tests passed");
