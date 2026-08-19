import { readString, writeString } from "./storageAdapter";
import { storageKeys } from "./storageKeys";
import { loadStorageMigrationState, saveStorageMigrationState, type StorageMigrationState } from "./storageMigrationState";

export interface StorageMigration {
  fromVersion: number;
  toVersion: number;
  /** Optional stable label used for resumable module checkpoints. */
  id?: string;
  modules?: readonly string[];
  migrate: (context: StorageMigrationContext) => void;
  verify?: () => boolean;
  rollback?: () => void;
}

export interface StorageMigrationContext {
  sourceVersion: number;
  targetVersion: number;
  completedModules: readonly string[];
  checkpoint: (module: string) => void;
}

export interface StorageMigrationRunResult {
  status: "skipped" | "completed" | "failed" | "blocked";
  sourceVersion?: number;
  targetVersion?: number;
  error?: string;
}

const migrations: StorageMigration[] = [];

export function registerMigration(migration: StorageMigration): void {
  if (!Number.isInteger(migration.fromVersion)
    || !Number.isInteger(migration.toVersion)
    || migration.toVersion <= migration.fromVersion
    || typeof migration.migrate !== "function") {
    throw new Error("Invalid storage migration definition");
  }
  if (migrations.some((item) => item.fromVersion === migration.fromVersion)) {
    throw new Error(`Duplicate storage migration from version ${migration.fromVersion}`);
  }
  migrations.push(migration);
}

/**
 * Validates the registered chain without reading or mutating user data.
 * This is intentionally separate from runMigrations so production startup
 * can report a broken migration plan before any migration is attempted.
 */
export function validateMigrationChain(startVersion: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(startVersion) || startVersion < 0) {
    return { valid: false, error: "Invalid storage schema start version" };
  }
  let version = startVersion;
  for (const migration of [...migrations].sort((a, b) => a.fromVersion - b.fromVersion)) {
    if (migration.fromVersion < version) continue;
    if (migration.fromVersion !== version) {
      return { valid: false, error: `Missing storage migration from version ${version}` };
    }
    version = migration.toVersion;
  }
  return { valid: true };
}

/**
 * Future, opt-in migrations. Existing users are not assigned a version this
 * release. A migration must opt into a schema version first, and every step is
 * checkpointed before the next step is allowed to run. No migration is
 * registered by the current release.
 */
export function runMigrations(): StorageMigrationRunResult {
  const version = readString(storageKeys.dataSchemaVersion);
  if (!version.found || !version.valid || version.value === null) return { status: "skipped" };

  const currentVersion = Number(version.value);
  if (!Number.isInteger(currentVersion)) {
    console.warn("[storage] Ignoring an invalid data schema version.");
    return { status: "skipped", error: "invalid schema version" };
  }

  const chain = validateMigrationChain(currentVersion);
  if (!chain.valid) {
    console.error(`[storage] Migration chain is invalid: ${chain.error}`);
    return { status: "blocked", sourceVersion: currentVersion, error: chain.error };
  }

  let appliedVersion = currentVersion;
  const orderedMigrations = migrations
    .filter((item) => item.fromVersion >= appliedVersion)
    .sort((a, b) => a.fromVersion - b.fromVersion);
  for (const migration of orderedMigrations) {
    if (migration.fromVersion !== appliedVersion) {
      return { status: "blocked", sourceVersion: currentVersion, error: `Missing storage migration from version ${appliedVersion}` };
    }

    const previousState = loadStorageMigrationState();
    if (previousState
      && previousState.sourceVersion === migration.fromVersion
      && previousState.targetVersion === migration.toVersion
      && previousState.phase !== "completed") {
      return {
        status: "blocked",
        sourceVersion: currentVersion,
        targetVersion: migration.toVersion,
        error: `Migration ${previousState.id} is ${previousState.phase}; explicit recovery is required`,
      };
    }

    const migrationState: StorageMigrationState = {
      id: migration.id || `storage-${migration.fromVersion}-${migration.toVersion}`,
      sourceVersion: migration.fromVersion,
      targetVersion: migration.toVersion,
      phase: "migrating",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedModules: [],
    };
    const persistState = (state: StorageMigrationState): void => {
      const result = saveStorageMigrationState(state);
      if (!result.success) throw new Error(`Could not persist migration checkpoint: ${result.error || "write"}`);
    };
    try {
      persistState(migrationState);
      const checkpoint = (module: string) => {
        if (!module || migrationState.completedModules.includes(module)) return;
        migrationState.completedModules = [...migrationState.completedModules, module];
        migrationState.currentModule = module;
        migrationState.updatedAt = Date.now();
        persistState(migrationState);
      };
      migration.migrate({
        sourceVersion: migration.fromVersion,
        targetVersion: migration.toVersion,
        completedModules: migrationState.completedModules,
        checkpoint,
      });
      migrationState.phase = "verifying";
      migrationState.updatedAt = Date.now();
      persistState(migrationState);
      if (migration.verify && !migration.verify()) throw new Error("Migration verification failed");
      const schemaWrite = writeString(storageKeys.dataSchemaVersion, String(migration.toVersion));
      if (!schemaWrite.success) throw new Error(`Could not advance data schema version: ${schemaWrite.error || "write"}`);
    } catch (error) {
      try {
        migration.rollback?.();
      } catch (rollbackError) {
        console.error("[storage] Migration rollback failed.", rollbackError);
      }
      migrationState.phase = "failed";
      migrationState.updatedAt = Date.now();
      migrationState.error = error instanceof Error ? error.message : String(error);
      try {
        persistState(migrationState);
      } catch (stateError) {
        console.error("[storage] Failed to persist migration failure state.", stateError);
      }
      return { status: "failed", sourceVersion: currentVersion, targetVersion: migration.toVersion, error: migrationState.error };
    }

    appliedVersion = migration.toVersion;
    migrationState.phase = "completed";
    migrationState.currentModule = undefined;
    migrationState.updatedAt = Date.now();
    try {
      const result = saveStorageMigrationState(migrationState);
      if (!result.success) {
        return { status: "failed", sourceVersion: currentVersion, targetVersion: migration.toVersion, error: result.error || "migration state write" };
      }
    } catch (error) {
      return { status: "failed", sourceVersion: currentVersion, targetVersion: migration.toVersion, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return appliedVersion === currentVersion
    ? { status: "skipped", sourceVersion: currentVersion }
    : { status: "completed", sourceVersion: currentVersion, targetVersion: appliedVersion };
}
