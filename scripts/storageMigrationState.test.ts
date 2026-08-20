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
  report: { completed: 1, skipped: 0, repaired: 0, failed: 0, modules: [{ module: "characters", status: "completed", records: 2, repaired: 0 }] },
};

assert.equal(isStorageMigrationState(state), true);
assert.equal(isStorageMigrationState({ ...state, phase: "unknown" }), false);
assert.equal(isStorageMigrationState({ ...state, completedModules: [1] }), false);
assert.equal(isStorageMigrationState({ ...state, targetVersion: 1 }), false);
assert.equal(isStorageMigrationState({ ...state, report: { completed: 1, skipped: 0, repaired: 0, failed: 0, modules: [{ module: "characters", status: "completed", records: -1, repaired: 0 }] } }), false);
assert.equal(isStorageMigrationState(null), false);

console.log("storage migration state validation tests passed");
