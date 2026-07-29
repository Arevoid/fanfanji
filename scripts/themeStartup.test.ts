import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR } from "../src/features/theme/theme";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /phone_appearance_settings/);
assert.match(html, /prefers-color-scheme: dark/);
assert.match(html, /document\.documentElement\.dataset\.theme/);
assert.match(html, /document\.documentElement\.style\.colorScheme/);
assert.match(html, new RegExp(LIGHT_THEME_COLOR));
assert.match(html, new RegExp(DARK_THEME_COLOR));
assert.match(html, /try \{/);
console.log("PASS pre-React theme bootstrap and runtime theme colors stay aligned");
