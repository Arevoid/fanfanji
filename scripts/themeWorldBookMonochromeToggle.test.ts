import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "src/components/AppWorldBook.tsx"), "utf8");
const tokensSource = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8");
const activeToggleSection = source.slice(source.indexOf("/* 6. Active Toggle Switch"), source.indexOf("</form>", source.indexOf("/* 6. Active Toggle Switch")));
const listToggleSection = source.slice(source.indexOf("onSaveEntry({ ...entry, isActive: !isActive })"), source.indexOf("</button>", source.indexOf("onSaveEntry({ ...entry, isActive: !isActive })")));

for (const section of [activeToggleSection, listToggleSection]) {
  assert.match(section, /role="switch"/);
  assert.match(section, /aria-checked=\{isActive\}/);
  assert.match(section, /--toggle-mono-on-bg/);
  assert.match(section, /--toggle-mono-on-thumb/);
  assert.match(section, /--toggle-mono-off-bg/);
  assert.match(section, /--toggle-mono-off-thumb/);
  assert.doesNotMatch(section, /emerald|teal|green|--success/);
}

assert.match(tokensSource, /--toggle-mono-on-bg: #18181b;/);
assert.match(tokensSource, /--toggle-mono-on-bg: #f3f3f5;/);
assert.match(source, /onClick=\{\(\) => setIsActive\(!isActive\)\}/);
assert.match(source, /onSaveEntry\(\{ \.\.\.entry, isActive: !isActive \}\)/);

console.log("themeWorldBookMonochromeToggle.test.ts passed");
