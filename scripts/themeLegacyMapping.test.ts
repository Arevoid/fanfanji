import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const b1 = readFileSync(new URL("../src/styles/theme-b1.css", import.meta.url), "utf8");
const b2 = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
assert.match(b1, /chat-bubble-self/);
assert.match(b2, /\[data-theme-page\]/);
assert.doesNotMatch(b2, /\[class\*=/);
assert.doesNotMatch(b2, /filter:\s*(?:invert|grayscale)/i);
console.log("PASS B2 mapping stays page-scoped and avoids image filters");
