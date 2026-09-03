import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR } from "../src/features/theme/theme";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../public/firstPaintTheme.js", import.meta.url), "utf8");
assert.match(bootstrap, /phone_appearance_settings/);
assert.match(bootstrap, /prefers-color-scheme: dark/);
assert.match(bootstrap, /document\.documentElement\.dataset\.theme/);
assert.match(bootstrap, /document\.documentElement\.style\.colorScheme/);
assert.match(bootstrap, new RegExp(LIGHT_THEME_COLOR));
assert.match(bootstrap, new RegExp(DARK_THEME_COLOR));
assert.match(bootstrap, /try \{/);
console.log("PASS pre-React theme bootstrap and runtime theme colors stay aligned");
