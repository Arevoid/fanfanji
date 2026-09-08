import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveDesktopBackground } from "../src/features/theme/desktopBackground";

const source = "data:image/png;base64,preserved";
const sourceBefore = source;
const userWallpaper = resolveDesktopBackground({ resolvedTheme: "dark", wallpaper: source, wallpaperSource: "user" });
const presetWallpaper = resolveDesktopBackground({ resolvedTheme: "light", wallpaper: "linear-gradient(135deg, #123456, #654321)", wallpaperSource: "preset" });
const backup = readFileSync(new URL("../src/features/home/desktopModuleBackup.ts", import.meta.url), "utf8");

assert.equal(userWallpaper.hasUserWallpaper, true);
assert.equal(userWallpaper.background, `url(${source}) center/cover no-repeat`);
assert.equal(source, sourceBefore, "background resolution must not mutate the persisted wallpaper value");
assert.equal(presetWallpaper.hasUserWallpaper, true);
assert.equal(presetWallpaper.background, "linear-gradient(135deg, #123456, #654321)");
assert.match(backup, /"wallpaper", "wallpaperSource"/);
console.log("PASS uploaded and preset wallpapers remain intact and desktop backups retain their source attribution");
