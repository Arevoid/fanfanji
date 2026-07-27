import assert from "node:assert/strict";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

const { requestCharacterMomentOnce } = await import("../src/features/moments/services/momentGenerator");
const {
  getCharacterMomentTaskKey,
  recordDeletedCharacterMoment,
  resetMomentGenerationRuntimeForTests,
} = await import("../src/features/moments/services/momentGenerationGuard");
const { loadMomentGenerationTasks } = await import("../src/core/storage/repositories/momentGenerationRepository");
const { loadMoments, saveMoments } = await import("../src/core/storage/repositories/momentRepository");

const character = { id: "char-1", name: "阿岚", avatar: "a.png", personality: "温柔", backstory: "测试" };
const fixedNow = new Date(2026, 6, 23, 9, 30).getTime();
const request = { message: "m", history: [], systemInstruction: "s", apiKey: "", model: "test" };
const parseContent = (content: string) => ({ content, selfComments: [] as string[] });

let apiCalls = 0;
const input = () => ({
  requestAi: async () => { apiCalls += 1; return { text: "今天的第一条动态" }; },
  request,
  character,
  ownerIdentityId: "identity-1",
  relationId: "relation-one",
  parseContent,
  now: () => fixedNow,
  random: () => 0.1,
});

const [first, duplicateEffect] = await Promise.all([requestCharacterMomentOnce(input()), requestCharacterMomentOnce(input())]);
assert.ok(first.moment);
assert.equal(duplicateEffect.skipped, true);
assert.equal(apiCalls, 1, "重复 effect 不应再次请求 AI");

const repeatedPageEntry = await requestCharacterMomentOnce(input());
assert.equal(repeatedPageEntry.skipped, true, "重复进入朋友圈不应再次生成");
assert.equal(apiCalls, 1);

const taskKey = getCharacterMomentTaskKey(character.id, new Date(fixedNow), "relation-one");
assert.equal(loadMomentGenerationTasks().value[taskKey]?.status, "generated");

const independentRelation = await requestCharacterMomentOnce({ ...input(), relationId: "relation-two" });
assert.ok(independentRelation.moment, "the same canonical character may generate once per direct relationship");
assert.equal(independentRelation.moment?.relationId, "relation-two");
assert.equal(apiCalls, 2);
const secondTaskKey = getCharacterMomentTaskKey(character.id, new Date(fixedNow), "relation-two");
assert.equal(loadMomentGenerationTasks().value[secondTaskKey]?.status, "generated");

assert.equal(saveMoments([first.moment!]).success, true);
assert.equal(recordDeletedCharacterMoment(first.moment!, new Date(fixedNow + 1)), true);
assert.equal(loadMomentGenerationTasks().value[taskKey]?.status, "deleted");
assert.equal(saveMoments(loadMoments([]).value.filter((moment) => moment.id !== first.moment!.id)).success, true);
assert.equal(loadMoments([]).value.some((moment) => moment.id === first.moment!.id), false, "删除后的动态不得在刷新后从 Repository 恢复");

resetMomentGenerationRuntimeForTests();
const afterRefresh = await requestCharacterMomentOnce(input());
assert.equal(afterRefresh.skipped, true, "删除后刷新不得恢复或重新生成当天任务");
assert.equal(apiCalls, 2);

const concurrentAfterDeletion = await Promise.all([requestCharacterMomentOnce(input()), requestCharacterMomentOnce(input())]);
assert.ok(concurrentAfterDeletion.every((result) => result.skipped), "两个入口同时触发也必须保持删除墓碑");
assert.equal(apiCalls, 2);

console.log("PASS moment auto-generation idempotency, duplicate effects/entries, concurrent triggers, deletion persistence, and refresh tombstone");
