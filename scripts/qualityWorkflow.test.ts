import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8");
assert.match(workflow, /pull_request/);
assert.match(workflow, /schedule:/);
assert.match(workflow, /cron: "17 2 \* \* \*"/);
assert.match(workflow, /npm ci --ignore-scripts/);
assert.match(workflow, /npm run check/);
assert.match(workflow, /permissions:\s+contents: read/);

console.log("PASS CI quality workflow installs reproducibly and runs the full repository gate");
