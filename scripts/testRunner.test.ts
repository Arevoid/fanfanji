import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts?: Record<string, string>;
};
const runnerSource = readFileSync(new URL("./runAllTests.ts", import.meta.url), "utf8");

assert.equal(packageJson.scripts?.test, "tsx scripts/runAllTests.ts");
assert.equal(packageJson.scripts?.check, "npm run lint && npm test && npm run build");
assert.match(runnerSource, /\.test\\\.\(\?:ts\|tsx\)\$/);
assert.match(runnerSource, /spawnSync\(process\.execPath, \["--import", "tsx", testFile\]/);
assert.doesNotMatch(runnerSource, /powershell|npx(?:\.cmd)?|execSync|shell:\s*true/i);

console.log("PASS cross-platform test runner and package release gate");
