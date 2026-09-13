import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppRelationshipNetwork.tsx", import.meta.url), "utf8");

// The relationship dialog must follow the shared visual-viewport height when
// the mobile IME opens. Using raw 100dvh here can leave the dialog taller than
// its resized parent and make the focused field jump out of view.
assert.match(source, /style=\{\{ height: "calc\(var\(--app-viewport-height, 100dvh\) - 48px\)"/);
assert.match(source, /maxHeight: "calc\(var\(--app-viewport-height, 100dvh\) - 48px\)"/);
assert.doesNotMatch(source, /h-\[calc\(100dvh-48px\)\]/);
assert.doesNotMatch(source, /max-h-\[calc\(100dvh-48px\)\]/);
assert.match(source, /min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain/);

console.log("PASS relationship dialog tracks the keyboard-safe visual viewport");
