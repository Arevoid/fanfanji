import assert from "node:assert/strict";
import { isStorageMigrationState } from "../src/core/storage/storageMigrationState";

const state = {
  id: "migration-test",
  sourceVersion: 1,
  targetVersion: 2,
  phase: "verifying" as const,
  startedAt: 1,
  updatedAt: 2,
  currentModule: "messages",
  completedModules: ["characters"],
};

assert.equal(isStorageMigrationState(state), true);
assert.equal(isStorageMigrationState({ ...state, phase: "unknown" }), false);
assert.equal(isStorageMigrationState({ ...state, completedModules: [1] }), false);
assert.equal(isStorageMigrationState({ ...state, targetVersion: 1 }), false);
assert.equal(isStorageMigrationState(null), false);

console.log("storage migration state validation tests passed");
