export const CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION = 1;
export const CHARACTER_KNOWLEDGE_MIGRATION_VERSION = 3;

export type CharacterKnowledgeMigrationStatus = "idle" | "completed" | "failed";

/**
 * The migration is a one-time cutover. Version 3 also rewrites historical
 * canonical arrays through the meaning-level deduplicator before the legacy
 * MemoryItem store is retired as an active source of truth.
 */
export interface CharacterKnowledgeMigrationState {
  schemaVersion: number;
  migrationVersion: number;
  status: CharacterKnowledgeMigrationStatus;
  lastRunAt: number;
  lastError?: string;
  migratedMemoryIds: string[];
  migratedSummaryIds: string[];
  migratedCorrectionIds: string[];
  orphanRecordIds: string[];
  legacyMemoryStoreCleared?: boolean;
}
