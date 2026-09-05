import assert from "node:assert/strict";
import type { Character, MemoryItem } from "../src/types";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
} from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { CharacterKnowledgeMigrationState } from "../src/domain/characterKnowledge/characterKnowledgeMigrationTypes";
import type { StorageResult, StorageWriteResult } from "../src/core/storage/storageTypes";
import {
  runLegacyCharacterKnowledgeMigration,
  type LegacyCharacterKnowledgeMigrationStores,
} from "../src/features/characterKnowledge/services/legacyCharacterKnowledgeMigrationRunner";

const character: Character = {
  id: "runner-character",
  name: "迁移角色",
  avatar: "🙂",
  personality: "稳定",
  backstory: "",
};
const relationA: CharacterRelationship = {
  id: "runner-relation-a",
  characterId: character.id,
  userIdentityId: "identity-1",
  conversationId: "direct:runner-a",
  relationship: "friend",
  createdAt: 1,
  updatedAt: 1,
};
const relationB: CharacterRelationship = {
  ...relationA,
  id: "runner-relation-b",
  userIdentityId: "identity-b",
  conversationId: "direct:runner-b",
};
const oldMemory = (relationId: string): MemoryItem => ({
  id: "same-legacy-id",
  characterId: character.id,
  relationId,
  content: `旧记录 ${relationId}`,
  timestamp: 10,
});

const valid = <T>(value: T): StorageResult<T> => ({ value, found: true, valid: true });

function createStores(options: { fail?: "claims" | "summaries" | "corrections" | "state" | "memories" } = {}): {
  stores: LegacyCharacterKnowledgeMigrationStores;
  values: { claims: KnowledgeClaim[]; summaries: ConversationSummaryRecord[]; corrections: BehaviorCorrectionRecord[]; state: CharacterKnowledgeMigrationState; memories: MemoryItem[] };
} {
  const values: {
    claims: KnowledgeClaim[];
    summaries: ConversationSummaryRecord[];
    corrections: BehaviorCorrectionRecord[];
    state: CharacterKnowledgeMigrationState;
    memories: MemoryItem[];
  } = {
    claims: [] as KnowledgeClaim[],
    summaries: [] as ConversationSummaryRecord[],
    corrections: [] as BehaviorCorrectionRecord[],
    state: {
      schemaVersion: 1,
      migrationVersion: 1,
      status: "idle" as const,
      lastRunAt: 0,
      migratedMemoryIds: [],
      migratedSummaryIds: [],
      migratedCorrectionIds: [],
    orphanRecordIds: [],
    },
    memories: [oldMemory(relationA.id), oldMemory(relationB.id)],
  };
  const write = <K extends keyof typeof values>(key: K, value: (typeof values)[K]): StorageWriteResult => {
    if (options.fail === key) return { success: false, error: "write" };
    (values as Record<string, unknown>)[key] = structuredClone(value);
    return { success: true };
  };
  return {
    values,
    stores: {
      claims: { load: () => valid(values.claims), save: (value) => write("claims", [...value]) },
      summaries: { load: () => valid(values.summaries), save: (value) => write("summaries", [...value]) },
      corrections: { load: () => valid(values.corrections), save: (value) => write("corrections", [...value]) },
      state: { load: () => valid(values.state), save: (value) => write("state", value) },
      legacyMemories: { load: () => valid(values.memories), save: (value) => write("memories", [...value]) },
    },
  };
}

const input = {
  characters: [character],
  relationships: [relationA, relationB],
  memories: [oldMemory(relationA.id), oldMemory(relationB.id)],
  now: 100,
};

const first = createStores();
const migrated = runLegacyCharacterKnowledgeMigration(input, first.stores);
assert.equal(migrated.status, "completed");
assert.equal(migrated.migration.claims.length, 2, "the same legacy id must be migratable into two isolated relations");
assert.equal(first.values.claims.length, 2);
assert.deepEqual(
  first.values.claims.map((claim) => [claim.id, claim.relationId, claim.source.sourceRecordId]),
  [
    [`legacy-memory:same-legacy-id:${relationA.id}`, relationA.id, "same-legacy-id"],
    [`legacy-memory:same-legacy-id:${relationB.id}`, relationB.id, "same-legacy-id"],
  ],
);
assert.equal(first.values.state.status, "completed");
assert.equal(first.values.memories.length, 0, "successful migration clears the old MemoryItem store");

const rerun = runLegacyCharacterKnowledgeMigration({ ...input, now: 200 }, first.stores);
assert.equal(rerun.status, "skipped", "a repeat startup must not duplicate the migrated records");
assert.equal(first.values.claims.length, 2);
assert.equal(first.values.state.status, "completed");

const failed = createStores({ fail: "summaries" });
const failedRun = runLegacyCharacterKnowledgeMigration({
  ...input,
  characters: [{ ...character, compressedMemory: "旧角色摘要" }],
  now: 300,
}, failed.stores);
assert.equal(failedRun.status, "failed");
assert.equal(failed.values.claims.length, 0, "a later target-store failure rolls back earlier claim writes");
assert.equal(failed.values.state.status, "failed");
assert.equal(failed.values.memories.length, 2, "failed migration restores the old MemoryItem store");
assert.match(failed.values.state.lastError || "", /summaries/);

const unsafe = createStores();
const unsafeStores = {
  ...unsafe.stores,
  claims: {
    load: () => ({ value: [], found: true, valid: false, error: "parse" as const }),
    save: unsafe.stores.claims.save,
  },
};
const unsafeRun = runLegacyCharacterKnowledgeMigration(input, unsafeStores);
assert.equal(unsafeRun.status, "failed");
assert.equal(unsafe.values.claims.length, 0, "invalid old target data must never be overwritten");

console.log("PASS Character Truth migration runner, scoped ids, idempotence, rollback, and invalid-store protection");
