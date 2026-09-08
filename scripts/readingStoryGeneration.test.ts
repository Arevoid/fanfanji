import assert from "node:assert/strict";
import { saveReadingStoryStore } from "../src/core/storage/repositories/readingStoryRepository";
import { createEmptyReadingStoryStore } from "../src/domain/reading/storyTypes";
import { createReadingStory } from "../src/features/reading/story/readingStory";
import { buildReadingStoryPrompt } from "../src/features/reading/story/readingStoryPrompt";
import { generateReadingStoryTurn } from "../src/features/reading/story/readingStoryGeneration";

class MemoryStorage implements Storage { private data = new Map<string, string>(); get length(): number { return this.data.size; } clear(): void { this.data.clear(); } getItem(key: string): string | null { return this.data.get(key) ?? null; } key(index: number): string | null { return [...this.data.keys()][index] ?? null; } removeItem(key: string): void { this.data.delete(key); } setItem(key: string, value: string): void { this.data.set(key, value); } }
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
saveReadingStoryStore(createEmptyReadingStoryStore());
const story = createReadingStory({ scope: { userIdentityId: "identity-a", storyId: "generation-story" }, title: "生成测试", entryMode: "soul_wear", length: "short", characterName: "林舟", now: 1 });
const prompt = buildReadingStoryPrompt({ story, recentTurns: [], userAction: "观察城门", bookTitle: "测试小说" });
assert.doesNotMatch(prompt.systemInstruction, /generation-story|identity-a/);
assert.match(prompt.message, /观察城门/);
let calls = 0;
const generated = await generateReadingStoryTurn({ story, userAction: "观察城门", settings: { apiKey: "key", selectedModel: "model" }, now: 2, aiCall: async () => { calls += 1; return { text: JSON.stringify({ narrative: "雨幕后的城门亮起灯火。", dialogue: [], choices: [{ id: "a", label: "继续观察" }], stateChanges: [], discoveredIntel: ["城门有人盘查"], taskChanges: [], relationshipChanges: [], currentLocation: "城门", currentTime: "第一夜", chapterProgress: 0.2, shouldEndChapter: false }) }; } });
assert.equal(calls, 1);
assert.equal(generated.story.discoveredIntel[0], "城门有人盘查");
await assert.rejects(() => generateReadingStoryTurn({ story: generated.story, userAction: "测试", settings: { apiKey: "", selectedModel: "" }, aiCall: async () => ({ text: "{}" }) }), /配置不完整/);
console.log("reading story prompt and generation protocol tests passed");
