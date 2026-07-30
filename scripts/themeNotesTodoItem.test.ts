import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppNotes.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--surface-raised\)\] p-3 rounded-2xl border border-\[var\(--border\)\]/);
assert.match(source, /text-\[var\(--text-primary\)\]/);
assert.match(source, /text-\[var\(--text-secondary\)\] line-through/);
assert.match(source, /border-2 border-\[var\(--border-strong\)\]/);
assert.match(source, /bg-\[var\(--success\)\] text-white/);
console.log("PASS todo rows use direct readable text, card, and checkbox state tokens");
