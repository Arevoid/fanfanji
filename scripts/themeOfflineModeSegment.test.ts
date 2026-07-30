import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppOffline.tsx", import.meta.url), "utf8");
assert.match(source, /newMode === m\.id[\s\S]{0,300}bg-\[var\(--segmented-active-bg\)\][\s\S]{0,200}text-\[var\(--segmented-active-text\)\]/);
assert.match(source, /bg-\[var\(--segmented-inactive-bg\)\][\s\S]{0,200}text-\[var\(--segmented-inactive-text\)\]/);
assert.match(source, /newMode === m\.id \? "text-\[var\(--segmented-active-text\)\]"/);
console.log("PASS new offline-story mode selector uses paired active/inactive text and background tokens");
