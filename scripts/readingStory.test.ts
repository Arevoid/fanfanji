import assert from "node:assert/strict";
import { saveReadingStore } from "../src/core/storage/repositories/readingRepository";
import { createReadingStory, commitReadingStoryTurn, createReadingStorySave, loadReadingStorySave, validateReadingStoryTurnResult } from "../src/features/reading/story/readingStory";
import { listReadingStories, listReadingStoryTurns } from "../src/core/storage/repositories/readingStoryRepository";
import { ensureDistinctReadingStoryChoices } from "../src/features/reading/story/readingStoryChoices";
import type { ReadingBook, ReadingStore } from "../src/domain/reading/types";

class MemoryStorage implements Storage { private data = new Map<string, string>(); get length(): number { return this.data.size; } clear(): void { this.data.clear(); } getItem(key: string): string | null { return this.data.get(key) ?? null; } key(index: number): string | null { return [...this.data.keys()][index] ?? null; } removeItem(key: string): void { this.data.delete(key); } setItem(key: string, value: string): void { this.data.set(key, value); } }
const localStorage = new MemoryStorage(); Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
const book: ReadingBook = { id: "story-book", userIdentityId: "identity-a", assetId: "asset", contentHash: "hash", format: "txt", status: "ready", title: "Story", sourceFileName: "story.txt", sourceMimeType: "text/plain", sourceEncoding: "utf-8", byteLength: 10, wordCount: 20, chapterCount: 3, createdAt: 1, updatedAt: 1 };
const readingStore: ReadingStore = { version: 1, books: [book], chapters: [], paragraphAnchors: [], progress: [], annotations: [], preferences: [], assetCleanupTasks: [] }; saveReadingStore(readingStore);
const scope = { userIdentityId: "identity-a", storyId: "story-a" };
const story = createReadingStory({ scope, title: "穿书测试", bookId: book.id, entryMode: "soul_wear", length: "short", characterName: "林舟", characterRole: "边城医者", goals: ["找到回去的方法"], now: 1 });
assert.equal(story.targetChapters, 3);
const result = validateReadingStoryTurnResult({ narrative: "你在雨夜醒来。", dialogue: [{ speaker: "守门人", text: "你是谁？" }], choices: [{ id: "a", label: "说明身份" }], stateChanges: ["进入城门"], discoveredIntel: ["城中正在戒严"], taskChanges: ["调查戒严原因"], relationshipChanges: ["守门人信任+1"], currentLocation: "城门", currentTime: "第一夜", chapterProgress: 0.6, shouldEndChapter: true });
assert.equal(validateReadingStoryTurnResult({ narrative: "Next scene", choices: [] }).choices.length, 4, "a continuing turn always offers directions");
const distinctChoices = ensureDistinctReadingStoryChoices([
  { id: "a", label: "走左边" },
  { id: "b", label: "走左边" },
]);
assert.deepEqual(distinctChoices.map((choice) => choice.label), [
  "走左边",
  "观察当前场景，寻找能改变局面的线索",
  "与在场人物直接交涉，试探对方的真实意图",
  "按自己的想法行动或说话",
]);
assert.deepEqual(
  ensureDistinctReadingStoryChoices([
    { id: "a", label: "继续观察局势，确认刚才行动造成的变化" },
    { id: "b", label: "主动询问在场人物，获取更多信息" },
    { id: "c", label: "按照当前目标推进下一步行动" },
    { id: "d", label: "按自己的想法行动" },
  ]).map((choice) => choice.label),
  [
    "观察当前场景，寻找能改变局面的线索",
    "与在场人物直接交涉，试探对方的真实意图",
    "改变当前位置或采取主动行动，制造新的机会",
    "按自己的想法行动或说话",
  ],
);
const committed = commitReadingStoryTurn({ scope, result, userAction: "说明身份", now: 2 });
assert.equal(committed.story.currentChapter, 1);
assert.equal(listReadingStoryTurns(scope).length, 1);
const save = createReadingStorySave({ scope, label: "雨夜醒来", now: 3 });
commitReadingStoryTurn({ scope, result: { ...result, narrative: "后续场景", currentLocation: "城外", currentTime: "第二夜", shouldEndChapter: false }, now: 4 });
assert.equal(loadReadingStorySave({ scope, saveId: save.id }).currentLocation, "城门");
assert.equal(listReadingStoryTurns(scope).length, 1, "读档后应移除存档之后生成的回合");
assert.equal(listReadingStories("identity-b").length, 0);
assert.throws(() => validateReadingStoryTurnResult({ narrative: "", choices: [] }), /正文不能为空/);
const otherScope = { ...scope, userIdentityId: "identity-b" };
assert.throws(() => loadReadingStorySave({ scope: otherScope, saveId: save.id }), /存档不存在/);
console.log("reading story structured state and save isolation tests passed");
