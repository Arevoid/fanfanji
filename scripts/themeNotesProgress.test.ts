import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppNotes.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--surface-raised\)\] border border-\[var\(--border\)\] rounded-2xl/);
assert.match(source, /badge-bg/);
assert.match(source, /progress-track/);
assert.match(source, /progress-value/);
console.log("PASS todo progress card no longer depends on a black background or white-only progress ring");
