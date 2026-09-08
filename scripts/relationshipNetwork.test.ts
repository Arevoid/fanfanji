import assert from "node:assert/strict";
import { createEmptyRelationshipNetwork, createRelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
import {
  listRelationshipNetworkChatLinksForIdentity,
  upsertRelationshipNetworkChatLink,
} from "../src/core/storage/repositories/relationshipNetworkChatLinkRepository";
import {
  findRelationshipNetworkSocialLinkByEdge,
  listRelationshipNetworkSocialLinksForIdentity,
  removeRelationshipNetworkSocialLink,
  removeRelationshipNetworkSocialLinksForEntity,
  upsertRelationshipNetworkSocialLink,
} from "../src/core/storage/repositories/relationshipNetworkSocialLinkRepository";
import {
  listRelationshipNetworkMapsForIdentity,
  listRelationshipNetworkNpcsForIdentity,
  removeRelationshipNetworkNpc,
  upsertRelationshipNetworkMap,
  upsertRelationshipNetworkNpc,
} from "../src/core/storage/repositories/relationshipNetworkRepository";

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

const mapA = createEmptyRelationshipNetwork({
  id: "map-a",
  ownerIdentityId: "identity-a",
  identityNodeId: "node-a",
  now: 1,
});
assert.equal(mapA.nodes.length, 1);
assert.equal(mapA.nodes[0].entityType, "identity");
assert.equal(mapA.nodes[0].entityId, "identity-a");
assert.equal(upsertRelationshipNetworkMap(mapA).success, true);

const mapB = createEmptyRelationshipNetwork({
  id: "map-b",
  ownerIdentityId: "identity-b",
  identityNodeId: "node-b",
  now: 2,
});
assert.equal(upsertRelationshipNetworkMap(mapB).success, true);
assert.deepEqual(listRelationshipNetworkMapsForIdentity("identity-a").map((map) => map.id), ["map-a"]);
assert.deepEqual(listRelationshipNetworkMapsForIdentity("identity-b").map((map) => map.id), ["map-b"]);

const npcA = createRelationshipNetworkNpc({
  id: "npc-a",
  ownerIdentityId: "identity-a",
  name: "周医生",
  avatar: "🩺",
  summary: "关系网辅助人物",
  role: "社区医生",
  personality: "温和、谨慎",
  motivation: "保护病人",
  tags: ["现实", "医生"],
  now: 3,
});
assert.equal(upsertRelationshipNetworkNpc(npcA).success, true);
const storedNpcA = listRelationshipNetworkNpcsForIdentity("identity-a")[0];
assert.equal(storedNpcA?.role, "社区医生");
assert.equal(storedNpcA?.motivation, "保护病人");
assert.deepEqual(storedNpcA?.tags, ["现实", "医生"]);
assert.deepEqual(listRelationshipNetworkNpcsForIdentity("identity-a").map((npc) => npc.id), ["npc-a"]);
assert.deepEqual(listRelationshipNetworkNpcsForIdentity("identity-b"), []);

const linkedNpcA = { ...npcA, linkedCharacterId: "character-a", updatedAt: 4 };
assert.equal(upsertRelationshipNetworkNpc(linkedNpcA).success, true);
assert.equal(listRelationshipNetworkNpcsForIdentity("identity-a")[0]?.linkedCharacterId, "character-a");
assert.equal(upsertRelationshipNetworkChatLink({
  ownerIdentityId: "identity-a",
  npcId: "npc-a",
  characterId: "character-a",
  relationId: "relation-a",
  createdAt: 4,
  updatedAt: 4,
}).success, true);
assert.deepEqual(listRelationshipNetworkChatLinksForIdentity("identity-a").map((link) => link.characterId), ["character-a"]);
assert.equal(upsertRelationshipNetworkChatLink({
  ownerIdentityId: "identity-b",
  npcId: "npc-a",
  characterId: "character-b",
  relationId: "relation-b",
  createdAt: 5,
  updatedAt: 5,
}).success, false);

assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-a",
  ownerIdentityId: "identity-a",
  sourceEntityType: "npc",
  sourceEntityId: "npc-a",
  targetEntityType: "character",
  targetEntityId: "character-a",
  relationshipLabel: "好友",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: false,
  commentFrequency: "low",
  networkEdgeId: "edge-a",
  createdAt: 4,
  updatedAt: 4,
}).success, true);
assert.equal(findRelationshipNetworkSocialLinkByEdge("identity-a", "edge-a")?.relationshipLabel, "好友");
assert.equal(listRelationshipNetworkSocialLinksForIdentity("identity-a").length, 1);
assert.equal(removeRelationshipNetworkSocialLink("identity-a", "social-a").success, true);
assert.deepEqual(listRelationshipNetworkSocialLinksForIdentity("identity-a"), []);
assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-a2",
  ownerIdentityId: "identity-a",
  sourceEntityType: "npc",
  sourceEntityId: "npc-a",
  targetEntityType: "character",
  targetEntityId: "character-a",
  relationshipLabel: "好友",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: true,
  commentFrequency: "normal",
  createdAt: 6,
  updatedAt: 6,
}).success, true);
assert.equal(removeRelationshipNetworkSocialLinksForEntity("identity-a", "npc", "npc-a").success, true);
assert.deepEqual(listRelationshipNetworkSocialLinksForIdentity("identity-a"), []);

const conflictingMap = { ...mapA, ownerIdentityId: "identity-b" };
assert.equal(upsertRelationshipNetworkMap(conflictingMap).success, false);
const conflictingNpc = { ...npcA, ownerIdentityId: "identity-b" };
assert.equal(upsertRelationshipNetworkNpc(conflictingNpc).success, false);

assert.equal(removeRelationshipNetworkNpc("identity-b", npcA.id).success, true);
assert.equal(listRelationshipNetworkNpcsForIdentity("identity-a").length, 1);
assert.equal(removeRelationshipNetworkNpc("identity-a", npcA.id).success, true);
assert.deepEqual(listRelationshipNetworkNpcsForIdentity("identity-a"), []);

console.log("relationship network repository tests passed");
