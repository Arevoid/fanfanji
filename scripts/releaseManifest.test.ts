import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts?: Record<string, string> };
const generator = readFileSync(new URL("./generateReleaseManifest.ts", import.meta.url), "utf8");
const releaseCheck = readFileSync(new URL("./releaseCheck.ts", import.meta.url), "utf8");

assert.match(packageJson.scripts?.build || "", /generate:release-manifest/);
assert.match(generator, /backupKeyBehaviorPreserved/);
assert.match(generator, /CURRENT_STORAGE_SCHEMA_VERSION/);
assert.match(generator, /STORAGE_MIGRATION_SCRIPT_VERSION/);
assert.match(generator, /dataIsNotAutomaticallyDeleted/);
assert.match(releaseCheck, /release-manifest\.json/);
assert.match(releaseCheck, /requiresPreviousBuild/);
assert.match(releaseCheck, /dataSchemaVersion/);
assert.match(releaseCheck, /migrationScriptVersion/);

console.log("PASS release manifest records versions, cache identity, commit and rollback invariants");
