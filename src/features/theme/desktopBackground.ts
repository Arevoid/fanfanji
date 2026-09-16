import type { ResolvedTheme } from "./theme";

export type WallpaperSource = "user" | "preset" | "legacy-default";

export interface DesktopWallpaperSettings {
  wallpaper?: string | null;
  wallpaperSource?: WallpaperSource;
}

export const LEGACY_DEFAULT_DESKTOP_WALLPAPERS = new Set([
  "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
  "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
]);

export function hasUserDesktopWallpaper({ wallpaper, wallpaperSource }: DesktopWallpaperSettings): boolean {
  const value = typeof wallpaper === "string" ? wallpaper.trim() : "";
  if (!value) return false;
  if (wallpaperSource === "user" || wallpaperSource === "preset") return true;
  return !LEGACY_DEFAULT_DESKTOP_WALLPAPERS.has(value);
}

export function resolveDesktopBackground({
  resolvedTheme,
  wallpaper,
  wallpaperSource,
}: DesktopWallpaperSettings & { resolvedTheme: ResolvedTheme }): { hasUserWallpaper: boolean; background: string } {
  const hasUserWallpaper = hasUserDesktopWallpaper({ wallpaper, wallpaperSource });
  if (!hasUserWallpaper) {
    return { hasUserWallpaper: false, background: "var(--desktop-default-bg)" };
  }
  const value = wallpaper!.trim();
  return {
    hasUserWallpaper: true,
    // Pin to the top edge so a small viewport-height change (browser chrome /
    // PWA safe area on refresh) does not recenter and visibly shift the image.
    background: value.startsWith("linear-gradient") ? value : `url(${value}) center top / cover no-repeat`,
  };
}
