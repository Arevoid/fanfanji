import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const themeB1 = readFileSync(new URL("../src/styles/theme-b1.css", import.meta.url), "utf8");
const themeB2 = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

for (const source of [app, themeB1, themeB2]) {
  for (const inputType of ["range", "checkbox", "radio", "color", "file"]) {
    assert.match(source, new RegExp(`not\\(\\[type=\\"${inputType}\\"\\]\\)`));
  }
}

const rangeBlock = app.match(/input\[type="range"\] \{([\s\S]*?)\n        \}/)?.[1] || "";
for (const declaration of [
  "background: transparent",
  "border: 0",
  "border-radius: 0",
  "box-shadow: none",
  "padding: 0",
  "min-height: 0",
]) {
  assert.match(rangeBlock, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(app, /::-webkit-slider-runnable-track/);
assert.match(app, /::-webkit-slider-thumb/);
assert.match(app, /::-moz-range-track/);
assert.match(app, /::-moz-range-thumb/);
assert.doesNotMatch(index, /\.theme-memory-range\s*\{[^}]*background-color/);

console.log("PASS range inputs are excluded from text-field cards and retain dedicated tracks/thumbs");
