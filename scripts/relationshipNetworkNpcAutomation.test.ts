import assert from "node:assert/strict";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { createRelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
import {
  RELATIONSHIP_NETWORK_NPC_CHAT_QUIET_MS,
  selectRelationshipNetworkNpcMomentAutomationCandidate,
} from "../src/features/moments/services/relationshipNetworkNpcAutomationService";
import {
  findRelationshipNetworkNpcAutomationState,
  upsertRelationshipNetworkNpcAutomationState,
} from "../src/core/storage/repositories/relationshipNetworkNpcAutomationRepository";
import type { CharacterEvent } from "../src/domain/characterLife/characterEventTypes";
import type { Message, Moment } from "../src/types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

const relation = createRelationship({ id: "automation-relation", characterId: "automation-character", userIdentityId: "identity-a", now: 100 });
const npc = createRelationshipNetworkNpc({
  id: "automation-npc",
  ownerIdentityId: "identity-a",
  name: "自动 NPC",
  summary: "会根据关系变化分享近况",
  momentAutoMode: "scheduled_and_event",
  momentAutoFrequency: "high",
  now: 100,
});
const baseMoment: Moment = {
  id: "automation-moment",
  characterId: "automation-character",
  relationId: relation.id,
  relationshipNetworkNpcId: npc.id,
  ownerIdentityId: "identity-a",
  authorName: npc.name,
  authorAvatar: "🙂",
  content: "旧动态",
  timestamp: 100,
  likes: [],
  comments: [],
};

const scheduledNow = 100 + 4 * 60 * 60 * 1000 + 1;
const scheduled = selectRelationshipNetworkNpcMomentAutomationCandidate({
  npc,
  relationship: relation,
  messages: [],
  moments: [baseMoment],
  events: [],
  now: scheduledNow,
});
assert.equal(scheduled?.trigger, "schedule");
assert.equal(selectRelationshipNetworkNpcMomentAutomationCandidate({
  npc,
  relationship: relation,
  messages: [],
  moments: [baseMoment],
  events: [],
  state: { ownerIdentityId: "identity-a", npcId: npc.id, lastAttemptKey: scheduled?.key, lastAttemptAt: scheduledNow, updatedAt: scheduledNow },
  now: scheduledNow + 1000,
}), null);

const event: CharacterEvent = {
  id: "automation-event",
  relationId: relation.id,
  characterId: relation.characterId,
  userIdentityId: relation.userIdentityId,
  kind: "relationship_progressed",
  summary: "双方确认了新的约定",
  source: "test",
  occurredAt: 200,
  recordedAt: 200,
  confidence: 1,
  status: "active",
  schemaVersion: 1,
};
const eventCandidate = selectRelationshipNetworkNpcMomentAutomationCandidate({
  npc,
  relationship: relation,
  messages: [],
  moments: [baseMoment],
  events: [event],
  now: 300,
});
assert.equal(eventCandidate?.trigger, "relationship-event");

const chatMessage: Message = {
  id: "automation-message",
  characterId: relation.characterId,
  relationId: relation.id,
  sender: "user",
  content: "刚刚聊完一件事",
  timestamp: 300,
};
const chatNpc = { ...npc, momentAutoMode: "event" as const };
const chatCandidate = selectRelationshipNetworkNpcMomentAutomationCandidate({
  npc: chatNpc,
  relationship: relation,
  messages: [chatMessage],
  moments: [baseMoment],
  events: [],
  now: 300 + RELATIONSHIP_NETWORK_NPC_CHAT_QUIET_MS,
});
assert.equal(chatCandidate?.trigger, "chat-event");

assert.equal(upsertRelationshipNetworkNpcAutomationState({
  ownerIdentityId: "identity-a",
  npcId: npc.id,
  lastAttemptKey: chatCandidate?.key,
  lastAttemptAt: 500,
  updatedAt: 500,
}).success, true);
assert.equal(findRelationshipNetworkNpcAutomationState("identity-a", npc.id)?.lastAttemptKey, chatCandidate?.key);
assert.equal(upsertRelationshipNetworkNpcAutomationState({
  ownerIdentityId: "identity-b",
  npcId: npc.id,
  updatedAt: 600,
}).success, false);

console.log("relationship network NPC automation tests passed");
