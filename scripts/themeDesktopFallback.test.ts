import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasUserDesktopWallpaper, resolveDesktopBackground } from "../src/features/theme/desktopBackground";

for (const resolvedTheme of ["light", "dark"] as const) {
  const result = resolveDesktopBackground({ resolvedTheme, wallpaper: "", wallpaperSource: undefined });
  assert.equal(result.hasUserWallpaper, false);
  assert.equal(result.background, "var(--desktop-default-bg)");
}

assert.equal(hasUserDesktopWallpaper({ wallpaper: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)" }), false);
assert.equal(hasUserDesktopWallpaper({ wallpaper: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)" }), false);
assert.equal(hasUserDesktopWallpaper({ wallpaper: "blob:user-wallpaper", wallpaperSource: "user" }), true);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(app, /backgroundColor: "var\(--desktop-default-bg\)"/);
console.log("PASS desktop falls back by resolved theme only when no real user wallpaper is present");
