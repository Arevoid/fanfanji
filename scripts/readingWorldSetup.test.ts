import assert from "node:assert/strict";
import { saveReadingCoStoryStore } from "../src/core/storage/repositories/readingCoStoryRepository";
import { createEmptyReadingCoStoryStore } from "../src/domain/reading/coStoryTypes";
import { buildReadingWorldItems } from "../src/features/reading/navigation/readingNavigation";
import { createReadingCoStory, ReadingCoStoryError } from "../src/features/reading/story/readingCoStory";
import { projectReadingCoStoryForAi } from "../src/features/reading/story/readingCoStoryPrompt";
import { validateReadingWorldSetup, type ReadingWorldSetupDraft } from "../src/features/reading/story/readingWorldSetup";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
saveReadingCoStoryStore(createEmptyReadingCoStoryStore());

const completeDraft: ReadingWorldSetupDraft = {
  relationId: "relation-friend-a",
  title: "雾港来信",
  genre: "近未来悬疑",
  worldView: "潮汐决定城市开放的区域，记忆可以被封存在纸质信件中。",
  userIdentity: "调查员",
  friendIdentity: "档案馆管理员",
  synopsis: "两人追查一封来自未来的信。",
  intendedEnding: "在潮汐归零前找到寄信人。",
  length: "medium",
};

assert.equal(validateReadingWorldSetup(completeDraft), null);
assert.ok(validateReadingWorldSetup({ ...completeDraft, relationId: "" }));
assert.ok(validateReadingWorldSetup({ ...completeDraft, worldView: "" }));
assert.ok(validateReadingWorldSetup({ ...completeDraft, synopsis: "" }));

const scope = {
  userIdentityId: "identity-a",
  coStoryId: "custom-world-a",
  relationId: completeDraft.relationId,
  characterId: "character-friend-a",
};
const story = createReadingCoStory({
  scope,
  origin: "custom",
  title: completeDraft.title,
  length: completeDraft.length,
  worldDefinition: {
    genre: completeDraft.genre,
    worldView: completeDraft.worldView,
    synopsis: completeDraft.synopsis,
    intendedEnding: completeDraft.intendedEnding,
  },
  userCharacterName: "用户",
  userCharacterRole: completeDraft.userIdentity,
  aiFriend: {
    relationId: scope.relationId,
    characterId: scope.characterId,
    displayName: "阿岚",
    characterName: "阿岚",
    characterRole: completeDraft.friendIdentity,
    personaSummary: "冷静、谨慎，保留原有表达习惯。",
    knownIntel: [],
    knownTurnIds: [],
  },
  now: 100,
});

assert.equal(story.origin, "custom");
assert.equal(story.universeStoryId, undefined, "自建世界不能伪装成书籍穿书宇宙");
assert.equal(story.worldDefinition?.genre, completeDraft.genre);
assert.equal(story.targetChapters, 8);

const worlds = buildReadingWorldItems({ userIdentityId: "identity-a", stories: [], coStories: [story] });
assert.equal(worlds[0]?.origin, "custom");
assert.equal(worlds[0]?.genre, completeDraft.genre);
assert.equal(worlds[0]?.friendName, "阿岚");

const aiContext = projectReadingCoStoryForAi({ story, turns: [] });
assert.equal(aiContext.currentStory.genre, completeDraft.genre);
assert.equal(aiContext.currentStory.worldView, completeDraft.worldView);
assert.equal(aiContext.currentStory.intendedEnding, completeDraft.intendedEnding);

assert.throws(() => createReadingCoStory({
  scope: { ...scope, coStoryId: "invalid-custom-world" },
  origin: "custom",
  title: "缺少世界设定",
  length: "short",
  userCharacterName: "用户",
  aiFriend: story.aiFriend,
  worldDefinition: { genre: "悬疑", worldView: "", synopsis: "梗概" },
}), (error: unknown) => error instanceof ReadingCoStoryError && error.code === "invalid");

console.log("custom reading world setup, persistence, projection, and validation tests passed");
