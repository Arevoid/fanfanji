import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const statusBar = readFileSync(new URL("../src/components/StatusBar.tsx", import.meta.url), "utf8");

assert.match(index, /viewport-fit=cover/);
assert.equal((index.match(/name="viewport"/g) ?? []).length, 1, "only one viewport declaration is allowed");
assert.match(css, /html, body, #root\s*\{[\s\S]*min-height: 100dvh/);
assert.match(statusBar, /env\(safe-area-inset-top, 0px\)/);
assert.match(statusBar, /backgroundColor: hasUserWallpaper \? "transparent" : "var\(--status-bar-bg\)"/);
console.log("PASS safe-area shell uses the existing flow layout without a fixed status-bar overlay band");
