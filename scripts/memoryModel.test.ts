import { strict as assert } from "node:assert";
import type { MemoryItem } from "../src/types";
import {
  MEMORY_SOURCE_POLICIES,
  getMemorySourcePolicy,
  isMemoryRecordVisibleToRelation,
  memoryRecordScopeKey,
  memoryRecordFromBehaviorCorrection,
  memoryRecordFromConversationSummary,
  memoryRecordFromKnowledgeClaim,
  memoryRecordFromLegacyItem,
  normalizeMemoryRecord,
} from "../src/domain/memory/memoryModel";
import type { BehaviorCorrectionRecord, ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const legacy: MemoryItem = {
  id: "legacy-1",
  characterId: "char-a",
  relationId: "relation-a",
  content: "用户喜欢在周末喝咖啡",
  timestamp: 100,
  importance: 9,
  isManual: true,
};

const claim: KnowledgeClaim = {
  id: "claim-1",
  characterId: "char-a",
  relationId: "relation-a",
  userIdentityId: "identity-1",
  conversationId: "conversation-a",
  kind: "preference",
  subject: "user",
  statement: "用户喜欢在周末喝咖啡",
  truthStatus: "confirmed",
  temporalStatus: "timeless",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-1"], producer: "test", evidenceKey: "message-1" },
  confidence: 0.95,
  userConfirmed: true,
  recordedAt: 200,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const summary: ConversationSummaryRecord = {
  id: "summary-1",
  characterId: "char-a",
  relationId: "relation-a",
  userIdentityId: "identity-1",
  summary: "双方约定周末一起去咖啡店。",
  sourceMessageIds: ["message-1", "message-2"],
  sourceClaimIds: ["claim-1"],
  generatedAt: 300,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
};

const correction: BehaviorCorrectionRecord = {
  id: "correction-1",
  characterId: "char-a",
  relationId: "relation-a",
  userIdentityId: "identity-1",
  instruction: "不要替用户做决定。",
  sourceMessageIds: ["message-3"],
  createdAt: 400,
  updatedAt: 400,
  status: "active",
  schemaVersion: 1,
};

const legacyRecord = memoryRecordFromLegacyItem(legacy);
assert.equal(legacyRecord.layer, "episodic");
assert.equal(legacyRecord.visibility, "relation-private");
assert.equal(legacyRecord.userConfirmed, true);
assert.equal(legacyRecord.importance, 9);
assert.equal(legacyRecord.provenance.kind, "manual");
assert.equal(legacyRecord.provenance.app, "legacy");
assert.equal(legacy.content, "用户喜欢在周末喝咖啡", "projection must not mutate legacy data");
const coreRecord = memoryRecordFromKnowledgeClaim(claim);
assert.equal(coreRecord.layer, "core");
assert.equal(coreRecord.kind, "preference");
assert.deepEqual(coreRecord.provenance.sourceMessageIds, ["message-1"]);
assert.equal(coreRecord.scope.userIdentityId, "identity-1");
assert.equal(memoryRecordFromKnowledgeClaim({ ...claim, source: { ...claim.source, kind: "automatic_summary" } }).provenance.kind, "summary");
assert.equal(memoryRecordFromKnowledgeClaim({ ...claim, source: { ...claim.source, app: "cinema" } }).provenance.app, "cinema");
assert.equal(memoryRecordScopeKey(coreRecord.scope), "char-a\u001frelation-a\u001fidentity-1\u001fconversation-a\u001f");
assert.deepEqual(normalizeMemoryRecord({ ...coreRecord, content: "  用户喜欢在周末喝咖啡  " })?.content, "用户喜欢在周末喝咖啡");
assert.equal(normalizeMemoryRecord({ ...coreRecord, confidence: 2 }), undefined, "invalid confidence must not enter the canonical store");
assert.equal(normalizeMemoryRecord({ ...coreRecord, provenance: { ...coreRecord.provenance, kind: "not-a-source" } }), undefined, "unknown provenance must be rejected");

const summaryRecord = memoryRecordFromConversationSummary(summary);
assert.equal(summaryRecord.layer, "episodic");
assert.equal(summaryRecord.provenance.kind, "summary");
assert.deepEqual(summaryRecord.provenance.sourceClaimIds, ["claim-1"]);

const ruleRecord = memoryRecordFromBehaviorCorrection(correction);
assert.equal(ruleRecord.layer, "rule");
assert.equal(ruleRecord.kind, "rule");
assert.equal(ruleRecord.importance, 10);

assert.equal(isMemoryRecordVisibleToRelation(coreRecord, { characterId: "char-a", relationId: "relation-a", userIdentityId: "identity-1", conversationId: "conversation-a" }), true);
assert.equal(isMemoryRecordVisibleToRelation(coreRecord, { characterId: "char-a", relationId: "relation-b", userIdentityId: "identity-1" }), false);
assert.equal(isMemoryRecordVisibleToRelation(coreRecord, { characterId: "char-a", relationId: "relation-a", userIdentityId: "identity-2" }), false);
assert.equal(isMemoryRecordVisibleToRelation(coreRecord, { characterId: "char-a", relationId: "relation-a" }), false, "identity-scoped memory must not fall back to an unscoped read");
assert.equal(isMemoryRecordVisibleToRelation(memoryRecordFromLegacyItem({ ...legacy, relationId: undefined }), { characterId: "char-a", relationId: "relation-a" }), false, "unscoped legacy data must not become a wildcard");

const expectedApps = ["chat", "offline", "memory", "moments", "notes", "diary", "cinema", "schedule", "forum", "relationship-network", "music", "reading", "worldbook", "archives", "system", "legacy"] as const;
assert.deepEqual(Object.keys(MEMORY_SOURCE_POLICIES).sort(), [...expectedApps].sort());
assert.equal(getMemorySourcePolicy("notes").readMode, "user");
assert.equal(getMemorySourcePolicy("moments").defaultVisibility, "public");
assert.equal(getMemorySourcePolicy("offline").confirmationRequired, true);
assert.equal(getMemorySourcePolicy("archives").writeMode, "none");

console.log("Memory model: compatibility, scope, lifecycle and source-policy checks passed");
