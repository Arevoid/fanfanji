import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppWorldBook.tsx", import.meta.url), "utf8");
assert.equal((source.match(/bg-\[var\(--segmented-active-bg\)\]/g) ?? []).length, 5);
assert.equal((source.match(/text-\[var\(--segmented-active-text\)\]/g) ?? []).length, 5);
assert.equal((source.match(/bg-\[var\(--segmented-inactive-bg\)\]/g) ?? []).length, 5);
assert.equal((source.match(/text-\[var\(--segmented-inactive-text\)\]/g) ?? []).length, 5);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.doesNotMatch(app, /\.font-extrabold:not\(/);
console.log("PASS actual WorldBook scope and trigger controls retain paired active/inactive tokens without global font overrides");
