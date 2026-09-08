import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(source, /beautySubTab === "preset"/);
assert.match(source, /显示主题/);
assert.match(source, /\["light", "dark", "system"\] as ThemeMode\[\]/);
assert.match(source, /onClick=\{\(\) => setThemeMode\(mode\)\}/);
assert.match(source, /当前\{resolvedTheme === "dark" \? "深色" : "浅色"\}/);
assert.doesNotMatch(source, /onClick=\{\(\) => setActiveTab\("appearance"\)\}/);
console.log("PASS theme mode is available from beauty presets without a standalone settings entry");
