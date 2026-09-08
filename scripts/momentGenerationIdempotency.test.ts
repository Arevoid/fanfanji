import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  BLOCKED_MOMENT_RETRY_COOLDOWN_MS,
  getCharacterMomentTaskKey,
  recordDeletedCharacterMoment,
  resetMomentGenerationRuntimeForTests,
} = await import("../src/features/moments/services/momentGenerationGuard");
assert.equal(BLOCKED_MOMENT_RETRY_COOLDOWN_MS, 3 * 60 * 60 * 1000, "安全拦截必须静默冷却 3 小时");
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
assert.equal(first.memory?.sourceMomentId, first.moment?.id, "自动朋友圈记忆必须关联来源动态");
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

const skipInput = {
  ...input(),
  relationId: "relation-skip",
  requestAi: async () => { apiCalls += 1; return { text: "SKIP" }; },
};
const firstSkipped = await requestCharacterMomentOnce(skipInput);
assert.equal(firstSkipped.skipped, true, "没有新内容时应记录当天跳过，而不是继续生成");
assert.equal(loadMomentGenerationTasks().value[getCharacterMomentTaskKey(character.id, new Date(fixedNow), "relation-skip")]?.status, "skipped");
const repeatedSkip = await requestCharacterMomentOnce(skipInput);
assert.equal(repeatedSkip.skipped, true, "当天跳过后再次进入不应重复请求 AI");
assert.equal(apiCalls, 3);

const blockedRelationId = "relation-blocked";
let blockedNow = fixedNow;
let blockedApiCalls = 0;
const blockedInput = () => ({
  ...input(),
  relationId: blockedRelationId,
  now: () => blockedNow,
  requestAi: async () => {
    blockedApiCalls += 1;
    throw new Error('自定义 API 接口请求失败 (400): request blocked by Gemini API: PROHIBITED_CONTENT');
  },
});
const firstBlocked = await requestCharacterMomentOnce(blockedInput());
assert.equal(firstBlocked.blockedReason, "prohibited-content");
const blockedTaskKey = getCharacterMomentTaskKey(character.id, new Date(blockedNow), blockedRelationId);
assert.equal(loadMomentGenerationTasks().value[blockedTaskKey]?.status, "blocked");
await requestCharacterMomentOnce(blockedInput());
assert.equal(blockedApiCalls, 1, "内容安全拦截后不得每分钟重复请求");
blockedNow += BLOCKED_MOMENT_RETRY_COOLDOWN_MS;
await requestCharacterMomentOnce(blockedInput());
assert.equal(blockedApiCalls, 2, "内容修正后应允许在冷却结束时重新尝试");

const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.doesNotMatch(appChatSource, /\[动态内容被拦截\]/, "自动动态被内容安全拦截时必须静默跳过");

assert.equal(saveMoments([first.moment!]).success, true);
assert.equal(recordDeletedCharacterMoment(first.moment!, new Date(fixedNow + 1)), true);
assert.equal(loadMomentGenerationTasks().value[taskKey]?.status, "deleted");
assert.equal(saveMoments(loadMoments([]).value.filter((moment) => moment.id !== first.moment!.id)).success, true);
assert.equal(loadMoments([]).value.some((moment) => moment.id === first.moment!.id), false, "删除后的动态不得在刷新后从 Repository 恢复");

resetMomentGenerationRuntimeForTests();
const afterRefresh = await requestCharacterMomentOnce(input());
assert.equal(afterRefresh.skipped, true, "删除后刷新不得恢复或重新生成当天任务");
assert.equal(apiCalls, 3);

const concurrentAfterDeletion = await Promise.all([requestCharacterMomentOnce(input()), requestCharacterMomentOnce(input())]);
assert.ok(concurrentAfterDeletion.every((result) => result.skipped), "两个入口同时触发也必须保持删除墓碑");
assert.equal(apiCalls, 3);

console.log("PASS moment auto-generation idempotency, duplicate effects/entries, concurrent triggers, deletion persistence, and refresh tombstone");
