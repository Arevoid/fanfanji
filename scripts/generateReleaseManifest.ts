import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_VERSION } from "../src/core/release/releaseInfo";
import { CURRENT_STORAGE_SCHEMA_VERSION, STORAGE_MIGRATION_SCRIPT_VERSION } from "../src/core/storage/storageVersion";
import { SYSTEM_BACKUP_VERSION } from "../src/features/settings/systemBackup";

const projectRoot = process.cwd();
const serviceWorkerPath = join(projectRoot, "public", "sw.js");
const distDirectory = join(projectRoot, "dist");
const serviceWorker = existsSync(serviceWorkerPath) ? readFileSync(serviceWorkerPath, "utf8") : "";
const cacheName = serviceWorker.match(/const CACHE_NAME\s*=\s*["']([^"']+)["']/)?.[1] || "unknown";

let commit = "unavailable";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim() || commit;
} catch {
  // Source archives and environments without git still get a valid manifest.
}

const manifest = {
  format: "fanfanji-release-manifest",
  manifestVersion: 1,
  generatedAt: new Date().toISOString(),
  appVersion: APP_VERSION,
  dataSchemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
  migrationScriptVersion: STORAGE_MIGRATION_SCRIPT_VERSION,
  backupVersion: SYSTEM_BACKUP_VERSION,
  serviceWorkerCache: cacheName,
  sourceCommit: commit,
  rollback: {
    requiresPreviousBuild: true,
    dataIsNotAutomaticallyDeleted: true,
    backupKeyBehaviorPreserved: true,
  },
};

writeFileSync(join(distDirectory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Generated release manifest for ${APP_VERSION} (${commit})`);
