import assert from "node:assert/strict";
import { acceptLifeEpisode, emptyCharacterContinuity } from "../src/domain/memory/characterContinuity";
import { CHARACTER_CONTINUITY_KEY, loadCharacterContinuity } from "../src/core/storage/repositories/characterContinuityRepository";
import { runForegroundCharacterContinuity } from "../src/features/characterKnowledge/services/characterContinuityService";
import type { Character, UserSettings } from "../src/types";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const goal = acceptLifeEpisode({ summary: "准备整理书架", status: "planned", activity: { goal: "整理书架", kind: "hobby", steps: ["分类旧书", "摆放书籍"] } }, scope, 100, "goal", [])!;
async function simulate(summary: string, support: boolean, stepIndex = 0) {
  values.clear(); values.set(CHARACTER_CONTINUITY_KEY, JSON.stringify({ ...emptyCharacterContinuity(), life: [goal] })); let requests = 0;
  const outcome = await runForegroundCharacterContinuity({ scope, character: { id: "a", name: "角色" } as Character,
    settings: { apiKey: "synthetic", selectedModel: "synthetic" } as UserSettings, visible: true, now: 86401000, readClaims: () => [], request: async (params) => {
      requests++;
      if (params.systemInstruction?.startsWith("独立核对虚拟生活续篇")) {
        const input = JSON.parse(params.message); assert.equal(input.currentStep, "分类旧书");
        return { text: JSON.stringify({ previousId: "goal", supported: support, quote: summary, confidence: .99, reason: support ? "当前分类步骤明确完成，按计划只是过程背景" : "散步不能证明分类旧书已完成" }) };
      }
      return { text: JSON.stringify({ impressions: [], lifeEvents: [], lifeContinuations: [{ previousEpisodeId: "goal", status: "progressed", stepIndex, summary }] }) };
    } });
  assert.equal(outcome, "completed"); return { requests, store: loadCharacterContinuity().value };
}
const natural = "按计划开始整理书架，已经完成了分类旧书，书本变得有条理了一些";
const passed = await simulate(natural, true); assert.equal(passed.requests, 2);
assert.equal(passed.store.life.length, 2); assert.equal(passed.store.life.at(-1)?.activity?.progress, 1);
assert.equal(passed.store.life.at(-1)?.summary, natural, "semantic acceptance must not rewrite the result into a fabricated literal-step sentence");
const refused = await simulate("散步回来，完全没有整理书架", false); assert.equal(refused.requests, 2);
assert.equal(refused.store.life.length, 1); assert.equal(refused.store.life[0].activity?.progress, 0);
const skipped = await simulate(natural, true, 1); assert.equal(skipped.requests, 1, "invalid runtime step cannot spend an extra review request");
assert.equal(skipped.store.life.length, 1);
console.log("PASS semantic life results: formal reflection writer, natural completion despite plan wording, unrelated activity refusal, immutable summary and ordered-step/no-extra-cost guard; model judgments synthetic");
