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

const { generateStoryComments } = await import("../src/features/forumStory/services/forumStoryCommentService");
const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { StoryForumReplyRepository } = await import("../src/features/forumStory/storyReplyRepository");
const { buildForumStoryCommentPrompt } = await import("../src/features/characterCognitive/promptAdapters/forumStoryCommentPromptAdapter");

const storyId = "story-comments-isolated";
const threadId = `${storyId}:thread:main`;
const now = 10_000;
ForumStoryRepository.createStory({
  id: storyId,
  title: "A public story",
  seed: "A public story seed",
  premise: "A public story premise",
  status: "active",
  creationSource: "user",
  createdAt: now,
  updatedAt: now,
  currentEpisode: 1,
  mainThreadId: threadId,
  version: 1,
});
const thread = {
  id: threadId,
  storyId,
  title: "Who left the umbrella?",
  initialContent: "A blue umbrella appeared by the apartment door. Does anyone know why?",
  status: "open" as const,
  episode: 1,
  createdAt: now,
  updatedAt: now,
};
StoryThreadRepository.createThread(thread);
StoryEventRepository.appendEvent({
  id: `${storyId}:event:post`,
  storyId,
  type: "post_created",
  source: "system",
  status: "confirmed",
  summary: "Initial public story post",
  sequence: 1,
  storyVersion: 1,
  occurredAt: now,
  createdAt: now,
  forumThreadId: threadId,
});

const characters = [
  {
    id: `${storyId}:character:author`, storyId,
    identity: { name: "楼主", actorKey: `${storyId}:actor:author` },
    role: "observer", personaSummary: "careful and concise", knowledgeScope: [],
    isAuthor: true, status: "active" as const, createdAt: now, updatedAt: now,
  },
  {
    id: `${storyId}:character:neighbor`, storyId,
    identity: { name: "小周", actorKey: `${storyId}:actor:neighbor` },
    role: "neighbor", personaSummary: "warm and curious", knowledgeScope: [],
    isAuthor: false, status: "active" as const, createdAt: now, updatedAt: now,
  },
  {
    id: `${storyId}:character:analyst`, storyId,
    identity: { name: "阿理", actorKey: `${storyId}:actor:analyst` },
    role: "analyst", personaSummary: "calm and evidence-driven", knowledgeScope: [],
    isAuthor: false, status: "active" as const, createdAt: now, updatedAt: now,
  },
];

const requests: Array<{ message: string; systemInstruction: string }> = [];
const aiCall = async (request: { message: string; systemInstruction: string }) => {
  requests.push(request);
  return {
    text: JSON.stringify({ comments: [
      { style: "ordinary", authorName: "楼主", content: "我也在等邻居提供线索。" },
      { style: "gossip", authorName: "小周", content: "这也太巧了吧，昨晚我好像听见门口有声音。" },
      { style: "rational", authorName: "阿理", content: "先确认监控和雨水痕迹，再判断是谁放的。" },
    ] }),
  };
};

const result = await generateStoryComments({
  storyId,
  thread,
  characters,
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 1,
  aiCall,
});

assert.equal(result.replies.length, 3, "comments should be generated");
assert.equal(result.events.length, 3, "one comment_added event per comment");
assert.deepEqual(new Set(result.replies.map((reply) => reply.storyCommentStyle)), new Set(["ordinary", "gossip", "rational"]));
assert.ok(result.replies.every((reply) => reply.storyId === storyId));
assert.ok(result.replies.every((reply) => reply.ownerIdentityId === `story-scope:${storyId}`));
assert.ok(result.events.every((event) => event.type === "comment_added" && event.storyId === storyId));
assert.equal(values.has("phone_forum_replies"), false, "story replies must not pollute live Forum storage");
assert.equal(StoryForumReplyRepository.listReplies(storyId, threadId).length, 3);

const prompt = requests[0];
assert.match(prompt.message, /Who left the umbrella/);
assert.match(prompt.message, /A blue umbrella appeared/);
assert.doesNotMatch(prompt.message, new RegExp(storyId));
assert.doesNotMatch(prompt.message, /PRIVATE_MEMORY_SENTINEL|PRIVATE_CHAT_SENTINEL|relationId|userIdentityId/);
assert.match(prompt.systemInstruction, /do not read/i);

const directPrompt = buildForumStoryCommentPrompt({
  storyScope: "forum-story",
  thread: { title: "Public title", initialContent: "Public content" },
  characters: [{ name: "Public NPC", role: "neighbor", personaSummary: "friendly" }],
  existingComments: [{ authorName: "Public NPC", content: "A previous public comment" }],
});
assert.doesNotMatch(directPrompt.message, /PRIVATE_MEMORY_SENTINEL|userIdentityId|relationId/);
assert.throws(() => buildForumStoryCommentPrompt({
  storyScope: "forum-story",
  thread: { title: "Public title", initialContent: "Public content" },
  characters: [{ name: "Unsafe", role: "neighbor", personaSummary: "PRIVATE_MEMORY_SENTINEL" }],
}), /not safe/);

const duplicateResult = await generateStoryComments({
  storyId,
  thread,
  characters,
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 2,
  aiCall,
});
assert.equal(duplicateResult.replies.length, 0, "identical comments must be ignored");
assert.equal(StoryForumReplyRepository.listReplies(storyId, threadId).length, 3);
assert.equal(StoryEventRepository.listEvents(storyId).filter((event) => event.type === "comment_added").length, 3);

console.log("forum story comment generation tests passed");
