import assert from "node:assert/strict";
import { evaluateProactiveAction, hasProactiveCallContextCue } from "../src/features/chat/services/proactiveActionPolicy";

const baseCharacter = { id: "c1", name: "角色", isGroupChat: false, enableProactiveCall: true, proactiveStartTime: "00:00", proactiveEndTime: "23:59" } as any;
const baseRelation = { id: "r1", characterId: "c1", userIdentityId: "identity-1", lastProactiveCallAt: undefined } as any;
const call = { type: "call" as const, reason: "刚才明确说想听声音" };
const cue = [{ id: "m1", sender: "user", content: "今晚想和你打个电话", timestamp: Date.now() - 10 * 60 * 1000 } as any];
assert.equal(hasProactiveCallContextCue(cue), true);
assert.deepEqual(evaluateProactiveAction({ action: call, character: baseCharacter, relationship: baseRelation, messages: cue, now: Date.now() }), { allowed: true });
assert.equal(evaluateProactiveAction({ action: call, character: baseCharacter, relationship: baseRelation, messages: [{ ...cue[0], content: "今晚早点休息" }], now: Date.now() }).allowed, false);
assert.equal((evaluateProactiveAction({ action: call, character: { ...baseCharacter, enableProactiveCall: false }, relationship: baseRelation, messages: cue, now: Date.now() }) as any).reason, "call_disabled");
assert.equal((evaluateProactiveAction({ action: call, character: baseCharacter, relationship: { ...baseRelation, lastProactiveCallAt: Date.now() }, messages: cue, now: Date.now() }) as any).reason, "call_throttled");
console.log("PASS proactive action context gate and shared call throttles");
