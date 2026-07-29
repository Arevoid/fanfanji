import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync(new URL("../src/features/theme/ThemeProvider.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(provider, /subscribeToSystemTheme/);
assert.match(provider, /root\.dataset\.theme = theme/);
assert.match(provider, /THEME_COLOR_META_ID/);
assert.match(app, /gridColumnStart: itemPosition\.column \+ 1/);
assert.match(app, /settings\.dockColor/);
assert.match(app, /settings\.bubbleCss/);
console.log("PASS final theme audit preserves system mode, desktop layout and user colours");
