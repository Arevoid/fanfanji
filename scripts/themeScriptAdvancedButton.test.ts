import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--button-secondary-bg\)\]/);
assert.match(source, /text-\[var\(--button-secondary-text\)\]/);
assert.match(source, /disabled:bg-\[var\(--button-disabled-bg\)\]/);
assert.match(source, /disabled:text-\[var\(--button-disabled-text\)\]/);
console.log("PASS offline memory-sync action has readable enabled and disabled semantic button states");
