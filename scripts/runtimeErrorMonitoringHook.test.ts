import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/features/monitoring/hooks/useRuntimeErrorMonitoring.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

assert.match(app, /useRuntimeErrorMonitoring\(\)/);
assert.match(hook, /addEventListener\("error"/);
assert.match(hook, /addEventListener\("unhandledrejection"/);
assert.match(hook, /removeEventListener\("error"/);
assert.match(hook, /removeEventListener\("unhandledrejection"/);
assert.doesNotMatch(hook, /event\.(message|stack)/);

console.log("PASS runtime error monitoring installs and cleans global listeners without retaining error content");
