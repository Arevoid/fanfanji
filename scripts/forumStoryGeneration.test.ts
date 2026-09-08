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
const { ForumStoryRepository } = await import("../src/features/forumStory/forumStoryRepository");
const { StoryThreadRepository } = await import("../src/features/forumStory/storyThreadRepository");
const { StoryEventRepository } = await import("../src/features/forumStory/storyEventRepository");
const { buildForumStoryInitialPrompt } = await import("../src/features/characterCognitive/promptAdapters/forumStoryPromptAdapter");

const aiRequests: Array<{ message: string; systemInstruction: string }> = [];
const aiCall = async (request: { message: string; systemInstruction: string }) => {
  aiRequests.push(request);
  return {
    text: JSON.stringify({
      title: "雨夜的蓝色雨伞",
      body: "昨晚回家时，门口多了一把蓝色雨伞。它没有留下纸条，也不像邻居的东西，先发帖问问大家有没有见过。",
      author: { name: "楼主", role: "目击者", personaSummary: "谨慎，习惯先记录细节再求证。" },
      characters: [
        { name: "楼主", role: "目击者", personaSummary: "谨慎，习惯先记录细节再求证。" },
        { name: "小周", role: "邻居", personaSummary: "热心，喜欢从生活线索入手。" },
      ],
      storyBackground: "故事发生在一栋老居民楼，连续几天都在下雨。",
      initialState: "主楼已发布，蓝色雨伞的来历尚未确认。",
    }),
  };
};

const result = await createForumStory({
  storyId: "story-scope-a",
  theme: "门口出现一把不属于我的蓝色雨伞",
  worldBackground: "老居民楼和连续降雨的公共背景",
  settings: { apiKey: "test-key", selectedModel: "test-model" },
  now: 1_000,
  aiCall,
});

assert.equal(aiRequests.length, 1);
assert.equal(result.story.id, "story-scope-a");
assert.equal(result.story.status, "active");
assert.equal(result.story.currentEpisode, 1);
assert.equal(result.story.mainThreadId, result.thread.id);
assert.equal(result.thread.storyId, result.story.id);
assert.equal(result.thread.title, "雨夜的蓝色雨伞");
assert.equal(result.thread.initialContent, result.candidate.body);
assert.equal(result.thread.authorCharacterId, result.characters.find((character) => character.isAuthor)?.id);
assert.equal(result.event.type, "post_created");
assert.equal(result.event.status, "confirmed");
assert.deepEqual(StoryEventRepository.listEvents(result.story.id).map((event) => event.id), [result.event.id]);
assert.deepEqual(ForumStoryRepository.getStory(result.story.id), result.story);
assert.deepEqual(StoryThreadRepository.getThread(result.story.id, result.thread.id), result.thread);

for (const character of result.characters) {
  assert.equal(character.storyId, result.story.id);
  assert.equal(typeof character.identity.name, "string");
  assert.equal(typeof character.role, "string");
  assert.equal(typeof character.personaSummary, "string");
}

const prompt = aiRequests[0];
assert.match(prompt.message, /门口出现一把不属于我的蓝色雨伞/);
assert.match(prompt.message, /老居民楼和连续降雨的公共背景/);
assert.doesNotMatch(prompt.message, /story-scope-a/, "内部 storyId 不应进入 Prompt");
assert.doesNotMatch(prompt.message, /userIdentityId|relationId/, "内部身份字段不应进入 Prompt");
assert.doesNotMatch(prompt.message, /PRIVATE_CHAT_SENTINEL|PRIVATE_MEMORY_SENTINEL/, "私域数据不应进入 Prompt");
assert.match(prompt.systemInstruction, /不得读取或猜测 Memory、Relationship/);

const directPrompt = buildForumStoryInitialPrompt({
  storyScope: "forum-story",
  theme: "公共论坛中的小谜团",
  characters: [{ name: "观察者", role: "发帖人", personaSummary: "克制、细心。" }],
});
assert.match(directPrompt.message, /观察者/);
assert.doesNotMatch(directPrompt.message, /userIdentityId|relationId|PRIVATE_CHAT_SENTINEL/);

const serialized = JSON.stringify(result);
assert.doesNotMatch(serialized, /userIdentityId|relationId|PRIVATE_CHAT_SENTINEL|PRIVATE_MEMORY_SENTINEL/);
assert.equal(values.has("phone_forum_threads"), false, "初始生成阶段不应改写旧 ForumThread 存储");
console.log("forum story generation tests passed");
