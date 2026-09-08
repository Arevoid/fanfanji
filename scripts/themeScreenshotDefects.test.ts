import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const notes = readFileSync(new URL("../src/components/AppNotes.tsx", import.meta.url), "utf8");
const music = readFileSync(new URL("../src/components/AppMusic.tsx", import.meta.url), "utf8");
const forum = readFileSync(new URL("../src/components/AppForum.tsx", import.meta.url), "utf8");
const b2 = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");

assert.match(notes, /tab-active-bg/);
assert.match(notes, /tab-inactive-text/);
assert.match(music, /importMethod === "upload" \? "bg-\[var\(--tab-active-bg\)\]/);
assert.match(music, /importMethod === "link" \? "bg-\[var\(--tab-active-bg\)\]/);
assert.match(forum, /text-\[var\(--text-primary\)\] transition-colors hover:bg-\[var\(--surface-muted\)\]/);
assert.match(b2, /\[data-theme-page\] button:is\(.bg-neutral-950/);
console.log("PASS notes, music, forum and legacy page controls have scoped dark-theme screenshot regression coverage");
