import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/staging-readiness.yml", import.meta.url), "utf8");
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /environment: staging/);
assert.match(workflow, /npm ci --ignore-scripts/);
assert.match(workflow, /npm run check/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /dist\/release-manifest\.json/);
assert.match(workflow, /retention-days: 14/);
assert.doesNotMatch(workflow, /wrangler deploy|npm run deploy|secrets\./);
console.log("PASS staging readiness is manual, reproducible, auditable, and does not auto-deploy");
