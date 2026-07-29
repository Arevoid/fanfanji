import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DARK_THEME_COLOR, LIGHT_THEME_COLOR, THEME_COLOR_META_ID, getThemeColor } from "../src/features/theme/theme";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/features/theme/ThemeProvider.tsx", import.meta.url), "utf8");

assert.equal(getThemeColor("light"), LIGHT_THEME_COLOR);
assert.equal(getThemeColor("dark"), DARK_THEME_COLOR);
assert.match(index, new RegExp(`<meta id="${THEME_COLOR_META_ID}" name="theme-color"`));
assert.equal((index.match(/name="theme-color"/g) ?? []).length, 1, "theme-color meta must remain unique");
assert.match(index, /document\.documentElement\.style\.backgroundColor = color/);
assert.match(index, /document\.body\.style\.backgroundColor = color/);
assert.match(index, /root\.style\.backgroundColor = color/);
assert.match(provider, /document\.getElementById\(THEME_COLOR_META_ID\)/);
assert.match(provider, /apple-mobile-web-app-status-bar-style/);
console.log("PASS runtime theme updates keep a unique status-bar color meta and synchronized root colors");
