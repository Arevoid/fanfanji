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
const { StoryForumUserRepository } = await import("../src/features/forumStory/storyForumUserRepository");
const { generateStoryComments } = await import("../src/features/forumStory/services/forumStoryCommentService");

const now = 50_000;
const storyId = "story-forum-users-a";
const otherStoryId = "story-forum-users-b";
const threadId = `${storyId}:thread:main`;

ForumStoryRepository.createStory({
  id: storyId,
  title: "A public forum story",
  seed: "A public forum story",
  premise: "A public forum story premise",
  status: "active",
  creationSource: "user",
  createdAt: now,
  updatedAt: now,
  currentEpisode: 1,
  mainThreadId: threadId,
  version: 1,
});
StoryThreadRepository.createThread({
  id: threadId,
  storyId,
  title: "谁看见了门口的伞？",
  initialContent: "楼道门口突然多了一把蓝伞，大家有线索吗？",
  status: "open",
  episode: 1,
  createdAt: now,
  updatedAt: now,
});

const forumUser = {
  id: `${storyId}:forum-user:analyst`,
  storyId,
  displayName: "理性观察员",
  userType: "analyst" as const,
  style: "rational",
  personaSummary: "只引用公开线索，语气克制。",
  createdAt: now,
};
const otherUser = {
  id: `${otherStoryId}:forum-user:observer`,
  storyId: otherStoryId,
  displayName: "另一故事网友",
  userType: "observer" as const,
  style: "ordinary",
  personaSummary: "只参与另一个故事。",
  createdAt: now,
};

assert.equal(StoryForumUserRepository.createUser(forumUser).success, true);
assert.equal(StoryForumUserRepository.createUser(otherUser).success, true);
assert.equal(StoryForumUserRepository.getUsersByStoryId(storyId).length, 1);
assert.equal(StoryForumUserRepository.getUserById(storyId, forumUser.id)?.displayName, "理性观察员");
assert.equal(StoryForumUserRepository.getUserById(storyId, otherUser.id), undefined, "cross-story user must be hidden");
assert.equal(StoryForumUserRepository.getUsersByStoryId(otherStoryId).length, 1);

assert.equal(StoryForumUserRepository.updateUser(storyId, forumUser.id, { displayName: "理性观察员（本人）" }).success, true);
const persistedUser = StoryForumUserRepository.getUserById(storyId, forumUser.id);
assert.equal(persistedUser?.userType, "analyst");
assert.equal(persistedUser?.style, "rational");
assert.equal(persistedUser?.displayName, "理性观察员（本人）");
assert.equal(values.has("phone_characters_v3"), false, "story forum users must not create real Characters");
assert.equal(values.has("phone_forum_replies"), false, "story forum users must not use real Forum replies");

const character = {
  id: `${storyId}:character:author`,
  storyId,
  identity: { name: "楼主", actorKey: `${storyId}:actor:author` },
  role: "thread author",
  personaSummary: "谨慎记录公开线索。",
  knowledgeScope: [],
  isAuthor: true,
  status: "active" as const,
  createdAt: now,
  updatedAt: now,
};
const requests: Array<{ message: string; systemInstruction: string }> = [];
let call = 0;
const aiCall = async (request: { message: string; systemInstruction: string }) => {
  requests.push(request);
  call += 1;
  return {
    text: JSON.stringify({ comments: [{
      authorType: "forum_user",
      authorId: "story-forum-user-1",
      style: "gossip",
      content: call === 1 ? "先把监控时间线列出来，再讨论谁放的。" : "补充一下：雨水方向也能排除几个猜测。",
    }] }),
  };
};

const first = await generateStoryComments({
  storyId,
  thread: {
    ...StoryThreadRepository.getThread(storyId, threadId)!,
  },
  characters: [character],
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 1,
  aiCall,
});
assert.equal(first.replies.length, 1);
assert.equal(first.replies[0].storyAuthorType, "forum_user");
assert.equal(first.replies[0].storyAuthorId, forumUser.id);
assert.equal(first.replies[0].publicAuthor.displayName, "理性观察员（本人）");
assert.equal(first.replies[0].storyCommentStyle, "rational", "persisted forum-user style must remain stable");

const second = await generateStoryComments({
  storyId,
  thread: StoryThreadRepository.getThread(storyId, threadId)!,
  characters: [character],
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 2,
  aiCall,
});
assert.equal(second.replies.length, 1);
assert.equal(second.replies[0].storyAuthorId, forumUser.id);
assert.equal(second.replies[0].storyCommentStyle, "rational", "same StoryForumUser must retain style across comments");
assert.ok(requests[0].message.includes("理性观察员（本人）"));
assert.doesNotMatch(requests[0].message, /relationId|userIdentityId|PRIVATE_MEMORY_SENTINEL|PRIVATE_CHAT_SENTINEL/);
assert.equal(values.has("phone_characters_v3"), false);
assert.equal(values.has("phone_forum_replies"), false);

console.log("forum story forum user tests passed");
