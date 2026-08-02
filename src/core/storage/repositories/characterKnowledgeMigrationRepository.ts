import {
  CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION,
  CHARACTER_KNOWLEDGE_MIGRATION_VERSION,
  type CharacterKnowledgeMigrationState,
} from "../../../domain/characterKnowledge/characterKnowledgeMigrationTypes";
import { storageKeys } from "../storageKeys";
import type { StorageResult, StorageWriteResult } from "../storageTypes";
import { readJson, writeJson } from "../storageAdapter";

const cleanIds = (value: unknown): string[] => Array.isArray(value)
  ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())))
  : [];

const fallbackState = (): CharacterKnowledgeMigrationState => ({
  schemaVersion: CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION,
  migrationVersion: CHARACTER_KNOWLEDGE_MIGRATION_VERSION,
  lastRunAt: 0,
  migratedMemoryIds: [],
  migratedSummaryIds: [],
  migratedCorrectionIds: [],
  orphanRecordIds: [],
});

export function normalizeCharacterKnowledgeMigrationState(value: unknown): CharacterKnowledgeMigrationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallbackState();
  const record = value as Record<string, unknown>;
  const lastRunAt = typeof record.lastRunAt === "number" && Number.isFinite(record.lastRunAt) ? record.lastRunAt : 0;
  const migrationVersion = typeof record.migrationVersion === "number" && Number.isInteger(record.migrationVersion)
    ? record.migrationVersion
    : CHARACTER_KNOWLEDGE_MIGRATION_VERSION;
  return {
    schemaVersion: CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION,
    migrationVersion,
    lastRunAt,
    migratedMemoryIds: cleanIds(record.migratedMemoryIds),
    migratedSummaryIds: cleanIds(record.migratedSummaryIds),
    migratedCorrectionIds: cleanIds(record.migratedCorrectionIds),
    orphanRecordIds: cleanIds(record.orphanRecordIds),
  };
}

export const loadCharacterKnowledgeMigrationState = (): StorageResult<CharacterKnowledgeMigrationState> => {
  const result = readJson<unknown>(storageKeys.characterKnowledgeMigrationState, undefined);
  return {
    ...result,
    value: normalizeCharacterKnowledgeMigrationState(result.value),
  };
};

export const saveCharacterKnowledgeMigrationState = (
  state: CharacterKnowledgeMigrationState,
): StorageWriteResult => writeJson(storageKeys.characterKnowledgeMigrationState, normalizeCharacterKnowledgeMigrationState(state));

export const characterKnowledgeMigrationRepository = {
  load: loadCharacterKnowledgeMigrationState,
  save: saveCharacterKnowledgeMigrationState,
};
