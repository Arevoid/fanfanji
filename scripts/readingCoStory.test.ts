import assert from "node:assert/strict";
import { getReadingCoStory, listReadingCoStoryTurns, saveReadingCoStoryStore } from "../src/core/storage/repositories/readingCoStoryRepository";
import { createEmptyReadingCoStoryStore } from "../src/domain/reading/coStoryTypes";
import { createReadingCoStory, commitReadingCoStoryAiAction } from "../src/features/reading/story/readingCoStory";
import { buildReadingCoStoryAiActionPrompt, projectReadingCoStoryForAi } from "../src/features/reading/story/readingCoStoryPrompt";
import { ReadingCoStoryPolicyError } from "../src/features/reading/story/readingCoStoryPolicy";

class MemoryStorage implements Storage { private data = new Map<string, string>(); get length(): number { return this.data.size; } clear(): void { this.data.clear(); } getItem(key: string): string | null { return this.data.get(key) ?? null; } key(index: number): string | null { return [...this.data.keys()][index] ?? null; } removeItem(key: string): void { this.data.delete(key); } setItem(key: string, value: string): void { this.data.set(key, value); } }
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: new MemoryStorage() } });
saveReadingCoStoryStore(createEmptyReadingCoStoryStore());

const scope = { userIdentityId: "identity-a", coStoryId: "co-story-a", relationId: "relation-a", characterId: "character-a" };
const friend = { relationId: "relation-a", characterId: "character-a", displayName: "AI 好友", characterName: "沈砚", characterRole: "同行者", personaSummary: "谨慎、重视承诺，不替别人做决定。", knownIntel: ["城门正在戒严"], knownTurnIds: [] };
const story = createReadingCoStory({ scope, title: "共同穿书测试", length: "short", userCharacterName: "林舟", userCharacterRole: "旅人", userGoals: ["找到出口"], aiFriend: friend, now: 1 });
assert.equal(getReadingCoStory(scope)?.relationId, "relation-a");
assert.equal(getReadingCoStory({ ...scope, relationId: "relation-b", characterId: "character-b" }), undefined);

const low = commitReadingCoStoryAiAction({ scope, result: { action: "观察城门守卫的换岗规律", rationale: "先收集信息，避免暴露", risk: "low", requiresUserApproval: false, controlsUserCharacter: false }, mode: "low_risk_execute", expectedStoryUpdatedAt: story.updatedAt, now: 2 });
assert.equal(low.decision.status, "accepted");
assert.equal(low.story.pendingApproval, undefined);

const major = commitReadingCoStoryAiAction({ scope, result: { action: "替你向守卫承认身份", rationale: "这可能改变你的身份和后续路线", risk: "major", requiresUserApproval: false, controlsUserCharacter: false }, mode: "suggest", expectedStoryUpdatedAt: low.story.updatedAt, now: 3 });
assert.equal(major.decision.status, "approval_required");
assert.equal(major.story.pendingApproval?.risk, "major");
assert.equal(listReadingCoStoryTurns(scope).length, 2);

assert.throws(() => commitReadingCoStoryAiAction({ scope, result: { action: "直接替用户答应婚约", rationale: "危险测试", risk: "low", requiresUserApproval: false, controlsUserCharacter: true }, mode: "low_risk_execute", expectedStoryUpdatedAt: major.story.updatedAt, now: 4 }), (error: unknown) => error instanceof ReadingCoStoryPolicyError && error.code === "forbidden");
assert.equal(listReadingCoStoryTurns(scope).length, 2);

const context = projectReadingCoStoryForAi({ story: major.story, turns: listReadingCoStoryTurns(scope) });
assert.equal(context.visibleRecentTurns.length, 2);
assert.equal(context.visibleRecentTurns.every((turn) => turn.actor === "ai_friend"), true);
const prompt = buildReadingCoStoryAiActionPrompt({ context, mode: "ask_opinion", userRequest: "你怎么看" });
assert.match(prompt.systemInstruction, /不能替用户角色做决定/);
assert.match(prompt.systemInstruction, /requiresUserApproval/);

console.log("AI friend co-story scope, knowledge projection, and major-decision guard tests passed");
