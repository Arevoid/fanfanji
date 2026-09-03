import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/StickerSettings.tsx", import.meta.url), "utf8");
assert.match(source, /bg-\[var\(--button-secondary-bg\)\]/);
assert.match(source, /disabled:bg-\[var\(--button-disabled-bg\)\]/);
assert.match(source, /disabled:text-\[var\(--button-disabled-text\)\]/);
assert.match(source, /bg-\[var\(--badge-bg\)\]/);
assert.match(source, /<Sparkles className="w-2\.5 h-2\.5 text-current"/);
assert.match(source, /stickerNameDrafts/);
assert.match(source, /onBlur=\{\(e\) => void handleUpdateStickerName/);
assert.doesNotMatch(source, /grid grid-cols-4 gap-3 bg-white p-2\.5/);
assert.doesNotMatch(source, /bg-slate-50\/50 hover:bg-white border border-slate-100/);
assert.doesNotMatch(source, /filter:|invert\(/);
console.log("PASS sticker AI controls and group badges use readable states without altering image rendering");
