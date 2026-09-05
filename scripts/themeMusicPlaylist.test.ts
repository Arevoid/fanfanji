import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppMusic.tsx", import.meta.url), "utf8");
assert.match(source, /当前播放列表/);
assert.match(source, /bg-\[var\(--surface-selected\)\] border-\[var\(--accent\)\] text-\[var\(--text-primary\)\]/);
assert.match(source, /bg-\[var\(--surface-raised\)\] border-\[var\(--border\)\] text-\[var\(--text-primary\)\]/);
assert.match(source, /button-secondary-bg/);
assert.match(source, /hover:text-\[var\(--danger\)\]/);
console.log("PASS playlist rows and add-song action own semantic surface, text and danger states");
