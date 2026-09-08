import assert from "node:assert/strict";
import { runBackgroundProactivePass, runProactiveCatchupPass } from "../src/features/chat/services/proactiveChatPassService";

const now = Date.parse("2026-08-20T12:00:00");
const relation = {
  id: "r1", characterId: "c1", userIdentityId: "identity-1", conversationId: "r1-c1",
  enableProactiveChat: true, scheduledProactiveTime: now - 1_000,
} as any;
const character = { id: "c1", name: "范千", enableProactiveChat: true, isGroupChat: false } as any;
const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
const triggers: Array<{ id: string; backdate?: number }> = [];
const base = {
  relationships: [relation],
  characters: [character],
  messages: [],
  settingsName: "用户",
  isOfflineStoryActiveFor: () => false,
  processedCatchups: new Set<string>(),
  scheduleNextProactiveMessage: () => now + 60_000,
  updateRelationshipSession: (id: string, patch: Record<string, unknown>) => updates.push({ id, patch }),
  triggerProactiveFor: (id: string, _prompt?: string, backdate?: number) => { triggers.push({ id, backdate }); },
  checkAndTriggerCharacterMoments: () => undefined,
  now: () => now,
  random: () => 0,
};
runProactiveCatchupPass(base);
assert.equal(triggers.length, 1);
assert.equal(triggers[0].backdate, relation.scheduledProactiveTime);
assert.equal(base.processedCatchups.has("r1"), true);
updates.length = 0;
triggers.length = 0;
await runBackgroundProactivePass({ ...base, processedCatchups: new Set() });
assert.equal(triggers.length, 1, "due durable schedule triggers before random policy");
assert.equal(updates.length, 1);
assert.equal(updates[0].patch.lastActiveTime, now);
console.log("PASS proactive chat catch-up and recurring policy stay in a testable service boundary");
