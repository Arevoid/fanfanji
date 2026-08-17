import assert from "node:assert/strict";
import { listReadingCoStorySaves, listReadingCoStoryTurns, saveReadingCoStoryStore } from "../src/core/storage/repositories/readingCoStoryRepository";
import { createEmptyReadingCoStoryStore } from "../src/domain/reading/coStoryTypes";
import { commitReadingCoStoryUserAction, createReadingCoStory, createReadingCoStoryOpening, createReadingCoStorySave, loadReadingCoStorySave } from "../src/features/reading/story/readingCoStory";

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

const createScopedStory = (coStoryId: string, relationId: string, characterId: string) => createReadingCoStory({
  scope: { userIdentityId: "identity-a", coStoryId, relationId, characterId },
  origin: "book",
  universeStoryId: "same-book",
  title: "同一本书的独立共同故事",
  length: "short",
  userCharacterName: "用户",
  aiFriend: { relationId, characterId, displayName: relationId, characterName: relationId, personaSummary: "独立人设", knownIntel: [], knownTurnIds: [] },
  now: 1,
});

const storyA = createScopedStory("story-a", "relation-a", "character-a");
const storyB = createScopedStory("story-b", "relation-b", "character-b");
createReadingCoStoryOpening({ scope: storyA, narrative: "A 的开场", choices: [{ id: "a", label: "观察" }], now: 2 });
createReadingCoStoryOpening({ scope: storyB, narrative: "B 的开场", choices: [{ id: "b", label: "等待" }], now: 2 });

const saveA = createReadingCoStorySave({ scope: storyA, label: "A 的关键节点", now: 3 });
assert.equal(listReadingCoStorySaves(storyA).length, 1);
assert.equal(listReadingCoStorySaves(storyB).length, 0, "同书不同好友不能读取彼此存档");
assert.equal(saveA.state.activeActor, "user");

const changed = commitReadingCoStoryUserAction({ scope: storyA, userAction: "推开门", now: 4 });
assert.equal(changed.story.activeActor, "ai_friend");
const restored = loadReadingCoStorySave({ scope: storyA, saveId: saveA.id, now: 5 });
assert.equal(restored.activeActor, "user");
assert.equal(listReadingCoStoryTurns(storyA).length, 1, "共同故事读档后应移除存档之后的行动");
assert.equal(restored.relationId, "relation-a");
assert.equal(restored.characterId, "character-a");

assert.throws(() => loadReadingCoStorySave({ scope: storyB, saveId: saveA.id }), /存档不存在/);
console.log("co-story save/load and relationship isolation tests passed");
