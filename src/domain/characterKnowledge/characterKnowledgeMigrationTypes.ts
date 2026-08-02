export const CHARACTER_KNOWLEDGE_MIGRATION_SCHEMA_VERSION = 1;
export const CHARACTER_KNOWLEDGE_MIGRATION_VERSION = 1;

/**
 * Startup bookkeeping is diagnostic only. Legacy stores remain the source of
 * truth for rollback, while deterministic IDs make a repeated run harmless.
 */
export interface CharacterKnowledgeMigrationState {
  schemaVersion: number;
  migrationVersion: number;
  lastRunAt: number;
  migratedMemoryIds: string[];
  migratedSummaryIds: string[];
  migratedCorrectionIds: string[];
  orphanRecordIds: string[];
}
