/** Dataset-owned metadata must travel with backups, never leak between imports. */
export const MEMORY_BACKUP_KEYS = [
  "phone_memory_system_v1", "phone_character_memory_continuity_v1",
  "phone_memory_continuity_migration_v1", "phone_memory_continuity_legacy_snapshot_v1",
  "phone_memory_extraction_tasks_v1", "phone_memory_organization_v1",
  "phone_memory_review_actions_v1", "phone_memory_read_policy_v1",
  "phone_memory_source_mutation_v1", "phone_memory_mentions_v1",
  "phone_memory_semantic_budget_v1", "phone_memory_migration_budget_v1",
  "phone_diary_memory_attempts_v1", "phone_memory_selected_characters_v1",
  "phone_memory_index_cleanup_v1",
] as const;

/** Appearance-only imports leave memories alone; an old full backup resets absent metadata. */
export function missingMemoryBackupKeys(source: Record<string, unknown>): string[] {
  if (!["phone_character_knowledge_claims", "phone_memory_vault_items", "phone_conversation_summaries",
    "phone_characters", "phone_characters_v3"].some(key => Object.hasOwn(source, key))) return [];
  return [...MEMORY_BACKUP_KEYS.filter(key => !Object.hasOwn(source, key)),
    "phone_memory_restore_transaction_v1"];
}
