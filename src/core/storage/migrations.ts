import { readString, writeString } from "./storageAdapter";
import { storageKeys } from "./storageKeys";

export interface StorageMigration {
  fromVersion: number;
  toVersion: number;
  migrate: () => void;
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

/** Future, opt-in migrations. Existing users are not assigned a version this release. */
export function runMigrations(): void {
  const version = readString(storageKeys.dataSchemaVersion);
  if (!version.found || !version.valid || version.value === null) return;

  const currentVersion = Number(version.value);
  if (!Number.isInteger(currentVersion)) {
    console.warn("[storage] Ignoring an invalid data schema version.");
    return;
  }

  let appliedVersion = currentVersion;
  for (const migration of migrations
    .filter((item) => item.fromVersion >= appliedVersion)
    .sort((a, b) => a.fromVersion - b.fromVersion)) {
    if (migration.fromVersion !== appliedVersion) break;
    migration.migrate();
    appliedVersion = migration.toVersion;
  }

  if (appliedVersion !== currentVersion) {
    writeString(storageKeys.dataSchemaVersion, String(appliedVersion));
  }
}
