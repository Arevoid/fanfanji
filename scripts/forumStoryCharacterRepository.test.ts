import assert from "node:assert/strict";
import type { StoryCharacter } from "../src/domain/forumStory/forumStoryTypes";

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
  StoryCharacterRepository,
  createStoryCharacter,
  getStoryCharactersByStoryId,
  updateStoryCharacter,
} = await import("../src/features/forumStory/storyCharacterRepository");

const makeCharacter = (storyId: string, id: string, name: string, now: number): StoryCharacter => ({
  id,
  storyId,
  identity: { name, actorKey: `${storyId}:actor:${id}` },
  role: "楼主",
  personaSummary: "谨慎、关注事实，先观察后发言。",
  knowledgeScope: [],
  isAuthor: true,
  status: "active",
  createdAt: now,
  updatedAt: now,
});

const first = makeCharacter("story-a", "character-a", "甲", 100);
const second = makeCharacter("story-a", "character-b", "乙", 100);
const otherStory = makeCharacter("story-b", "character-a", "丙", 100);

assert.equal(createStoryCharacter(first).success, true);
assert.equal(createStoryCharacter(second).success, true);
assert.equal(createStoryCharacter(otherStory).success, true);
assert.deepEqual(getStoryCharactersByStoryId("story-a"), [first, second]);
assert.deepEqual(getStoryCharactersByStoryId("story-b"), [otherStory]);
assert.deepEqual(getStoryCharactersByStoryId("story-missing"), []);

assert.equal(updateStoryCharacter("story-a", first.id, {
  personaSummary: "稳定的人格摘要。",
  updatedAt: 200,
}).success, true);
const updated = getStoryCharactersByStoryId("story-a").find((character) => character.id === first.id);
assert.equal(updated?.personaSummary, "稳定的人格摘要。");
assert.equal(updated?.identity.name, first.identity.name);
assert.equal(updated?.storyId, "story-a");
assert.equal(getStoryCharactersByStoryId("story-b")[0].personaSummary, otherStory.personaSummary);

assert.equal(updateStoryCharacter("story-b", second.id, { personaSummary: "越界" }).success, false);
assert.equal(StoryCharacterRepository.getStoryCharactersByStoryId("story-a").length, 2);

assert.equal(createStoryCharacter({ ...first, personaSummary: "duplicate" }).success, false);
assert.equal(values.has("phone_forum_story_characters"), true);
console.log("forum story character repository tests passed");
