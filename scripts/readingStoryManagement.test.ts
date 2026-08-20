import assert from "node:assert/strict";
import { getReadingCoStory, listReadingCoStorySaves, listReadingCoStoryTurns, saveReadingCoStoryStore } from "../src/core/storage/repositories/readingCoStoryRepository";
import { getReadingStory, listReadingStorySaves, listReadingStoryTurns, saveReadingStoryStore } from "../src/core/storage/repositories/readingStoryRepository";
import { createEmptyReadingCoStoryStore } from "../src/domain/reading/coStoryTypes";
import { createEmptyReadingStoryStore } from "../src/domain/reading/storyTypes";
import { createReadingCoStory, createReadingCoStoryOpening, createReadingCoStorySave, deleteReadingCoStory, updateReadingCoStoryMetadata } from "../src/features/reading/story/readingCoStory";
import { commitReadingStoryTurn, createReadingStory, createReadingStorySave, deleteReadingStory, updateReadingStoryMetadata } from "../src/features/reading/story/readingStory";

class MemoryStorage implements Storage { private data = new Map<string, string>(); get length(): number { return this.data.size; } clear(): void { this.data.clear(); } getItem(key: string): string | null { return this.data.get(key) ?? null; } key(index: number): string | null { return [...this.data.keys()][index] ?? null; } removeItem(key: string): void { this.data.delete(key); } setItem(key: string, value: string): void { this.data.set(key, value); } }
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
saveReadingStoryStore(createEmptyReadingStoryStore());
saveReadingCoStoryStore(createEmptyReadingCoStoryStore());

const soloScope = { userIdentityId: "identity-a", storyId: "solo-a" };
const solo = createReadingStory({ scope: soloScope, title: "旧名称", entryMode: "body_wear", length: "short", characterName: "林舟", now: 1 });
commitReadingStoryTurn({ scope: soloScope, result: { narrative: "开场", dialogue: [], choices: [], stateChanges: [], discoveredIntel: [], taskChanges: [], relationshipChanges: [], currentLocation: "港口", currentTime: "清晨", chapterProgress: 0.2, shouldEndChapter: false }, expectedStoryUpdatedAt: solo.updatedAt, now: 2 });
createReadingStorySave({ scope: soloScope, label: "节点", now: 3 });
assert.equal(updateReadingStoryMetadata({ scope: soloScope, title: "新名称", status: "paused", now: 4 }).title, "新名称");
deleteReadingStory({ scope: soloScope });
assert.equal(getReadingStory(soloScope), undefined);
assert.equal(listReadingStoryTurns(soloScope).length, 0);
assert.equal(listReadingStorySaves(soloScope).length, 0);

const scopeA = { userIdentityId: "identity-a", coStoryId: "shared-a", relationId: "relation-a", characterId: "character-a" };
const scopeB = { userIdentityId: "identity-a", coStoryId: "shared-b", relationId: "relation-b", characterId: "character-b" };
const makeShared = (scope: typeof scopeA) => createReadingCoStory({ scope, title: "共同故事", universeStoryId: "same-book", length: "short", userCharacterName: "用户", aiFriend: { relationId: scope.relationId, characterId: scope.characterId, displayName: scope.relationId, characterName: scope.relationId, personaSummary: "人设", knownIntel: [], knownTurnIds: [] }, now: 1 });
const sharedA = makeShared(scopeA);
makeShared(scopeB);
createReadingCoStoryOpening({ scope: sharedA, narrative: "A 开场", choices: [], now: 2 });
createReadingCoStorySave({ scope: sharedA, label: "A 节点", now: 3 });
assert.equal(updateReadingCoStoryMetadata({ scope: scopeA, title: "A 的新名称", status: "paused", now: 4 }).status, "paused");
deleteReadingCoStory({ scope: scopeA });
assert.equal(getReadingCoStory(scopeA), undefined);
assert.equal(listReadingCoStoryTurns(scopeA).length, 0);
assert.equal(listReadingCoStorySaves(scopeA).length, 0);
assert.ok(getReadingCoStory(scopeB), "删除 A 不能影响同书好友 B 的故事");

console.log("story rename, pause, and cascade-delete isolation tests passed");
