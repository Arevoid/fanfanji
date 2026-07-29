import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppWorldBook.tsx", import.meta.url), "utf8");
assert.match(source, /segmented-active-bg/);
assert.match(source, /segmented-active-text/);
assert.match(source, /segmented-inactive-bg/);
assert.match(source, /segmented-inactive-text/);
assert.doesNotMatch(source, /bg-neutral-950 border-neutral-950 !text-white/);
console.log("PASS WorldBook scope and trigger segments own active/inactive semantic tokens");
