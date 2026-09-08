import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getThemeColor, resolveTheme, sanitizeAppearanceSettings } from "../src/features/theme/theme";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../public/firstPaintTheme.js", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8");
assert.match(bootstrap, /phone_appearance_settings/);
assert.match(bootstrap, /document\.documentElement\.dataset\.theme/);
assert.match(bootstrap, /document\.documentElement\.style\.colorScheme/);
assert.match(bootstrap, /getElementById\("app-theme-color"\)/);
assert.deepEqual(sanitizeAppearanceSettings("broken"), { themeMode: "light" });
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");
assert.equal(getThemeColor("dark"), "#171719");
assert.equal(getThemeColor("light"), "#f7f7f5");
assert.match(manifest, /"background_color": "#f7f7f5"/);
assert.match(manifest, /"theme_color": "#f7f7f5"/);
console.log("PASS PWA first-paint, theme-color and corrupted-setting fallback audit");
