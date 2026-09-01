import assert from "node:assert/strict";
import { migrateLegacyCharacterKnowledge } from "../src/features/characterKnowledge/services/legacyCharacterKnowledgeMigration";
import { appendToKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { normalizeConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { normalizeBehaviorCorrections } from "../src/core/storage/repositories/behaviorCorrectionRepository";
import { DEFAULT_IDENTITY_ID, type CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../src/types";

const character: Character = {
  id: "char-a",
  name: "小念",
  avatar: "🙂",
  personality: "温柔",
  backstory: "",
  compressedMemory: "角色级旧摘要",
  lastActiveTime: 20,
};
const relationA: CharacterRelationship = {
  id: "relation-a",
  characterId: character.id,
  userIdentityId: DEFAULT_IDENTITY_ID,
  conversationId: "direct:relation-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 10,
  compressedMemory: "关系 A 的旧摘要",
};
const relationB: CharacterRelationship = {
  ...relationA,
  id: "relation-b",
  userIdentityId: "identity-b",
  conversationId: "direct:relation-b",
  compressedMemory: "关系 B 的旧摘要",
};
const memory = (overrides: Partial<MemoryItem> = {}): MemoryItem => ({
  id: "memory-a",
  characterId: character.id,
  relationId: relationA.id,
  content: "用户喜欢桂花茶",
  timestamp: 30,
  ...overrides,
});

const result = migrateLegacyCharacterKnowledge({
  characters: [character],
  relationships: [relationA, relationB],
  memories: [
    memory(),
    memory({ id: "memory-ooc", content: "[OOC 修正记录] 原回答：“我会替你决定。” 被指出不符合人设。用户修正意见：不要替用户做决定。", timestamp: 40 }),
    memory({ id: "memory-offline", relationId: relationA.id, content: "【线下剧本《旧故事》线上交接】\n[offline-story:story-1:summary]\n- 用户与小念曾讨论电影。", timestamp: 50 }),
    memory({ id: "memory-relationless", relationId: undefined, content: "无关系旧记录", timestamp: 60 }),
  ],
  offlineStories: [],
  now: 100,
});

assert.equal(result.claims.length, 3, "ordinary legacy memories and offline handoff become claims");
const ordinary = result.claims.find((claim) => claim.id === `legacy-memory:memory-a:${relationA.id}`);
assert.equal(ordinary?.truthStatus, "legacy_unverified");
assert.equal(ordinary?.relationId, relationA.id);
const offline = result.claims.find((claim) => claim.id === `legacy-memory:memory-offline:${relationA.id}`);
assert.equal(offline?.source.kind, "offline_story");
assert.equal(offline?.source.storyId, "story-1");
assert.equal(offline?.truthStatus, "legacy_unverified", "offline marker never auto-confirms a fact");

assert.equal(result.corrections.length, 1);
assert.equal(result.corrections[0].instruction, "不要替用户做决定。");
assert.equal(result.corrections[0].originalResponse, "我会替你决定。");
assert.equal(result.corrections[0].sourceRecordId, "memory-ooc");
assert.equal(result.claims.some((claim) => claim.id.includes("memory-ooc")), false, "OOC does not become a fact");

assert.equal(result.summaries.length, 3, "both relationship summaries and one default character summary migrate");
assert.ok(result.summaries.some((summary) => summary.sourceRecordId === relationB.id));
assert.ok(result.summaries.some((summary) => summary.sourceRecordId === character.id));

assert.equal(result.claims.find((claim) => claim.id === `legacy-memory:memory-relationless:${relationA.id}`)?.relationId, relationA.id, "a unique default relation is the only allowed fallback");

const rerun = migrateLegacyCharacterKnowledge({
  characters: [character],
  relationships: [relationA, relationB],
  memories: [memory()],
  existingClaims: result.claims,
  existingSummaries: result.summaries,
  existingCorrections: result.corrections,
  now: 200,
});
assert.equal(rerun.claims.length, 0, "repeat migration emits no duplicate claims");
assert.equal(rerun.summaries.length, 0, "repeat migration emits no duplicate summaries");
assert.equal(rerun.corrections.length, 0, "repeat migration emits no duplicate corrections");

const relationlessDefault = migrateLegacyCharacterKnowledge({
  characters: [character],
  relationships: [{ ...relationA, id: "relation-default" }],
  memories: [memory({ id: "memory-default", relationId: undefined })],
  now: 100,
});
assert.equal(relationlessDefault.claims[0]?.relationId, "relation-default");

const ambiguous = migrateLegacyCharacterKnowledge({
  characters: [character],
  relationships: [relationA, { ...relationA, id: "relation-default-2" }],
  memories: [memory({ id: "memory-ambiguous", relationId: undefined })],
  now: 100,
});
assert.equal(ambiguous.claims.length, 0);
assert.equal(ambiguous.diagnostics[0]?.diagnostic, "ambiguous_default_relation");

const orphan = migrateLegacyCharacterKnowledge({
  characters: [character],
  relationships: [relationB],
  memories: [memory({ id: "memory-orphan", relationId: undefined })],
  now: 100,
});
assert.equal(orphan.claims.length, 0);
assert.equal(orphan.diagnostics[0]?.diagnostic, "missing_relation");

// Repository normalizers retain migration provenance and dedupe on repeat.
assert.equal(appendToKnowledgeClaims(result.claims, result.claims).length, result.claims.length);
assert.equal(normalizeConversationSummaries(result.summaries).length, result.summaries.length);
assert.equal(normalizeBehaviorCorrections(result.corrections).length, result.corrections.length);

console.log("PASS character Truth Layer legacy migration, provenance, isolation, OOC separation, and idempotence");
