import type { Character, MemoryItem, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type {
  BehaviorCorrectionRecord,
  ConversationSummaryRecord,
  KnowledgeClaim,
} from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import {
  CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION,
  CHARACTER_KNOWLEDGE_MIGRATION_VERSION,
  type CharacterKnowledgeMigrationState,
} from "../../../domain/characterKnowledge/characterKnowledgeMigrationTypes";
import {
  appendToKnowledgeClaims,
  loadKnowledgeClaims,
  saveKnowledgeClaims,
} from "../../../core/storage/repositories/characterKnowledgeRepository";
import {
  appendConversationSummaries,
  loadConversationSummaries,
  saveConversationSummaries,
} from "../../../core/storage/repositories/conversationSummaryRepository";
import {
  appendBehaviorCorrections,
  loadBehaviorCorrections,
  saveBehaviorCorrections,
} from "../../../core/storage/repositories/behaviorCorrectionRepository";
import {
  loadCharacterKnowledgeMigrationState,
  saveCharacterKnowledgeMigrationState,
} from "../../../core/storage/repositories/characterKnowledgeMigrationRepository";
import { loadMemories, saveMemories } from "../../../core/storage/repositories/memoryRepository";
import type { StorageResult, StorageWriteResult } from "../../../core/storage/storageTypes";
import { migrateLegacyCharacterKnowledge, type LegacyTruthMigrationResult } from "./legacyCharacterKnowledgeMigration";

export interface LegacyCharacterKnowledgeMigrationRunnerInput {
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  memories: readonly MemoryItem[];
  offlineStories?: readonly OfflineStory[];
  now: number;
}

export interface LegacyCharacterKnowledgeMigrationRunnerResult {
  status: "skipped" | "completed" | "failed";
  migration: LegacyTruthMigrationResult;
  error?: string;
  rollbackErrors: string[];
  legacyMemoryStoreCleared?: boolean;
}

export interface LegacyCharacterKnowledgeMigrationStores {
  claims: {
    load: () => StorageResult<KnowledgeClaim[]>;
    save: (value: readonly KnowledgeClaim[]) => StorageWriteResult;
  };
  summaries: {
    load: () => StorageResult<ConversationSummaryRecord[]>;
    save: (value: readonly ConversationSummaryRecord[]) => StorageWriteResult;
  };
  corrections: {
    load: () => StorageResult<BehaviorCorrectionRecord[]>;
    save: (value: readonly BehaviorCorrectionRecord[]) => StorageWriteResult;
  };
  state: {
    load: () => StorageResult<CharacterKnowledgeMigrationState>;
    save: (value: CharacterKnowledgeMigrationState) => StorageWriteResult;
  };
  /** The old MemoryItem store is cleared only after canonical verification. */
  legacyMemories?: {
    load: () => StorageResult<MemoryItem[]>;
    save: (value: readonly MemoryItem[]) => StorageWriteResult;
  };
}

const defaultStores: LegacyCharacterKnowledgeMigrationStores = {
  claims: { load: loadKnowledgeClaims, save: saveKnowledgeClaims },
  summaries: { load: loadConversationSummaries, save: saveConversationSummaries },
  corrections: { load: loadBehaviorCorrections, save: saveBehaviorCorrections },
  state: { load: loadCharacterKnowledgeMigrationState, save: saveCharacterKnowledgeMigrationState },
  legacyMemories: { load: () => loadMemories([]), save: saveMemories },
};

const isSafeRead = (result: StorageResult<unknown>): boolean => result.valid || !result.found;

const unique = (left: readonly string[], right: readonly string[]): string[] =>
  Array.from(new Set([...left, ...right]));

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

function mergeState(
  previous: CharacterKnowledgeMigrationState,
  migration: LegacyTruthMigrationResult,
  now: number,
  status: CharacterKnowledgeMigrationState["status"],
  lastError?: string,
  includeMigratedIds = true,
): CharacterKnowledgeMigrationState {
  return {
    schemaVersion: CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION,
    migrationVersion: CHARACTER_KNOWLEDGE_MIGRATION_VERSION,
    status,
    lastRunAt: now,
    ...(lastError ? { lastError } : {}),
    migratedMemoryIds: includeMigratedIds ? unique(previous.migratedMemoryIds, migration.migratedMemoryIds) : previous.migratedMemoryIds,
    migratedSummaryIds: includeMigratedIds ? unique(previous.migratedSummaryIds, migration.migratedSummaryIds) : previous.migratedSummaryIds,
    migratedCorrectionIds: includeMigratedIds ? unique(previous.migratedCorrectionIds, migration.migratedCorrectionIds) : previous.migratedCorrectionIds,
    orphanRecordIds: unique(previous.orphanRecordIds, migration.orphanRecordIds),
  };
}

function restoreStore<T>(
  label: string,
  save: (value: readonly T[]) => StorageWriteResult,
  value: readonly T[],
  rollbackErrors: string[],
): void {
  const result = save(value);
  if (!result.success) rollbackErrors.push(`${label}: ${result.error || "write"}`);
}

function restoreState(
  label: string,
  save: (value: CharacterKnowledgeMigrationState) => StorageWriteResult,
  value: CharacterKnowledgeMigrationState,
  rollbackErrors: string[],
): void {
  const result = save(value);
  if (!result.success) rollbackErrors.push(`${label}: ${result.error || "write"}`);
}

/**
 * Persists the legacy migration and cutover as one logical transaction. Each
 * localStorage key still has its own write, so a snapshot is kept and every
 * previously touched key is restored if a later key or the migration marker
 * fails. The old MemoryItem store is cleared only after canonical writes are
 * ready, and is restored if verification fails.
 *
 * `stores` is injectable so the rollback and verification contract can be
 * tested without relying on a browser or mocking React state.
 */
export function runLegacyCharacterKnowledgeMigration(
  input: LegacyCharacterKnowledgeMigrationRunnerInput,
  stores: LegacyCharacterKnowledgeMigrationStores = defaultStores,
): LegacyCharacterKnowledgeMigrationRunnerResult {
  const claimsBefore = stores.claims.load();
  const summariesBefore = stores.summaries.load();
  const correctionsBefore = stores.corrections.load();
  const stateBefore = stores.state.load();
  const migration: LegacyTruthMigrationResult = {
    claims: [],
    summaries: [],
    corrections: [],
    diagnostics: [],
    migratedMemoryIds: [],
    migratedSummaryIds: [],
    migratedCorrectionIds: [],
    orphanRecordIds: [],
  };

  const unsafeStore = [claimsBefore, summariesBefore, correctionsBefore, stateBefore]
    .find((result) => !isSafeRead(result));
  if (unsafeStore) {
    return {
      status: "failed",
      migration,
      error: `无法安全读取 Truth Layer 存储（${unsafeStore.error || "invalid"}），已保留原始数据。`,
      rollbackErrors: [],
    };
  }

  const previousState = stateBefore.value;
  if (previousState.status === "completed"
    && previousState.migrationVersion >= CHARACTER_KNOWLEDGE_MIGRATION_VERSION
    && previousState.legacyMemoryStoreCleared === true) {
    return { status: "skipped", migration, rollbackErrors: [], legacyMemoryStoreCleared: true };
  }
  const legacyMemoryStore = stores.legacyMemories;
  const legacyBefore: StorageResult<MemoryItem[]> = legacyMemoryStore
    ? legacyMemoryStore.load()
    : { value: [...input.memories], found: input.memories.length > 0, valid: true };
  if (!isSafeRead(legacyBefore)) {
    return {
      status: "failed",
      migration,
      error: `无法安全读取旧版 MemoryItem 存储（${legacyBefore.error || "invalid"}），已保留原始数据。`,
      rollbackErrors: [],
    };
  }
  const result = migrateLegacyCharacterKnowledge({
    ...input,
    memories: legacyBefore.value,
    existingClaims: claimsBefore.value,
    existingSummaries: summariesBefore.value,
    existingCorrections: correctionsBefore.value,
  });
  const nextClaims = appendToKnowledgeClaims(claimsBefore.value, result.claims);
  const nextSummaries = appendConversationSummaries(summariesBefore.value, result.summaries);
  const nextCorrections = appendBehaviorCorrections(correctionsBefore.value, result.corrections);
  const nextState = {
    ...mergeState(previousState, result, input.now, "completed"),
    legacyMemoryStoreCleared: Boolean(legacyMemoryStore),
  };
  const needsCanonicalRewrite = previousState.migrationVersion < CHARACTER_KNOWLEDGE_MIGRATION_VERSION;
  const rollbackErrors: string[] = [];
  const writes: Array<{ label: string; changed: boolean; write: () => StorageWriteResult }> = [
    { label: "claims", changed: needsCanonicalRewrite || !sameJson(nextClaims, claimsBefore.value), write: () => stores.claims.save(nextClaims) },
    { label: "summaries", changed: needsCanonicalRewrite || !sameJson(nextSummaries, summariesBefore.value), write: () => stores.summaries.save(nextSummaries) },
    { label: "corrections", changed: needsCanonicalRewrite || !sameJson(nextCorrections, correctionsBefore.value), write: () => stores.corrections.save(nextCorrections) },
    ...(legacyMemoryStore && legacyBefore.value.length > 0
      ? [{ label: "legacy MemoryItem store", changed: true, write: () => legacyMemoryStore.save([]) }]
      : []),
    { label: "migration state", changed: !sameJson(nextState, previousState), write: () => stores.state.save(nextState) },
  ];
  const touched = { claims: false, summaries: false, corrections: false, legacyMemories: false };

  for (const entry of writes) {
    if (!entry.changed) continue;
    const write = entry.write();
    if (!write.success) {
      if (touched.claims) restoreStore("claims rollback", stores.claims.save, claimsBefore.value, rollbackErrors);
      if (touched.summaries) restoreStore("summaries rollback", stores.summaries.save, summariesBefore.value, rollbackErrors);
      if (touched.corrections) restoreStore("corrections rollback", stores.corrections.save, correctionsBefore.value, rollbackErrors);
      if (touched.legacyMemories && legacyMemoryStore) restoreStore("legacy MemoryItem rollback", legacyMemoryStore.save, legacyBefore.value, rollbackErrors);
      if (entry.label === "migration state") restoreState("migration state rollback", stores.state.save, previousState, rollbackErrors);
      const error = `迁移写入 ${entry.label} 失败：${write.error || "write"}`;
      const failedState = mergeState(previousState, result, input.now, "failed", error, false);
      const stateWrite = stores.state.save(failedState);
      if (!stateWrite.success) rollbackErrors.push(`failed state: ${stateWrite.error || "write"}`);
      return { status: "failed", migration: result, error, rollbackErrors };
    }
    if (entry.label === "claims") touched.claims = true;
    if (entry.label === "summaries") touched.summaries = true;
    if (entry.label === "corrections") touched.corrections = true;
    if (entry.label === "legacy MemoryItem store") touched.legacyMemories = true;
  }

  const claimsAfter = stores.claims.load();
  const summariesAfter = stores.summaries.load();
  const correctionsAfter = stores.corrections.load();
  const stateAfter = stores.state.load();
  const legacyAfter = legacyMemoryStore?.load();
  const verificationFailed = !isSafeRead(claimsAfter)
    || !isSafeRead(summariesAfter)
    || !isSafeRead(correctionsAfter)
    || !isSafeRead(stateAfter)
    || !sameJson(claimsAfter.value, nextClaims)
    || !sameJson(summariesAfter.value, nextSummaries)
    || !sameJson(correctionsAfter.value, nextCorrections)
    || !sameJson(stateAfter.value, nextState)
    || Boolean(legacyAfter && (!isSafeRead(legacyAfter) || legacyAfter.value.length > 0));
  if (verificationFailed) {
    if (touched.claims) restoreStore("claims verification rollback", stores.claims.save, claimsBefore.value, rollbackErrors);
    if (touched.summaries) restoreStore("summaries verification rollback", stores.summaries.save, summariesBefore.value, rollbackErrors);
    if (touched.corrections) restoreStore("corrections verification rollback", stores.corrections.save, correctionsBefore.value, rollbackErrors);
    if (touched.legacyMemories && legacyMemoryStore) restoreStore("legacy MemoryItem verification rollback", legacyMemoryStore.save, legacyBefore.value, rollbackErrors);
    restoreState("migration state verification rollback", stores.state.save, previousState, rollbackErrors);
    const error = "迁移写入校验失败，已尝试恢复迁移前数据。";
    const failedState = mergeState(previousState, result, input.now, "failed", error, false);
    const stateWrite = stores.state.save(failedState);
    if (!stateWrite.success) rollbackErrors.push(`failed state: ${stateWrite.error || "write"}`);
    return { status: "failed", migration: result, error, rollbackErrors };
  }

  return {
    status: result.claims.length || result.summaries.length || result.corrections.length || result.diagnostics.length
      ? "completed"
      : "skipped",
    migration: result,
    rollbackErrors: [],
    legacyMemoryStoreCleared: Boolean(legacyMemoryStore),
  };
}
