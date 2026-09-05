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
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { generateStoryComments } = await import("../src/features/forumStory/services/forumStoryCommentService");

const now = 60_000;
const storyId = "story-threading-a";
const otherStoryId = "story-threading-b";
const threadId = `${storyId}:thread:main`;
const otherThreadId = `${otherStoryId}:thread:main`;
const author = {
  id: `${storyId}:character:author`,
  storyId,
  identity: { name: "楼主", actorKey: `${storyId}:actor:author` },
  role: "thread author",
  personaSummary: "记录公开线索。",
  knowledgeScope: [],
  isAuthor: true,
  status: "active" as const,
  createdAt: now,
  updatedAt: now,
};

for (const [id, thread] of [[storyId, threadId], [otherStoryId, otherThreadId]] as const) {
  ForumStoryRepository.createStory({
    id,
    title: "楼层测试故事",
    seed: "楼层测试",
    premise: "公开论坛楼层测试",
    status: "active",
    creationSource: "user",
    createdAt: now,
    updatedAt: now,
    currentEpisode: 1,
    mainThreadId: thread,
    version: 1,
  });
  StoryThreadRepository.createThread({
    id: thread,
    storyId: id,
    title: "谁动了门口的伞？",
    initialContent: "门口多了一把蓝伞。",
    status: "open",
    episode: 1,
    createdAt: now,
    updatedAt: now,
  });
}

const baseReply = {
  storyId,
  id: `${storyId}:reply:1`,
  threadId,
  ownerIdentityId: `story-scope:${storyId}`,
  floor: 2,
  publicAuthor: { displayName: "理性网友", kind: "virtual" as const, isAnonymous: false },
  body: "先查一下门禁和监控。",
  source: "ai-virtual" as const,
  occurredAt: now,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: now,
  updatedAt: now,
  storyAuthorType: "story_character" as const,
  storyAuthorId: author.id,
  storyCommentStyle: "rational" as const,
  storyCommentLabel: "理性分析网友",
};

const firstWrite = StoryForumReplyRepository.appendReply(baseReply);
assert.equal(firstWrite.success, true);
assert.equal(firstWrite.reply?.floorNumber, 2);
assert.equal(firstWrite.reply?.floor, 2);
assert.ok(firstWrite.reply);
const firstReply = firstWrite.reply!;

const secondWrite = StoryForumReplyRepository.appendReply({
  ...baseReply,
  id: `${storyId}:reply:2`,
  body: "我回复一下，雨水痕迹也值得看。",
  parentReplyId: firstReply.id,
  replyToUserId: firstReply.storyAuthorId,
  quoteContent: "先查一下门禁和监控。",
});
assert.equal(secondWrite.success, true);
assert.equal(secondWrite.reply?.floorNumber, 3);
assert.equal(secondWrite.reply?.parentReplyId, firstReply.id);
assert.equal(secondWrite.reply?.replyToUserId, author.id);
assert.equal(secondWrite.reply?.quoteContent, "先查一下门禁和监控。");

const otherWrite = StoryForumReplyRepository.appendReply({
  ...baseReply,
  storyId: otherStoryId,
  threadId: otherThreadId,
  ownerIdentityId: `story-scope:${otherStoryId}`,
  id: `${otherStoryId}:reply:1`,
  storyAuthorId: `${otherStoryId}:character:author`,
  body: "另一个故事的第一条回复。",
});
assert.equal(otherWrite.success, true);
assert.equal(otherWrite.reply?.floorNumber, 2, "each story thread has an independent floor sequence");
assert.equal(StoryForumReplyRepository.listReplies(storyId, threadId).length, 2);
assert.equal(StoryForumReplyRepository.listReplies(otherStoryId, otherThreadId).length, 1);

const invalidFloor = StoryForumReplyRepository.appendReply({
  ...baseReply,
  id: `${storyId}:reply:invalid-floor`,
  body: "错误楼层不应写入。",
  floorNumber: 99,
});
assert.equal(invalidFloor.success, false, "caller cannot skip the repository-assigned floor");

const invalidParent = StoryForumReplyRepository.appendReply({
  ...baseReply,
  id: `${storyId}:reply:invalid-parent`,
  body: "不能回复另一个故事的楼层。",
  parentReplyId: otherWrite.reply!.id,
});
assert.equal(invalidParent.success, false, "cross-story parent replies must be rejected");

const historyBefore = JSON.parse(JSON.stringify(StoryForumReplyRepository.listReplies(storyId, threadId)));
const historyEdit = StoryForumReplyRepository.appendReply({
  ...baseReply,
  id: firstReply.id,
  body: "篡改历史回复。",
  floorNumber: 2,
});
assert.equal(historyEdit.success, false);
assert.deepEqual(StoryForumReplyRepository.listReplies(storyId, threadId), historyBefore);

const requests: Array<{ message: string; systemInstruction: string }> = [];
const generated = await generateStoryComments({
  storyId,
  thread: StoryThreadRepository.getThread(storyId, threadId)!,
  characters: [author],
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 1,
  aiCall: async (request) => {
    requests.push(request);
    return {
      text: JSON.stringify({ comments: [{
        authorType: "story_character",
        authorId: "story-character-1",
        style: "ordinary",
        replyToFloor: 2,
        quoteContent: "先查一下门禁和监控。",
        content: "回复二楼：我会先去调取门禁记录。",
      }] }),
    };
  },
});
assert.equal(generated.replies.length, 1);
assert.equal(generated.replies[0].floorNumber, 4);
assert.equal(generated.replies[0].parentReplyId, firstReply.id);
assert.equal(generated.replies[0].replyToUserId, author.id);
assert.equal(generated.events[0].floorNumber, 4);
assert.equal(generated.events[0].forumReplyId, generated.replies[0].id);
assert.match(requests[0].message, /floor=2/);
assert.equal(StoryEventRepository.listEvents(storyId).at(-1)?.floorNumber, 4);
assert.equal(values.has("phone_forum_replies"), false, "story replies must remain outside live Forum storage");

console.log("forum story reply threading tests passed");
