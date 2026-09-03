import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.equal((source.match(/theme-memory-config-card/g) || []).length, 3);
assert.equal((source.match(/bg-\[var\(--surface-raised\)\]/g) || []).length >= 3, true);
assert.equal((source.match(/theme-memory-range/g) || []).length, 2);
assert.doesNotMatch(source, /对话后台自动归档/);
assert.match(source, /button-primary-bg/);
console.log("PASS memory cards, badges, range tracks and archive button use direct semantic classes");
