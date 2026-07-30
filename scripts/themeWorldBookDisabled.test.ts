import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppWorldBook.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--surface-muted\)\] border-\[var\(--border\)\]/);
assert.match(source, /line-through text-\[var\(--text-disabled\)\]/);
assert.match(source, /bg-\[var\(--button-disabled-bg\)\] border-\[var\(--button-disabled-border\)\]/);
assert.match(source, /bg-\[var\(--badge-bg\)\]/);
console.log("PASS disabled WorldBook entries use readable muted surfaces, controls, and badges");
