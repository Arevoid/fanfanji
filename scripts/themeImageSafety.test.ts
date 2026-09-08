import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = ["../src/styles/theme-b1.css", "../src/styles/theme-b2.css", "../src/styles/tokens.css", "../src/index.css"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
assert.doesNotMatch(styles, /filter:\s*(?:invert|grayscale|brightness)/i);
assert.doesNotMatch(styles, /mix-blend-mode/i);
assert.doesNotMatch(styles, /img\s*\{/i);
console.log("PASS theme styles do not filter, invert or globally target images");
