import assert from "node:assert/strict";
import {
  appendRelationshipNetworkPendingMoment,
  listRelationshipNetworkPendingMomentsForIdentity,
  removeRelationshipNetworkPendingMoment,
} from "../src/core/storage/repositories/relationshipNetworkPendingMomentRepository";
import type { RelationshipNetworkPendingMoment } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";

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

const pending: RelationshipNetworkPendingMoment = {
  id: "pending-moment-a",
  ownerIdentityId: "identity-a",
  npcId: "npc-a",
  sourceCharacterId: "character-a",
  sourceRelationId: "relation-a",
  moment: {
    id: "moment-a",
    characterId: "character-a",
    relationId: "relation-a",
    relationshipNetworkNpcId: "npc-a",
    authorName: "周医生",
    authorAvatar: "🩺",
    content: "今天的风很轻。",
    timestamp: 20,
    likes: [],
    comments: [],
    ownerIdentityId: "identity-a",
  },
  createdAt: 20,
};

assert.equal(appendRelationshipNetworkPendingMoment(pending).success, true);
assert.equal(appendRelationshipNetworkPendingMoment({ ...pending, moment: { ...pending.moment, content: "重复写入" } }).success, true);
assert.equal(listRelationshipNetworkPendingMomentsForIdentity("identity-a").length, 1);
assert.equal(listRelationshipNetworkPendingMomentsForIdentity("identity-a")[0]?.moment.content, "今天的风很轻。");
assert.deepEqual(listRelationshipNetworkPendingMomentsForIdentity("identity-b"), []);

assert.equal(appendRelationshipNetworkPendingMoment({
  ...pending,
  id: "pending-moment-b",
  ownerIdentityId: "identity-b",
  moment: { ...pending.moment, id: "moment-b", ownerIdentityId: "identity-b" },
  createdAt: 30,
}).success, true);
assert.equal(removeRelationshipNetworkPendingMoment("identity-b", "pending-moment-b").success, true);
assert.equal(removeRelationshipNetworkPendingMoment("identity-a", "pending-moment-a").success, true);
assert.deepEqual(listRelationshipNetworkPendingMomentsForIdentity("identity-a"), []);

console.log("relationship network pending moment repository tests passed");
