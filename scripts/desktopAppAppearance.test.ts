import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

assert.match(types, /desktopAppTextColor\?: string/);
assert.match(types, /desktopIconMode\?: "light" \| "dark"/);
assert.match(settings, /桌面应用文字颜色/);
assert.match(settings, /图标模式/);
assert.match(settings, /desktopIconMode \|\| "light"/);
assert.match(app, /settings\.desktopIconMode === "dark" \? "#1d1d1f" : "#f3f3f5"/);
assert.match(app, /--app-default-icon-surface: \$\{hexToRgba\(settings\.desktopIconMode === "dark" \? "#ffffff" : "#17181b", settings\.iconBgOpacity/);
assert.match(app, /--desktop-app-text-color: \$\{settings\.desktopAppTextColor \|\| "#ffffff"\}/);
assert.match(app, /desktop-app-label/);
assert.match(app, /font-extrabold:not\(\.desktop-app-label\)/);
assert.match(app, /:not\(\.app-icon-surface\)/);

console.log("desktopAppAppearance.test passed");
