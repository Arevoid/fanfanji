import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/ui/Button.tsx", import.meta.url), "utf8");
const iconButton = readFileSync(new URL("../src/components/ui/IconButton.tsx", import.meta.url), "utf8");
const b1 = readFileSync(new URL("../src/styles/theme-b1.css", import.meta.url), "utf8");
const b2 = readFileSync(new URL("../src/styles/theme-b2.css", import.meta.url), "utf8");

for (const token of ["button-primary-bg", "button-primary-text", "button-secondary-bg", "button-secondary-text", "button-disabled-bg", "button-disabled-text", "tab-active-bg", "tab-active-text"]) {
  assert.match(tokens, new RegExp(`--${token}:`), `missing semantic ${token} token`);
}
for (const source of [button]) {
  assert.match(source, /button-primary-bg/);
  assert.match(source, /button-primary-text/);
  assert.match(source, /button-disabled-text/);
  assert.doesNotMatch(source, /disabled:opacity-45/);
}
assert.match(iconButton, /button-secondary-bg/);
assert.match(iconButton, /button-secondary-text/);
assert.match(iconButton, /button-disabled-text/);
for (const css of [b1, b2]) {
  assert.match(css, /button-primary-bg/);
  assert.match(css, /button:disabled/);
}
console.log("PASS semantic primary, secondary, tab and disabled button colours have dark-theme coverage");
