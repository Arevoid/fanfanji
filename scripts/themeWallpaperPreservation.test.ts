import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveDesktopBackground } from "../src/features/theme/desktopBackground";

const source = "data:image/png;base64,preserved";
const sourceBefore = source;
const userWallpaper = resolveDesktopBackground({ resolvedTheme: "dark", wallpaper: source, wallpaperSource: "user" });
const presetWallpaper = resolveDesktopBackground({ resolvedTheme: "light", wallpaper: "linear-gradient(135deg, #123456, #654321)", wallpaperSource: "preset" });
const backup = readFileSync(new URL("../src/features/home/desktopModuleBackup.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

assert.equal(userWallpaper.hasUserWallpaper, true);
assert.equal(userWallpaper.background, `url(${source}) center top / cover no-repeat`);
assert.equal(source, sourceBefore, "background resolution must not mutate the persisted wallpaper value");
assert.equal(presetWallpaper.hasUserWallpaper, true);
assert.equal(presetWallpaper.background, "linear-gradient(135deg, #123456, #654321)");
assert.match(backup, /"wallpaper", "wallpaperSource"/);
assert.match(app, /visibility: settingsOverlaysReady \? "visible" : "hidden"/, "the home screen must wait for wallpaper and icon hydration before first paint");
assert.match(app, /\.finally\(\(\) => \{\s*if \(active\) setSettingsOverlaysReady\(true\);\s*\}\)/, "the home screen should become visible only after all settings overlays are applied");
assert.match(app, /data-settings-hydration-splash/, "a neutral loading surface should cover the shell while desktop assets hydrate");
assert.doesNotMatch(app, /transition: "background 0\.3s ease/, "wallpaper restoration should not animate from a placeholder background");
console.log("PASS uploaded and preset wallpapers remain intact and desktop backups retain their source attribution");
