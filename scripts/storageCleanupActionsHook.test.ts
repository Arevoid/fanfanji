import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const source = readFileSync("src/features/settings/hooks/useStorageCleanupActions.ts", "utf8");
const page = readFileSync("src/components/AppSettings.tsx", "utf8");

assert.match(source, /cleanupOrphanedStorageResources/);
assert.match(source, /removeMigratedStorageCopies/);
assert.match(source, /confirm\(/);
assert.match(source, /refreshStorageDiagnostics/);
assert.match(page, /useStorageCleanupActions/);
assert.doesNotMatch(page, /cleanupOrphanedStorageResources|removeMigratedStorageCopies/);

console.log("PASS storage cleanup actions stay explicit, recoverable, and outside AppSettings");
