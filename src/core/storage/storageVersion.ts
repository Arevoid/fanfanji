/**
 * The generic schema migration registry is opt-in and currently has no
 * production migration assigned to existing users. Zero is therefore the
 * honest compatibility baseline recorded in release artifacts.
 */
export const CURRENT_STORAGE_SCHEMA_VERSION = 0 as const;

/** Stable identifier for the content entry-store migration shipped by this release. */
export const STORAGE_MIGRATION_SCRIPT_VERSION = "content-entry-storage-v1" as const;
