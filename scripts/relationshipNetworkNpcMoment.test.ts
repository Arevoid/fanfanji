import assert from "node:assert/strict";
import type { Character, UserSettings } from "../src/types";
import { createRelationship } from "../src/domain/relationship/characterRelationship";
import { createRelationshipNetworkNpc } from "../src/domain/relationshipNetwork/relationshipNetworkTypes";
import { cleanAndExtractMoment } from "../src/features/moments/services/chatMomentUtils";
import { generateRelationshipNetworkNpcMoment } from "../src/features/moments/services/relationshipNetworkNpcMomentService";
import { resetMomentGenerationRuntimeForTests } from "../src/features/moments/services/momentGenerationGuard";

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

const ownerIdentityId = "identity-a";
const npc = createRelationshipNetworkNpc({
  id: "npc-a",
  ownerIdentityId,
  name: "周医生",
  avatar: "🩺",
  summary: "林默的同事，观察力很强。",
  role: "医生",
  personality: "温和、谨慎",
  motivation: "想提醒大家照顾好自己",
  now: 1,
});
const sourceCharacter: Character = {
  id: "character-npc-a",
  ownerIdentityId,
  name: "周医生",
  avatar: "🩺",
  personality: "普通角色资料",
  backstory: "社区诊所的医生。",
  relationshipNetworkNpcId: npc.id,
};
const relationship = createRelationship({
  id: "relation-npc-a",
  characterId: sourceCharacter.id,
  userIdentityId: ownerIdentityId,
  relationship: "friend",
  now: 2,
});
const settings = {
  apiKey: "test-key",
  selectedModel: "test-model",
  apiEndpoint: "https://example.test/v1",
  apiTemperature: 0.7,
} as UserSettings;
const requestAi = (async () => ({
  text: "今天在诊室窗边看到一束很亮的光，顺手把桌上的资料也整理好了。",
})) as typeof import("../src/utils/apiHelper").apiChat;

const generated = await generateRelationshipNetworkNpcMoment({
  npc,
  sourceCharacter,
  relationship,
  characters: [sourceCharacter],
  moments: [],
  worldBookEntries: [],
  knowledgeClaims: [],
  memories: [],
  events: [],
  topicHistory: [],
  settings,
  activeIdentityId: ownerIdentityId,
  occurredAt: 1_700_000_000_000,
  requestAi,
  cleanAndExtractMoment,
  characterExpressionPrompt: "",
});

assert.equal(generated.moment?.authorName, npc.name);
assert.equal(generated.moment?.authorAvatar, npc.avatar);
assert.equal(generated.moment?.relationshipNetworkNpcId, npc.id);
assert.equal(generated.moment?.characterId, sourceCharacter.id);
assert.equal(generated.moment?.relationId, relationship.id);
assert.equal(generated.moment?.comments.every((comment) => comment.authorName === npc.name), true);

const duplicateAttempt = await generateRelationshipNetworkNpcMoment({
  npc,
  sourceCharacter,
  relationship,
  characters: [sourceCharacter],
  moments: generated.moment ? [generated.moment] : [],
  worldBookEntries: [],
  knowledgeClaims: [],
  memories: [],
  events: [],
  topicHistory: [],
  settings,
  activeIdentityId: ownerIdentityId,
  occurredAt: 1_700_000_000_001,
  requestAi,
  cleanAndExtractMoment,
  characterExpressionPrompt: "",
});
assert.equal(duplicateAttempt.moment, undefined, "one linked NPC should not publish twice in the same local day");

resetMomentGenerationRuntimeForTests();
console.log("relationship network NPC moment tests passed");
