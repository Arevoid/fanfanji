import type { UserSettings } from "../../types";
import { readingAssetDb } from "./readingAssetDb";

/** Stable references kept in the small localStorage settings record. */
export const SETTINGS_WALLPAPER_ASSET_ID = "settings-wallpaper-v1";
export const SETTINGS_CUSTOM_ICONS_ASSET_ID = "settings-custom-icons-v1";
export const SETTINGS_ASSET_OVERLAY_KEY = "user-settings-assets-v1";

export interface SettingsAssetOverlay {
  version: 1;
  wallpaper?: string;
  customIcons?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAssetOverlay(value: unknown): value is SettingsAssetOverlay {
  if (!isRecord(value) || value.version !== 1) return false;
  if (value.wallpaper !== undefined && typeof value.wallpaper !== "string") return false;
  if (value.customIcons !== undefined && (!isRecord(value.customIcons)
    || Object.values(value.customIcons).some((item) => typeof item !== "string"))) return false;
  return true;
}

export async function loadSettingsAssetOverlay(): Promise<SettingsAssetOverlay | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const value = await readingAssetDb.loadMetadataValue<unknown>(SETTINGS_ASSET_OVERLAY_KEY);
    return isAssetOverlay(value) ? value : null;
  } catch (error) {
    console.warn("[settings] Failed to load wallpaper/icon assets from IndexedDB.", error);
    return null;
  }
}

export async function saveSettingsAssetOverlay(value: SettingsAssetOverlay): Promise<void> {
  if (!isAssetOverlay(value)) throw new Error("Invalid settings asset overlay");
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
  await readingAssetDb.saveMetadataValue(SETTINGS_ASSET_OVERLAY_KEY, value);
}

export function applySettingsAssetOverlay(settings: UserSettings, overlay: SettingsAssetOverlay | null): UserSettings {
  if (!overlay || overlay.version !== 1) return settings;
  let hydrated = settings;
  if (settings.wallpaperAssetId === SETTINGS_WALLPAPER_ASSET_ID && overlay.wallpaper) {
    hydrated = { ...hydrated, wallpaper: overlay.wallpaper };
  }
  if (settings.customIconsAssetId === SETTINGS_CUSTOM_ICONS_ASSET_ID && overlay.customIcons) {
    hydrated = { ...hydrated, customIcons: overlay.customIcons };
  }
  return hydrated;
}
