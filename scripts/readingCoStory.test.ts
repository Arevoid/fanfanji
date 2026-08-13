import assert from "node:assert/strict";
import { getReadingCoStory, listReadingCoStoryTurns, saveReadingCoStoryStore } from "../src/core/storage/repositories/readingCoStoryRepository";
import { createEmptyReadingCoStoryStore } from "../src/domain/reading/coStoryTypes";
import { createReadingCoStory, createReadingCoStoryOpening, commitReadingCoStoryAiAction, commitReadingCoStoryUserAction, resolveReadingCoStoryApproval } from "../src/features/reading/story/readingCoStory";
import { buildReadingCoStoryAiActionPrompt, projectReadingCoStoryForAi } from "../src/features/reading/story/readingCoStoryPrompt";
import { ReadingCoStoryPolicyError } from "../src/features/reading/story/readingCoStoryPolicy";
import { generateReadingCoStoryAiAction } from "../src/features/reading/story/readingCoStoryGeneration";

class MemoryStorage implements Storage { private data = new Map<string, string>(); get length(): number { return this.data.size; } clear(): void { this.data.clear(); } getItem(key: string): string | null { return this.data.get(key) ?? null; } key(index: number): string | null { return [...this.data.keys()][index] ?? null; } removeItem(key: string): void { this.data.delete(key); } setItem(key: string, value: string): void { this.data.set(key, value); } }
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
saveReadingCoStoryStore(createEmptyReadingCoStoryStore());

const scope = { userIdentityId: "identity-a", coStoryId: "co-story-a", relationId: "relation-a", characterId: "character-a" };
const friend = { relationId: "relation-a", characterId: "character-a", displayName: "AI 好友", characterName: "沈砚", characterRole: "同行者", personaSummary: "谨慎、重视承诺，不替别人做决定。", knownIntel: ["城门正在戒严"], knownTurnIds: [] };
const story = createReadingCoStory({ scope, title: "共同穿书测试", length: "short", userCharacterName: "林舟", userCharacterRole: "旅人", userGoals: ["找到出口"], aiFriend: friend, now: 1 });
assert.equal(getReadingCoStory(scope)?.relationId, "relation-a");
assert.equal(getReadingCoStory({ ...scope, relationId: "relation-b", characterId: "character-b" }), undefined);
const opening = createReadingCoStoryOpening({ scope, narrative: "两个人在城门醒来。", choices: [{ id: "a", label: "观察城门" }], now: 1 });
assert.equal(opening.choices.length, 1);
assert.equal(createReadingCoStoryOpening({ scope, narrative: "不能覆盖", choices: [], now: 1 }).turnId, opening.turnId, "opening creation is idempotent");

const low = commitReadingCoStoryAiAction({ scope, result: { action: "观察城门守卫的换岗规律", rationale: "先收集信息，避免暴露", risk: "low", requiresUserApproval: false, controlsUserCharacter: false }, mode: "low_risk_execute", expectedStoryUpdatedAt: story.updatedAt, now: 2 });
assert.equal(low.decision.status, "accepted");
assert.equal(low.story.pendingApproval, undefined);

const major = commitReadingCoStoryAiAction({ scope, result: { action: "替你向守卫承认身份", rationale: "这可能改变你的身份和后续路线", risk: "major", requiresUserApproval: false, controlsUserCharacter: false }, mode: "suggest", expectedStoryUpdatedAt: low.story.updatedAt, now: 3 });
assert.equal(major.decision.status, "approval_required");
assert.equal(major.story.pendingApproval?.risk, "major");
assert.equal(listReadingCoStoryTurns(scope).length, 3);

assert.throws(() => commitReadingCoStoryAiAction({ scope, result: { action: "直接替用户答应婚约", rationale: "危险测试", risk: "low", requiresUserApproval: false, controlsUserCharacter: true }, mode: "low_risk_execute", expectedStoryUpdatedAt: major.story.updatedAt, now: 4 }), (error: unknown) => error instanceof ReadingCoStoryPolicyError && error.code === "forbidden");
assert.equal(listReadingCoStoryTurns(scope).length, 3);

const context = projectReadingCoStoryForAi({ story: major.story, turns: listReadingCoStoryTurns(scope) });
assert.equal(context.visibleRecentTurns.length, 3);
assert.equal(context.visibleRecentTurns[0]?.actor, "system", "AI friend knows the shared opening");
const prompt = buildReadingCoStoryAiActionPrompt({ context, mode: "ask_opinion", userRequest: "你怎么看" });
assert.match(prompt.systemInstruction, /不能替用户角色做决定/);
assert.match(prompt.systemInstruction, /requiresUserApproval/);
assert.match(prompt.message, /userRole/);

const generatedStory = createReadingCoStory({ scope: { ...scope, coStoryId: "co-story-generation" }, title: "共同生成测试", length: "short", userCharacterName: "用户", aiFriend: { ...friend, knownTurnIds: [] }, now: 10 });
let generationCalls = 0;
const generated = await generateReadingCoStoryAiAction({ story: generatedStory, mode: "suggest", settings: { apiKey: "key", selectedModel: "model" }, aiCall: async () => { generationCalls += 1; return { text: generationCalls === 1 ? "{}" : JSON.stringify({ action: "观察风向", rationale: "先收集低风险信息", risk: "low", requiresUserApproval: false, controlsUserCharacter: false }) }; }, now: 11 });
assert.equal(generationCalls, 2);
assert.equal(generated.story.coStoryId, "co-story-generation");
assert.equal(generated.attempts, 2);

console.log("AI friend co-story scope, knowledge projection, and major-decision guard tests passed");

const turnStory = createReadingCoStory({ scope: { ...scope, coStoryId: "co-story-turns" }, title: "turns", length: "short", userCharacterName: "user", aiFriend: { ...friend, knownTurnIds: [] }, now: 20 });
const userTurn = commitReadingCoStoryUserAction({ scope: { ...scope, coStoryId: "co-story-turns" }, userAction: "hide behind the gate", expectedStoryUpdatedAt: turnStory.updatedAt, now: 21 });
assert.equal(userTurn.turn.perspective, "user");
assert.equal(userTurn.story.activeActor, "ai_friend");
const majorTurn = commitReadingCoStoryAiAction({ scope: { ...scope, coStoryId: "co-story-turns" }, result: { action: "announce the user's identity", rationale: "this changes the route", risk: "major", requiresUserApproval: false, controlsUserCharacter: false }, mode: "suggest", expectedStoryUpdatedAt: userTurn.story.updatedAt, now: 22 });
assert.ok(majorTurn.story.pendingApproval);
const resolved = resolveReadingCoStoryApproval({ scope: { ...scope, coStoryId: "co-story-turns" }, actionId: majorTurn.story.pendingApproval!.actionId, approve: false, now: 23 });
assert.equal(resolved.pendingApproval, undefined);
assert.equal(listReadingCoStoryTurns({ ...scope, coStoryId: "co-story-turns" }).at(-1)?.perspective, "shared");
