import assert from "node:assert/strict";
import {
  appendRelationshipNetworkInteractionRecord,
  listRelationshipNetworkInteractionRecordsForIdentity,
  listRelationshipNetworkInteractionRecordsForSocialLink,
  removeRelationshipNetworkInteractionRecordsForEntity,
  removeRelationshipNetworkInteractionRecordsForSocialLink,
} from "../src/core/storage/repositories/relationshipNetworkInteractionRepository";

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
  ownerIdentityId: "identity-a",
  socialLinkId: "social-a",
  sourceNpcId: "npc-a",
  sourceCharacterId: "character-npc-a",
  targetCharacterId: "character-a",
  targetMomentId: "moment-a",
  action: "comment" as const,
  occurredAt: 10,
};

assert.equal(appendRelationshipNetworkInteractionRecord({ ...base, id: "interaction-a", status: "completed", content: "看起来不错。" }).success, true);
assert.equal(appendRelationshipNetworkInteractionRecord({ ...base, id: "interaction-a", status: "completed", content: "重复写入" }).success, true);
assert.equal(listRelationshipNetworkInteractionRecordsForIdentity("identity-a").length, 1);
assert.equal(listRelationshipNetworkInteractionRecordsForSocialLink("identity-a", "social-a")[0]?.content, "看起来不错。");
assert.deepEqual(listRelationshipNetworkInteractionRecordsForIdentity("identity-b"), []);
assert.equal(appendRelationshipNetworkInteractionRecord({
  ...base,
  id: "interaction-user-moment",
  targetCharacterId: undefined,
  targetIdentityId: "identity-a",
  targetMomentId: "moment-user-a",
  status: "completed",
  content: "今天也要记得休息。",
  occurredAt: 15,
}).success, true);
assert.equal(listRelationshipNetworkInteractionRecordsForSocialLink("identity-a", "social-a").length, 2);

assert.equal(appendRelationshipNetworkInteractionRecord({
  ...base,
  id: "interaction-b",
  socialLinkId: "social-b",
  sourceNpcId: "npc-b",
  targetCharacterId: "character-b",
  action: "like",
  status: "failed",
  reason: "未配置 API Key",
  occurredAt: 20,
}).success, true);
assert.equal(appendRelationshipNetworkInteractionRecord({
  ...base,
  id: "interaction-reply",
  targetCommentId: "comment-a",
  action: "reply",
  status: "completed",
  content: "回复一下。",
  occurredAt: 25,
}).success, true);
assert.equal(removeRelationshipNetworkInteractionRecordsForSocialLink("identity-a", "social-a").success, true);
assert.deepEqual(listRelationshipNetworkInteractionRecordsForSocialLink("identity-a", "social-a"), []);
assert.equal(removeRelationshipNetworkInteractionRecordsForEntity("identity-a", "npc", "npc-b").success, true);
assert.deepEqual(listRelationshipNetworkInteractionRecordsForIdentity("identity-a"), []);

console.log("relationship network interaction repository tests passed");
