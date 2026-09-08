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

const { generateStoryUpdate } = await import("../src/features/forumStory/services/forumStoryUpdateService");
const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { StoryUpdateRepository } = await import("../src/features/forumStory/storyUpdateRepository");
const { StoryForumReplyRepository } = await import("../src/features/forumStory/storyReplyRepository");
const { buildForumStoryUpdatePrompt } = await import("../src/features/characterCognitive/promptAdapters/forumStoryUpdatePromptAdapter");

const storyId = "story-update-isolated";
const threadId = `${storyId}:thread:main`;
const now = 20_000;
ForumStoryRepository.createStory({
  id: storyId,
  title: "The blue umbrella",
  seed: "A public mystery",
  premise: "A public mystery in an apartment building",
  status: "active",
  creationSource: "user",
  createdAt: now,
  updatedAt: now,
  currentEpisode: 1,
  mainThreadId: threadId,
  currentStoryTime: now,
  version: 1,
});
const thread = {
  id: threadId,
  storyId,
  title: "Who left the umbrella?",
  initialContent: "A blue umbrella appeared by the apartment door.",
  status: "open" as const,
  episode: 1,
  createdAt: now,
  updatedAt: now,
};
StoryThreadRepository.createThread(thread);
const initialEvent = {
  id: `${storyId}:event:post`,
  storyId,
  type: "post_created" as const,
  source: "system" as const,
  status: "confirmed" as const,
  summary: "The public thread was created.",
  sequence: 1,
  storyVersion: 1,
  occurredAt: now,
  createdAt: now,
  forumThreadId: threadId,
};
StoryEventRepository.appendEvent(initialEvent);

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
];

StoryForumReplyRepository.appendReply({
  storyId,
  id: `${storyId}:reply:1`,
  threadId,
  ownerIdentityId: `story-scope:${storyId}`,
  floor: 2,
  publicAuthor: { displayName: "小周", kind: "virtual", isAnonymous: false },
  body: "I heard footsteps near the door last night.",
  source: "ai-virtual",
  occurredAt: now,
  baseLikeCount: 0,
  likedByIdentityIds: [],
  createdAt: now,
  updatedAt: now,
  storyCommentStyle: "supplement",
  storyCommentLabel: "supplementary information",
});

const requests: Array<{ message: string; systemInstruction: string }> = [];
const aiCall = async (request: { message: string; systemInstruction: string }) => {
  requests.push(request);
  return {
    text: JSON.stringify({
      title: "A new clue",
      content: "楼主更新：我查看了门口监控，发现雨伞是在凌晨被放下的。",
      eventProgression: "监控确认雨伞出现在凌晨，故事进入追查放伞者阶段。",
    }),
  };
};

const beforeEvents = JSON.parse(JSON.stringify(StoryEventRepository.listEvents(storyId)));
const result = await generateStoryUpdate({
  storyId,
  thread,
  characters,
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  triggerReason: "manual",
  now: now + 1,
  aiCall,
});

assert.equal(result.update.status, "published");
assert.equal(result.update.title, "A new clue");
assert.equal(result.update.content, "楼主更新：我查看了门口监控，发现雨伞是在凌晨被放下的。");
assert.equal(result.update.eventProgression, "监控确认雨伞出现在凌晨，故事进入追查放伞者阶段。");
assert.equal(result.event.type, "update_published");
assert.deepEqual(result.update.eventIds, [result.event.id]);
assert.equal(result.story.status, "waiting_update");
assert.equal(result.story.currentEpisode, 2);
assert.equal(result.story.version, 2);
assert.equal(result.story.id, storyId);
assert.equal(StoryUpdateRepository.listUpdates(storyId).length, 1);
assert.equal(StoryEventRepository.listEvents(storyId).length, 2);
assert.deepEqual(StoryEventRepository.listEvents(storyId)[0], beforeEvents[0], "history must remain unchanged");
assert.equal(StoryThreadRepository.getThread(storyId, threadId)?.initialContent, thread.initialContent);

const prompt = requests[0];
assert.match(prompt.message, /The public thread was created/);
assert.match(prompt.message, /I heard footsteps/);
assert.doesNotMatch(prompt.message, new RegExp(storyId));
assert.doesNotMatch(prompt.message, /PRIVATE_MEMORY_SENTINEL|PRIVATE_CHAT_SENTINEL|relationId|userIdentityId/);
assert.match(prompt.systemInstruction, /Do not read.*Memory/i);

assert.throws(() => buildForumStoryUpdatePrompt({
  storyScope: "forum-story",
  story: { title: "Public", premise: "Public premise", status: "active", currentEpisode: 1 },
  thread: { title: "Public thread", initialContent: "Public post" },
  characters: [{ name: "Public NPC", role: "observer", personaSummary: "PRIVATE_MEMORY_SENTINEL" }],
  events: [{ type: "post_created", sequence: 1, summary: "Public event" }],
}), /not safe/);

const historyBeforeRejectedAppend = JSON.parse(JSON.stringify(StoryEventRepository.listEvents(storyId)));
assert.equal(StoryEventRepository.appendEvent({ ...initialEvent, summary: "tampered history" }).success, false);
assert.deepEqual(StoryEventRepository.listEvents(storyId), historyBeforeRejectedAppend, "historical events are append-only");

console.log("forum story update generation tests passed");
