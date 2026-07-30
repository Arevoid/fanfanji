import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/StickerSettings.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--button-secondary-bg\)\]/);
assert.match(source, /disabled:bg-\[var\(--button-disabled-bg\)\]/);
assert.match(source, /disabled:text-\[var\(--button-disabled-text\)\]/);
assert.match(source, /bg-\[var\(--badge-bg\)\]/);
assert.match(source, /<Sparkles className="w-2\.5 h-2\.5 text-current"/);
assert.doesNotMatch(source, /filter:|invert\(/);
console.log("PASS sticker AI controls and group badges use readable states without altering image rendering");
