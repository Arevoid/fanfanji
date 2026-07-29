import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppArchives.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--badge-bg\)\] text-\[var\(--badge-text\)\]/);
assert.match(source, /bg-\[var\(--badge-muted-bg\)\] text-\[var\(--badge-muted-text\)\]/);
console.log("PASS archive MBTI and age badges use independent semantic foreground/background tokens");
