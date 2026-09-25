import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const statusBar = readFileSync(new URL("../src/components/StatusBar.tsx", import.meta.url), "utf8");

assert.match(index, /viewport-fit=cover/);
assert.equal((index.match(/name="viewport"/g) ?? []).length, 1, "only one viewport declaration is allowed");
assert.match(css, /html, body, #root\s*\{[\s\S]*height: var\(--app-viewport-height, 100dvh\)[\s\S]*min-height: 0/);
assert.match(statusBar, /env\(safe-area-inset-top, 0px\)/);
assert.match(statusBar, /mode === "desktop" \? "transparent" : "var\(--nav-bg\)"/);
assert.match(statusBar, /mode === "desktop"[\s\S]*var\(--desktop-default-text\)/);
assert.match(statusBar, /: "var\(--nav-text\)"/);
console.log("PASS safe-area shell keeps app navigation colors while desktop status bar overlays the wallpaper");
