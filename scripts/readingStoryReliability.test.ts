import assert from "node:assert/strict";
import { saveReadingStory, saveReadingStoryStore } from "../src/core/storage/repositories/readingStoryRepository";
import { commitReadingStoryTurn, createReadingStory, getReadingStory, listReadingStoryTurns } from "../src/features/reading/story/readingStory";
import { generateReadingStoryTurn } from "../src/features/reading/story/readingStoryGeneration";
import { createEmptyReadingStoryStore } from "../src/domain/reading/storyTypes";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  failNextWrite = false;
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { if (this.failNextWrite) { this.failNextWrite = false; throw new Error("simulated storage failure"); } this.data.set(key, value); }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
saveReadingStoryStore(createEmptyReadingStoryStore());

const result = (narrative: string) => ({ narrative, dialogue: [], choices: [{ id: "a", label: "继续" }], stateChanges: [], discoveredIntel: [], taskChanges: [], relationshipChanges: [], currentLocation: "城门", currentTime: "第一夜", chapterProgress: 0.2, shouldEndChapter: false });
const settings = { apiKey: "key", selectedModel: "model" };

const retryStory = createReadingStory({ scope: { userIdentityId: "identity-a", storyId: "retry" }, title: "Retry", entryMode: "soul_wear", length: "short", characterName: "角色", now: 1 });
let retryCalls = 0;
const retried = await generateReadingStoryTurn({ story: retryStory, userAction: "观察", requestId: "request-retry", settings, aiCall: async () => { retryCalls += 1; return { text: retryCalls === 1 ? "{}" : JSON.stringify(result("第二次响应通过校验")) }; }, now: 2 });
assert.equal(retryCalls, 2);
assert.equal(listReadingStoryTurns({ userIdentityId: "identity-a", storyId: "retry" }).length, 1);
assert.equal(retried.attempts, 2);

let duplicateCalls = 0;
const duplicate = await generateReadingStoryTurn({ story: retried.story, userAction: "观察", requestId: "request-retry", settings, aiCall: async () => { duplicateCalls += 1; return { text: JSON.stringify(result("不应再次调用模型")) }; } });
assert.equal(duplicateCalls, 0);
assert.equal(duplicate.attempts, 0);
assert.equal(listReadingStoryTurns({ userIdentityId: "identity-a", storyId: "retry" }).length, 1);

const conflictStory = createReadingStory({ scope: { userIdentityId: "identity-a", storyId: "conflict" }, title: "Conflict", entryMode: "soul_wear", length: "short", characterName: "角色", now: 10 });
await assert.rejects(() => generateReadingStoryTurn({ story: conflictStory, userAction: "观察", requestId: "request-conflict", settings, aiCall: async () => { saveReadingStory({ ...conflictStory, currentTime: "另一个页面已更新", updatedAt: 11 }); return { text: JSON.stringify(result("不应提交")) }; } }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "conflict"));
assert.equal(listReadingStoryTurns(conflictStory).length, 0);

const atomicStory = createReadingStory({ scope: { userIdentityId: "identity-a", storyId: "atomic" }, title: "Atomic", entryMode: "soul_wear", length: "short", characterName: "角色", now: 20 });
localStorage.failNextWrite = true;
assert.throws(() => commitReadingStoryTurn({ scope: atomicStory, result: result("保存失败"), requestId: "request-atomic", expectedStoryUpdatedAt: atomicStory.updatedAt, now: 21 }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "storage"));
assert.equal(listReadingStoryTurns(atomicStory).length, 0);
assert.equal(getReadingStory(atomicStory)?.currentChapter, 0);

console.log("reading story retry, idempotency, conflict, and atomic commit tests passed");
