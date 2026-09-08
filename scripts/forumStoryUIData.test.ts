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

const { listForumStoryUiItems, getForumStoryUiThread } = await import("../src/features/forumStory/forumStoryUiData");
const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { StoryForumReplyRepository } = await import("../src/features/forumStory/storyReplyRepository");
const { StoryUpdateRepository } = await import("../src/features/forumStory/storyUpdateRepository");

const createStoryFixture = (storyId: string, updatedAt: number) => {
  const threadId = `${storyId}:thread:main`;
  ForumStoryRepository.createStory({
    id: storyId,
    title: `${storyId} public story`,
    seed: "public seed",
    premise: "public premise",
    status: storyId === "story-b" ? "waiting_update" : "active",
    creationSource: "system",
    createdAt: updatedAt,
    updatedAt,
    currentEpisode: storyId === "story-b" ? 2 : 1,
    mainThreadId: threadId,
    version: storyId === "story-b" ? 2 : 1,
  });
  StoryThreadRepository.createThread({
    id: threadId,
    storyId,
    title: `${storyId} thread title`,
    initialContent: `${storyId} initial post`,
    status: "open",
    authorCharacterId: `${storyId}:character:author`,
    episode: 1,
    createdAt: updatedAt,
    updatedAt,
  });
  StoryEventRepository.appendEvent({
    id: `${storyId}:event:post`,
    storyId,
    type: "post_created",
    source: "system",
    status: "confirmed",
    summary: `${storyId} public event`,
    sequence: 1,
    storyVersion: 1,
    occurredAt: updatedAt,
    createdAt: updatedAt,
    actorIds: [`${storyId}:character:author`],
    forumThreadId: threadId,
  });
  return threadId;
};

const storyAThreadId = createStoryFixture("story-a", 10_000);
const storyBThreadId = createStoryFixture("story-b", 20_000);
StoryForumReplyRepository.appendReply({
  storyId: "story-a",
  id: "story-a:reply:1",
  threadId: storyAThreadId,
  ownerIdentityId: "story-scope:story-a",
  floor: 2,
  publicAuthor: { displayName: "故事角色A", kind: "virtual", isAnonymous: false },
  body: "A public story comment",
  source: "ai-virtual",
  occurredAt: 10_001,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: 10_001,
  updatedAt: 10_001,
  storyCommentStyle: "ordinary",
  storyCommentLabel: "普通网友",
});
StoryEventRepository.appendEvent({
  id: "story-a:event:comment",
  storyId: "story-a",
  type: "comment_added",
  source: "npc",
  status: "confirmed",
  summary: "A public story comment",
  sequence: 2,
  storyVersion: 1,
  occurredAt: 10_001,
  createdAt: 10_001,
  actorIds: ["story-a:character:commenter"],
  forumThreadId: storyAThreadId,
  forumReplyId: "story-a:reply:1",
});
StoryUpdateRepository.appendUpdate({
  id: "story-a:update:2",
  storyId: "story-a",
  title: "A public update",
  updatedAt: 10_002,
  content: "A public update body",
  eventProgression: "A public event moved forward",
  triggerReason: "manual",
  status: "published",
  eventIds: ["story-a:event:update"],
  createdAt: 10_002,
});

// A normal Forum record is present, but the Story UI adapter must not read it.
values.set("phone_forum_threads", JSON.stringify([{ id: "ordinary-thread", title: "Ordinary Forum", body: "Must stay separate" }]));

const items = listForumStoryUiItems();
assert.deepEqual(items.map((item) => item.storyId), ["story-b", "story-a"]);
assert.equal(items[1].title, "story-a public story");
assert.equal(items[1].body, "story-a initial post");
assert.equal(items[1].authorName, "匿名楼主");
assert.equal(items[1].likeCount, 0);
assert.equal(items[1].replyCount, 1);

const storyAView = getForumStoryUiThread("story-a");
assert.ok(storyAView);
assert.equal(storyAView.story.id, "story-a");
assert.equal(storyAView.thread.id, storyAThreadId);
assert.equal(storyAView.thread.initialContent, "story-a initial post");
assert.equal(storyAView.replies.length, 1);
assert.equal(storyAView.replies[0].authorName, "故事角色A");
assert.equal(storyAView.updates.length, 1);
assert.equal(storyAView.updates[0].title, "A public update");
assert.ok(storyAView.characters.some((character) => character.id === "story-a:character:author"));
assert.ok(storyAView.characters.some((character) => character.id === "story-a:character:commenter"));
assert.ok(storyAView.characters.every((character) => character.id.startsWith("story-a:")));

const storyBView = getForumStoryUiThread("story-b");
assert.ok(storyBView);
assert.equal(storyBView.replies.length, 0);
assert.equal(storyBView.updates.length, 0);
assert.equal(getForumStoryUiThread("missing-story"), undefined);
assert.equal(values.has("phone_forum_replies"), false, "ordinary Forum replies are untouched");
assert.equal(values.get("phone_forum_threads"), JSON.stringify([{ id: "ordinary-thread", title: "Ordinary Forum", body: "Must stay separate" }]));

console.log("forum story UI data tests passed");
