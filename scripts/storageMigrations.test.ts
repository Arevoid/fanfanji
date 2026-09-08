import assert from "node:assert/strict";
import { loadStorageMigrationState } from "../src/core/storage/storageMigrationState";
import { registerMigration, runMigrations } from "../src/core/storage/migrations";

const values = new Map<string, string>([["phone_data_schema_version", "1"]]);
const storage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
} as Storage;
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

let verified = false;
registerMigration({
  id: "test-additive-migration",
  fromVersion: 1,
  toVersion: 2,
  modules: ["messages"],
  migrate: ({ checkpoint }) => checkpoint("messages"),
  verify: () => {
    verified = true;
    return true;
  },
});

assert.deepEqual(runMigrations(), { status: "completed", sourceVersion: 1, targetVersion: 2 });
assert.equal(values.get("phone_data_schema_version"), "2");
assert.equal(verified, true);
assert.equal(loadStorageMigrationState()?.phase, "completed");
assert.deepEqual(loadStorageMigrationState()?.completedModules, ["messages"]);

values.set("phone_data_schema_version", "2");
let rolledBack = false;
registerMigration({
  id: "test-failing-migration",
  fromVersion: 2,
  toVersion: 3,
  migrate: () => { throw new Error("simulated failure"); },
  rollback: () => { rolledBack = true; },
});
const failed = runMigrations();
assert.equal(failed.status, "failed");
assert.equal(rolledBack, true);
assert.equal(values.get("phone_data_schema_version"), "2", "failed migration does not advance schema version");
assert.equal(loadStorageMigrationState()?.phase, "failed");
console.log("PASS storage migrations checkpoint, verify, and rollback checks");
