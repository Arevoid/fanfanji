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
const { ForumStoryEngagementService } = await import("../src/features/forumStory/services/forumStoryEngagementService");

const storyId = "story-engagement-a";
const otherStoryId = "story-engagement-b";
const threadId = `${storyId}:thread:main`;
const otherThreadId = `${otherStoryId}:thread:main`;
const now = 70_000;

for (const [id, threadIdValue] of [[storyId, threadId], [otherStoryId, otherThreadId]] as const) {
  ForumStoryRepository.createStory({
    id,
    title: "Engagement story",
    seed: "Engagement seed",
    premise: "A public story for simulated engagement",
    status: "active",
    creationSource: "user",
    createdAt: now,
    updatedAt: now,
    currentEpisode: 1,
    mainThreadId: threadIdValue,
    version: 1,
  });
  StoryThreadRepository.createThread({
    id: threadIdValue,
    storyId: id,
    title: "公开讨论帖",
    initialContent: "这是一个故事主题。",
    status: "open",
    episode: 1,
    createdAt: now,
    updatedAt: now,
  });
}

const originalUpdatedAt = StoryThreadRepository.getThread(storyId, threadId)!.updatedAt;
const viewed = ForumStoryEngagementService.recordView({ storyId, threadId, amount: 3 });
assert.equal(viewed.viewCount, 3);
assert.equal(viewed.updatedAt, originalUpdatedAt, "views must not advance narrative timestamps");
assert.equal(StoryThreadRepository.getThread(otherStoryId, otherThreadId)?.viewCount, 0);

const likedThread = ForumStoryEngagementService.addLike({ storyId, threadId });
assert.equal("likeCount" in likedThread ? likedThread.likeCount : undefined, 1);
ForumStoryEngagementService.addLike({ storyId, threadId, amount: 2 });
assert.equal(StoryThreadRepository.getThread(storyId, threadId)?.likeCount, 3);
assert.throws(() => ForumStoryEngagementService.addLike({ storyId, threadId, amount: 0 }), /positive integer/);

const author = {
  id: `${storyId}:character:author`,
  storyId,
  identity: { name: "楼主", actorKey: `${storyId}:actor:author` },
  role: "author",
  personaSummary: "记录公开信息。",
  knowledgeScope: [],
  isAuthor: true,
  status: "active" as const,
  createdAt: now,
  updatedAt: now,
};
const replyBase = {
  storyId,
  threadId,
  ownerIdentityId: `story-scope:${storyId}`,
  floor: 2,
  publicAuthor: { displayName: "故事网友", kind: "virtual" as const, isAnonymous: false },
  source: "ai-virtual" as const,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: now,
  updatedAt: now,
  storyAuthorType: "story_character" as const,
  storyAuthorId: author.id,
  storyCommentStyle: "ordinary" as const,
  storyCommentLabel: "普通网友",
};

const first = StoryForumReplyRepository.appendReply({
  ...replyBase,
  id: `${storyId}:reply:1`,
  body: "这条线索很关键。",
  occurredAt: now - 1_000,
});
const second = StoryForumReplyRepository.appendReply({
  ...replyBase,
  id: `${storyId}:reply:2`,
  body: "有没有人知道更多？",
  occurredAt: now - 100,
});
assert.ok(first.reply && second.reply);

const child = StoryForumReplyRepository.appendReply({
  ...replyBase,
  id: `${storyId}:reply:3`,
  body: "我补充一个公开信息。",
  occurredAt: now - 900,
  parentReplyId: first.reply!.id,
  replyToUserId: first.reply!.storyAuthorId,
});
assert.ok(child.reply);
ForumStoryEngagementService.addLike({ storyId, threadId, replyId: first.reply!.id, amount: 3 });
ForumStoryEngagementService.addLike({ storyId, threadId, replyId: second.reply!.id, amount: 1 });

const hotReplies = ForumStoryEngagementService.calculateHotReplies({
  storyId,
  threadId,
  now,
  halfLifeMs: 1_000,
});
assert.equal(hotReplies.length, 3);
assert.equal(hotReplies[0].id, first.reply!.id, "likes and direct replies should lift the first reply");
assert.ok(hotReplies.every((reply) => typeof reply.hotScore === "number"));
assert.ok(hotReplies.every((left, index) => index === 0 || left.hotScore <= hotReplies[index - 1].hotScore));
assert.equal(StoryForumReplyRepository.listReplies(storyId, threadId).find((reply) => reply.id === first.reply!.id)?.hotScore, hotReplies[0].hotScore);

const otherReply = StoryForumReplyRepository.appendReply({
  ...replyBase,
  storyId: otherStoryId,
  threadId: otherThreadId,
  ownerIdentityId: `story-scope:${otherStoryId}`,
  storyAuthorId: `${otherStoryId}:character:author`,
  id: `${otherStoryId}:reply:1`,
  body: "另一个故事的评论。",
  occurredAt: now,
});
assert.ok(otherReply.reply);
assert.throws(() => ForumStoryEngagementService.addLike({ storyId, threadId, replyId: otherReply.reply!.id }), /does not exist/);
assert.equal(StoryForumReplyRepository.listReplies(otherStoryId, otherThreadId)[0].likeCount, 0);
assert.equal(values.has("phone_forum_replies"), false, "engagement must not write live Forum data");

console.log("forum story engagement tests passed");
