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

const { createForumStory } = await import("../src/features/forumStory/services/forumStoryGenerationService");
const { generateStoryComments } = await import("../src/features/forumStory/services/forumStoryCommentService");
const { generateStoryUpdate } = await import("../src/features/forumStory/services/forumStoryUpdateService");
const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { StoryForumReplyRepository } = await import("../src/features/forumStory/storyReplyRepository");
const { StoryUpdateRepository } = await import("../src/features/forumStory/storyUpdateRepository");

const storyId = "story-lifecycle-e2e";
const now = 30_000;
let aiCallCount = 0;
let draftStatus: string | undefined;
const requests: Array<{ message: string; systemInstruction: string }> = [];
const aiCall = async (request: { message: string; systemInstruction: string }) => {
  requests.push(request);
  if (aiCallCount === 0) {
    draftStatus = ForumStoryRepository.getStory(storyId)?.status;
    aiCallCount += 1;
    return {
      text: JSON.stringify({
        title: "The blue umbrella",
        body: "A blue umbrella appeared outside my apartment door. Does anyone know where it came from?",
        author: { name: "Alex", role: "thread author", personaSummary: "careful and observant" },
        characters: [
          { name: "Alex", role: "thread author", personaSummary: "careful and observant" },
          { name: "Sam", role: "neighbor", personaSummary: "curious and talkative" },
        ],
        storyBackground: "A public mystery in an apartment building.",
        initialState: "The first question has just been posted.",
      }),
    };
  }
  if (aiCallCount === 1) {
    aiCallCount += 1;
    return {
      text: JSON.stringify({ comments: [
        { style: "ordinary", authorName: "Alex", content: "I will check the entrance camera first." },
        { style: "gossip", authorName: "Sam", content: "I heard footsteps near that door last night." },
      ] }),
    };
  }
  aiCallCount += 1;
  return {
    text: JSON.stringify({
      title: "A camera clue",
      content: "I checked the entrance camera and found a new clue about when the umbrella appeared.",
      eventProgression: "The camera narrows the mystery to a late-night window; the search continues.",
    }),
  };
};

const created = await createForumStory({
  storyId,
  theme: "A blue umbrella appears at an apartment door",
  worldBackground: "A public apartment-building setting",
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now,
  aiCall,
});

assert.equal(draftStatus, "draft", "creation must persist draft before generation");
assert.equal(created.story.status, "active", "created story becomes active");
assert.equal(created.story.currentEpisode, 1);
assert.equal(created.event.type, "post_created");
assert.equal(created.thread.storyId, storyId);
assert.equal(created.characters.every((character) => character.storyId === storyId), true);

const initialHistory = JSON.parse(JSON.stringify(StoryEventRepository.listEvents(storyId)));
const comments = await generateStoryComments({
  storyId,
  thread: created.thread,
  characters: created.characters,
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 1,
  aiCall,
});
assert.equal(comments.replies.length, 2);
assert.equal(comments.events.length, 2);
assert.equal(comments.replies.every((reply) => reply.storyId === storyId), true);
assert.equal(ForumStoryRepository.getStory(storyId)?.status, "active");

const updated = await generateStoryUpdate({
  storyId,
  thread: created.thread,
  characters: created.characters,
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: now + 2,
  aiCall,
});

assert.equal(updated.story.status, "waiting_update");
assert.equal(updated.story.currentEpisode, 2);
assert.equal(updated.update.status, "published");
assert.equal(updated.update.storyId, storyId);
assert.equal(updated.event.type, "update_published");

const events = StoryEventRepository.listEvents(storyId);
assert.deepEqual(events.map((event) => event.type), ["post_created", "comment_added", "comment_added", "update_published"]);
assert.deepEqual(events.slice(0, 1), initialHistory, "historical post event must remain unchanged");
assert.equal(StoryUpdateRepository.listUpdates(storyId).length, 1);
assert.equal(StoryForumReplyRepository.listReplies(storyId, created.thread.id).length, 2);

const rejectedHistoryEdit = StoryEventRepository.appendEvent({
  ...events[0],
  summary: "tampered event must not replace history",
});
assert.equal(rejectedHistoryEdit.success, false);
assert.deepEqual(StoryEventRepository.listEvents(storyId)[0], initialHistory[0]);

assert.equal(values.has("phone_forum_replies"), false, "story comments must not enter real Forum replies");
assert.equal(values.has("phone_characters_v3"), false, "story characters must not create real Character records");
assert.equal(values.has("phone_characters"), false, "story characters must not create legacy Character records");

const serializedStoryData = JSON.stringify({ story: updated.story, thread: updated.thread, characters: updated.characters, replies: comments.replies, events });
assert.doesNotMatch(serializedStoryData, /relationId|userIdentityId|PRIVATE_MEMORY_SENTINEL|PRIVATE_CHAT_SENTINEL/);
assert.ok(requests.length >= 3);
for (const request of requests) {
  assert.doesNotMatch(request.message, new RegExp(storyId));
  assert.doesNotMatch(request.message, /relationId|userIdentityId|PRIVATE_MEMORY_SENTINEL|PRIVATE_CHAT_SENTINEL/);
}
assert.match(requests[0].systemInstruction, /Memory/i);
assert.match(requests[requests.length - 1].systemInstruction, /Relationship/i);

console.log("forum story lifecycle tests passed");
