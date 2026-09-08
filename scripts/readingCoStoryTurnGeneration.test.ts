import assert from "node:assert/strict";
import { getReadingCoStory, listReadingCoStoryTurns, saveReadingCoStoryStore } from "../src/core/storage/repositories/readingCoStoryRepository";
import { createEmptyReadingCoStoryStore } from "../src/domain/reading/coStoryTypes";
import { createReadingCoStory, createReadingCoStoryOpening, validateReadingCoStoryTurnResult } from "../src/features/reading/story/readingCoStory";
import { generateReadingCoStoryTurn } from "../src/features/reading/story/readingCoStoryGeneration";

class MemoryStorage implements Storage { private data = new Map<string, string>(); get length(): number { return this.data.size; } clear(): void { this.data.clear(); } getItem(key: string): string | null { return this.data.get(key) ?? null; } key(index: number): string | null { return [...this.data.keys()][index] ?? null; } removeItem(key: string): void { this.data.delete(key); } setItem(key: string, value: string): void { this.data.set(key, value); } }
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
saveReadingCoStoryStore(createEmptyReadingCoStoryStore());

const scope = { userIdentityId: "identity-a", coStoryId: "story-a", relationId: "relation-a", characterId: "character-a" };
const created = createReadingCoStory({ scope, origin: "custom", title: "雾港", length: "short", worldDefinition: { genre: "悬疑", worldView: "潮汐控制城市入口", synopsis: "寻找未来来信" }, userCharacterName: "林舟", userCharacterRole: "调查员", userGoals: ["找到寄信人"], aiFriend: { relationId: scope.relationId, characterId: scope.characterId, displayName: "阿岚", characterName: "阿岚", characterRole: "档案员", personaSummary: "谨慎，不替别人作决定", knownIntel: [], knownTurnIds: [] }, now: 1 });
createReadingCoStoryOpening({ scope: created, narrative: "潮水退去，雾港露出石阶。", choices: [{ id: "a", label: "查看石阶" }], now: 2 });
const story = getReadingCoStory(scope)!;

assert.throws(() => validateReadingCoStoryTurnResult({ narrative: "替用户离开城市", controlsUserCharacter: true }), /不能替用户角色/);

let calls = 0;
let sentMessage = "";
const validResult = { narrative: "你检查石阶时，阿岚留在入口记录潮位。", dialogue: [{ speaker: "阿岚", text: "潮水比档案里早退了十分钟。" }], choices: [{ id: "a", label: "追查潮汐记录" }, { id: "b", label: "询问守门人" }], friendAction: "记录潮位并提醒用户异常", controlsUserCharacter: false, stateChanges: ["潮位异常"], userDiscoveredIntel: ["石阶刻有明日日期"], aiDiscoveredIntel: ["退潮时间提前十分钟"], taskChanges: ["查明潮汐异常"], inventoryChanges: ["拓印纸"], currentLocation: "雾港石阶", currentTime: "清晨", chapterProgress: 1, shouldEndChapter: true };
const generated = await generateReadingCoStoryTurn({ story, userAction: "查看石阶上的刻痕", requestId: "request-a", settings: { apiKey: "key", selectedModel: "model" }, aiCall: async (request) => { calls += 1; sentMessage = request.message; return { text: calls === 1 ? "{}" : JSON.stringify(validResult) }; }, now: 3 });

assert.equal(calls, 2, "结构校验失败后只允许一次格式修复重试");
assert.equal(generated.story.currentChapter, 1);
assert.equal(generated.story.currentLocation, "雾港石阶");
assert.deepEqual(generated.story.userKnownIntel, ["石阶刻有明日日期"]);
assert.deepEqual(generated.story.aiFriend.knownIntel, ["退潮时间提前十分钟"]);
assert.deepEqual(generated.story.tasks, ["查明潮汐异常"]);
assert.deepEqual(generated.story.inventory, ["拓印纸"]);
assert.match(sentMessage, /查看石阶上的刻痕/);
assert.equal(listReadingCoStoryTurns(scope).at(-1)?.requestId, "request-a");

let retryCalls = 0;
const idempotent = await generateReadingCoStoryTurn({ story: generated.story, userAction: "查看石阶上的刻痕", requestId: "request-a", settings: { apiKey: "key", selectedModel: "model" }, aiCall: async () => { retryCalls += 1; return { text: JSON.stringify(validResult) }; } });
assert.equal(idempotent.attempts, 0);
assert.equal(retryCalls, 0, "相同 requestId 不能重复付费生成");
assert.equal(listReadingCoStoryTurns(scope).filter((turn) => turn.requestId === "request-a").length, 1);

console.log("structured co-story generation, knowledge split, retry, and idempotency tests passed");
