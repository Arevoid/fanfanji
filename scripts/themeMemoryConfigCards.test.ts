import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.equal((source.match(/theme-memory-config-card/g) || []).length, 4);
assert.equal((source.match(/bg-\[var\(--surface-raised\)\]/g) || []).length >= 4, true);
assert.equal((source.match(/theme-memory-range/g) || []).length, 3);
assert.match(source, /opacity-70 pointer-events-none/);
assert.match(source, /button-primary-bg/);
console.log("PASS memory cards, badges, range tracks and archive button use direct semantic classes");
