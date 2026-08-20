import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  version?: string;
  scripts?: Record<string, string>;
};
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as { lockfileVersion?: number; packages?: Record<string, { version?: string }> };
const server = readFileSync("server.ts", "utf8");
const worker = readFileSync("src/cloudflare/worker.ts", "utf8");
const index = readFileSync("index.html", "utf8");
const firstPaint = readFileSync("public/firstPaintTheme.js", "utf8");
const apiHelper = readFileSync("src/utils/apiHelper.ts", "utf8");
const apiUsageMetrics = readFileSync("src/core/monitoring/apiUsageMetrics.ts", "utf8");
const runtimeErrorMetrics = readFileSync("src/core/monitoring/runtimeErrorMetrics.ts", "utf8");
const backupActions = readFileSync("src/features/settings/hooks/useSystemBackupActions.ts", "utf8");
const backup = readFileSync("src/features/settings/systemBackup.ts", "utf8");

assert.ok(packageJson.version, "package version is required");
assert.ok(lockfile.lockfileVersion, "package-lock.json must be present and valid");
assert.equal(lockfile.packages?.[""].version, packageJson.version, "package and lockfile versions must match");
assert.match(packageJson.scripts?.["security:check"] || "", /npm audit/);
assert.match(packageJson.scripts?.check || "", /security:check/);
assert.match(server, /express\.json\(\{ limit: "15mb" \}\)/);
assert.match(server, /setHeader\("x-request-id"/);
assert.match(server, /app\.get\("\/healthz"/);
assert.match(server, /gracefully|graceful/i);
assert.match(index, /Content-Security-Policy" content=/);
assert.doesNotMatch(index, /Content-Security-Policy-Report-Only/);
assert.match(index, /script-src 'self'/);
assert.doesNotMatch(index, /<script>\s*\/\//);
assert.match(index, /firstPaintTheme\.js/);
assert.match(index, /connect-src 'self' https:/);
assert.match(server, /Content-Security-Policy.*CONTENT_SECURITY_POLICY|CONTENT_SECURITY_POLICY.*Content-Security-Policy/);
assert.match(worker, /Content-Security-Policy.*CONTENT_SECURITY_POLICY|CONTENT_SECURITY_POLICY.*Content-Security-Policy/);
assert.match(firstPaint, /phone_appearance_settings/);
assert.doesNotMatch(`${apiHelper}\n${apiUsageMetrics}\n${runtimeErrorMetrics}`, /console\.(?:log|warn|error)\([^\n]*apiKey/i, "API keys must not be written to logs or telemetry");
assert.doesNotMatch(apiUsageMetrics, /apiKey|prompt|message|body/i, "API usage telemetry must remain aggregate and secret-free");
assert.doesNotMatch(`${backupActions}\n${backup}`, /\beval\s*\(|new\s+Function\s*\(/, "JSON backup paths must not evaluate imported strings as code");
assert.match(backupActions, /filterSystemBackupLocalStorageForRestore/);
assert.match(backupActions, /sanitizeValue\(key, value, parsedBackup\.localStorage\)/);

console.log("PASS dependency, release, runtime, and enforced CSP governance checks");
