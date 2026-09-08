import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const distIndexPath = join(projectRoot, "dist", "index.html");
assert.equal(existsSync(distIndexPath), true, "dist/index.html is missing; run npm run build first");
const manifestPath = join(projectRoot, "dist", "release-manifest.json");
assert.equal(existsSync(manifestPath), true, "dist/release-manifest.json is missing; run npm run build first");
const releaseManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  format?: string;
  appVersion?: string;
  dataSchemaVersion?: number;
  migrationScriptVersion?: string;
  backupVersion?: number;
  serviceWorkerCache?: string;
  sourceCommit?: string;
  rollback?: { requiresPreviousBuild?: boolean; dataIsNotAutomaticallyDeleted?: boolean; backupKeyBehaviorPreserved?: boolean };
};
assert.equal(releaseManifest.format, "fanfanji-release-manifest");
assert.equal(typeof releaseManifest.appVersion, "string");
assert.equal(typeof releaseManifest.dataSchemaVersion, "number");
assert.ok(releaseManifest.migrationScriptVersion);
assert.equal(typeof releaseManifest.backupVersion, "number");
assert.ok(releaseManifest.serviceWorkerCache && releaseManifest.serviceWorkerCache !== "unknown");
assert.ok(releaseManifest.sourceCommit);
assert.equal(releaseManifest.rollback?.requiresPreviousBuild, true);
assert.equal(releaseManifest.rollback?.dataIsNotAutomaticallyDeleted, true);
assert.equal(releaseManifest.rollback?.backupKeyBehaviorPreserved, true);

const indexHtml = readFileSync(distIndexPath, "utf8");
const assetReferences = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
assert.ok(assetReferences.length > 0, "production entry does not reference hashed assets");
for (const assetReference of assetReferences) {
  assert.equal(existsSync(join(projectRoot, "dist", assetReference.slice(1))), true, `missing production asset: ${assetReference}`);
}

assert.equal(existsSync(join(projectRoot, "server-dist", "server.cjs")), true, "server production bundle is missing");
const serviceWorker = readFileSync(join(projectRoot, "public", "sw.js"), "utf8");
assert.match(serviceWorker, /const CACHE_NAME\s*=\s*["'][^"']+["']/);
assert.match(serviceWorker, /self\.addEventListener\(["']activate["']/);
assert.match(serviceWorker, /self\.addEventListener\(["']fetch["']/);

console.log(`PASS release check: ${assetReferences.length} production assets, server bundle, and service worker are present`);
