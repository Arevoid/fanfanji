import assert from "node:assert/strict";
import type { Character, Moment } from "../src/types";
import { createRelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
import {
  getRelationshipNetworkNpcActorCharacterId,
  getRelationshipNetworkNpcActorRelationId,
} from "../src/domain/relationshipNetwork/relationshipNetworkNpcActor";
import { upsertRelationshipNetworkNpc } from "../src/core/storage/repositories/relationshipNetworkRepository";
import { upsertRelationshipNetworkSocialLink } from "../src/core/storage/repositories/relationshipNetworkSocialLinkRepository";
import { listRelationshipNetworkMomentCommentCandidates } from "../src/features/moments/services/relationshipNetworkMomentCommentService";

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

const ownerIdentityId = "identity-npc-actor";
const npc = createRelationshipNetworkNpc({
  id: "npc-employee",
  ownerIdentityId,
  name: "小李",
  summary: "老板身边的员工。",
  role: "员工",
  personality: "谨慎、可靠",
  now: 1,
});
const target: Character = {
  id: "character-boss",
  ownerIdentityId,
  name: "角色 A",
  avatar: "🧑‍💼",
  personality: "果断",
  backstory: "公司的老板。",
};
const targetMoment: Moment = {
  id: "moment-boss-1",
  characterId: target.id,
  ownerIdentityId,
  authorName: target.name,
  authorAvatar: target.avatar,
  content: "今天把季度计划定下来了。",
  timestamp: 10,
  likes: [],
  comments: [],
};

assert.equal(upsertRelationshipNetworkNpc(npc).success, true);
assert.equal(upsertRelationshipNetworkSocialLink({
  id: "social-employee-boss",
  ownerIdentityId,
  sourceEntityType: "npc",
  sourceEntityId: npc.id,
  targetEntityType: "character",
  targetEntityId: target.id,
  relationshipLabel: "员工",
  enabled: true,
  canViewMoments: true,
  canCommentMoments: true,
  canLikeMoments: false,
  canReplyMoments: false,
  interactionApprovalMode: "automatic",
  commentFrequency: "high",
  createdAt: 2,
  updatedAt: 2,
}).success, true);

const candidates = listRelationshipNetworkMomentCommentCandidates({
  ownerIdentityId,
  targetCharacterId: target.id,
  characters: [target],
  relationships: [],
  existingMoments: [],
  currentMoment: targetMoment,
});

assert.equal(candidates.length, 1, "a lightweight NPC with a social edge can comment without promotion");
assert.equal(candidates[0].sourceCharacter.id, getRelationshipNetworkNpcActorCharacterId(npc.id));
assert.equal(candidates[0].sourceRelationship.id, getRelationshipNetworkNpcActorRelationId(npc.id));
assert.equal(candidates[0].npc.id, npc.id);

console.log("relationship network NPC actor tests passed");
