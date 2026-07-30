import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppWorldBook.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--surface-muted\)\] border-\[var\(--border\)\]/);
assert.match(source, /line-through text-\[var\(--text-disabled\)\]/);
assert.match(source, /bg-\[var\(--toggle-mono-off-bg\)\] border-\[var\(--toggle-mono-border\)\]/);
assert.match(source, /text-\[var\(--badge-muted-text\)\] bg-\[var\(--badge-muted-bg\)\]/);
assert.doesNotMatch(source, /text-\[var\(--badge-text\)\] bg-\[var\(--badge-bg\)\] px-1\.5 py-0\.5 rounded-md/);
console.log("PASS disabled WorldBook entries and category counts use readable muted surfaces");
