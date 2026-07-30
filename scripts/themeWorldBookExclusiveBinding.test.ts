import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppWorldBook.tsx", import.meta.url), "utf8");
const bindingBlock = source.match(/\{bindingType === "character"[\s\S]*?\n                  \)\}/)?.[0] || "";

assert.match(bindingBlock, /bg-\[var\(--surface-muted\)\]/);
assert.match(bindingBlock, /border-\[var\(--border\)\]/);
assert.match(bindingBlock, /text-\[var\(--text-secondary\)\]/);
assert.match(bindingBlock, /bg-\[var\(--input-bg\)\]/);
assert.match(bindingBlock, /text-\[var\(--text-primary\)\]/);
assert.match(bindingBlock, /focus:ring-\[var\(--accent\)\]/);
assert.doesNotMatch(bindingBlock, /bg-stone-|bg-white|text-stone-/);
assert.match(source, /setBindingType\("character"\)/);
assert.match(source, /setBoundCharacterId/);
assert.equal((source.match(/bg-\[var\(--segmented-active-bg\)\]/g) ?? []).length, 5);
assert.equal((source.match(/text-\[var\(--segmented-active-text\)\]/g) ?? []).length, 5);

console.log("PASS WorldBook exclusive character binding uses theme tokens without changing scope behavior");
