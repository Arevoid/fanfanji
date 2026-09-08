import assert from "node:assert/strict";
import {
  appendRelationshipNetworkPendingInteraction,
  listRelationshipNetworkPendingInteractionsForIdentity,
  removeRelationshipNetworkPendingInteraction,
  removeRelationshipNetworkPendingInteractionsForMoment,
} from "../src/core/storage/repositories/relationshipNetworkPendingInteractionRepository";

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

const base = {
  id: "pending-a",
  ownerIdentityId: "identity-a",
  socialLinkId: "social-a",
  sourceNpcId: "npc-a",
  sourceCharacterId: "character-npc-a",
  sourceRelationId: "relation-npc-a",
  targetIdentityId: "identity-a",
  targetMomentId: "moment-a",
  action: "comment" as const,
  content: "辛苦了，早点休息。",
  authorName: "周医生",
  authorAvatar: "🩺",
  createdAt: 10,
};

assert.equal(appendRelationshipNetworkPendingInteraction(base).success, true);
assert.equal(appendRelationshipNetworkPendingInteraction({ ...base, content: "重复写入" }).success, true);
assert.equal(listRelationshipNetworkPendingInteractionsForIdentity("identity-a").length, 1);
assert.equal(listRelationshipNetworkPendingInteractionsForIdentity("identity-a")[0]?.content, "辛苦了，早点休息。");
assert.deepEqual(listRelationshipNetworkPendingInteractionsForIdentity("identity-b"), []);

assert.equal(appendRelationshipNetworkPendingInteraction({
  ...base,
  id: "pending-b",
  targetMomentId: "moment-b",
  action: "reply",
  targetCommentId: "comment-b",
  replyToCommentId: "comment-b",
  content: "收到，我也会留意。",
  createdAt: 20,
}).success, true);
assert.equal(removeRelationshipNetworkPendingInteractionsForMoment("identity-a", "moment-b").success, true);
assert.equal(listRelationshipNetworkPendingInteractionsForIdentity("identity-a").length, 1);
assert.equal(removeRelationshipNetworkPendingInteraction("identity-a", "pending-a").success, true);
assert.deepEqual(listRelationshipNetworkPendingInteractionsForIdentity("identity-a"), []);

console.log("relationship network pending interaction repository tests passed");
