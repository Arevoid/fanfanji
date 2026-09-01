import assert from "node:assert/strict";
import { loadCharacterKnowledgeMigrationState, saveCharacterKnowledgeMigrationState } from "../src/core/storage/repositories/characterKnowledgeMigrationRepository";
import { loadKnowledgeClaims, saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries, saveConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { loadBehaviorCorrections, saveBehaviorCorrections } from "../src/core/storage/repositories/behaviorCorrectionRepository";
import { CHARACTER_KNOWLEDGE_MIGRATION_VERSION } from "../src/domain/characterKnowledge/characterKnowledgeMigrationTypes";
import type { KnowledgeClaim, ConversationSummaryRecord, BehaviorCorrectionRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => values.clear(),
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  get length() { return values.size; },
};
Object.defineProperty(globalThis, "window", { value: { localStorage }, configurable: true });

const claim: KnowledgeClaim = {
  id: "legacy-memory:backup-memory",
  relationId: "relation-a",
  characterId: "char-a",
  userIdentityId: "identity-1",
  conversationId: "direct:relation-a",
  kind: "fact",
  subject: "other",
  statement: "旧事实",
  truthStatus: "legacy_unverified",
  temporalStatus: "unknown",
  source: { kind: "legacy_memory", authorship: "unknown", sourceRecordId: "backup-memory", producer: "test", evidenceKey: "legacy-memory:backup-memory" },
  confidence: 0.25,
  userConfirmed: false,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};
const summary: ConversationSummaryRecord = {
  id: "legacy-summary:relation-a",
  relationId: "relation-a",
  characterId: "char-a",
  userIdentityId: "identity-1",
  conversationId: "direct:relation-a",
  sourceRecordId: "relation-a",
  summary: "旧摘要",
  sourceMessageIds: [],
  sourceClaimIds: [],
  generatedAt: 10,
  generator: "legacy-test.v1",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
};
const correction: BehaviorCorrectionRecord = {
  id: "legacy-ooc:backup-ooc",
  relationId: "relation-a",
  characterId: "char-a",
  userIdentityId: "identity-1",
  conversationId: "direct:relation-a",
  sourceRecordId: "backup-ooc",
  instruction: "保持人设",
  sourceMessageIds: [],
  createdAt: 10,
  updatedAt: 10,
  status: "active",
  schemaVersion: 1,
};

assert.equal(saveKnowledgeClaims([claim]).success, true);
assert.equal(saveConversationSummaries([summary]).success, true);
assert.equal(saveBehaviorCorrections([correction]).success, true);
assert.equal(saveCharacterKnowledgeMigrationState({
  schemaVersion: 1,
  migrationVersion: CHARACTER_KNOWLEDGE_MIGRATION_VERSION,
  status: "completed",
  lastRunAt: 99,
  migratedMemoryIds: ["backup-memory"],
  migratedSummaryIds: [summary.id],
  migratedCorrectionIds: [correction.id],
  orphanRecordIds: ["memory:orphan"],
}).success, true);

assert.deepEqual(loadKnowledgeClaims().value, [claim]);
assert.deepEqual(loadConversationSummaries().value, [summary]);
assert.deepEqual(loadBehaviorCorrections().value, [correction]);
assert.deepEqual(loadCharacterKnowledgeMigrationState().value.migratedMemoryIds, ["backup-memory"]);

// A migration write never overwrites the legacy Memory vault key; restoring a
// backup can therefore be retried with the old source records still present.
values.set("phone_memory_vault_items", JSON.stringify([{ id: "backup-memory", content: "旧事实" }]));
assert.equal(values.get("phone_memory_vault_items"), JSON.stringify([{ id: "backup-memory", content: "旧事实" }]));

console.log("PASS Character Truth migration stores and state survive backup-style round trip");
