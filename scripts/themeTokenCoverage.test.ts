import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
for (const token of ["--app-bg", "--surface", "--surface-raised", "--surface-muted", "--text-primary", "--text-secondary", "--border", "--input-bg", "--overlay", "--accent", "--danger", "--focus-ring", "--chat-user-bg", "--chat-ai-bg"]) {
  assert.match(tokens, new RegExp(token.replace("--", "\\-\\-")));
}
assert.match(tokens, /:root\[data-theme="dark"\]/);
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
assert.match(css, /@custom-variant dark/);
for (const component of ["Button.tsx", "Card.tsx", "Input.tsx", "Textarea.tsx", "Modal.tsx", "BottomSheet.tsx", "PopoverMenu.tsx", "IconButton.tsx"]) {
  const source = readFileSync(new URL(`../src/components/ui/${component}`, import.meta.url), "utf8");
  assert.match(source, /var\(--color-|var\(--focus-ring\)/);
}
console.log("PASS semantic token and shared-component coverage");
