import { readString, writeString } from "./storageAdapter";
import { storageKeys } from "./storageKeys";

export interface StorageMigration {
  fromVersion: number;
  toVersion: number;
  migrate: () => void;
}

const migrations: StorageMigration[] = [];

export function registerMigration(migration: StorageMigration): void {
  migrations.push(migration);
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
