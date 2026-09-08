import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const settingsSource = readFileSync(resolve(root, "src/components/AppSettings.tsx"), "utf8");
const tokensSource = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8");

assert.match(settingsSource, /onClick=\{\(\) => handleSwitchIdentity\(idty\.id\)\}/);
assert.match(settingsSource, /bg-\[var\(--segmented-active-bg\)\] text-\[var\(--segmented-active-text\)\]/);
assert.match(settingsSource, /bg-\[var\(--segmented-inactive-bg\)\] text-\[var\(--segmented-inactive-text\)\]/);
assert.match(settingsSource, /border-\[var\(--segmented-border\)\]/);
assert.match(tokensSource, /--segmented-active-bg: #18181b;/);
assert.match(tokensSource, /--segmented-active-text: #ffffff;/);
assert.match(tokensSource, /--segmented-active-bg: #f3f3f5;/);
assert.match(tokensSource, /--segmented-active-text: #151517;/);

console.log("themeSettingsIdentityTabs.test.ts passed");
