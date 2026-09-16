import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { UserSettings } from "../../../types";
import { compressImage, compressImagePreservingTransparency } from "../../../utils/pngParser";
import {
  loadSettingsAssetOverlay,
  restoreSettingsAssetOverlay,
  saveSettingsAssetOverlay,
  SETTINGS_CUSTOM_ICONS_ASSET_ID,
  SETTINGS_WALLPAPER_ASSET_ID,
} from "../../../core/storage/settingsAssetRepository";

interface UseSettingsAssetActionsOptions {
  settings: UserSettings;
  handleSave: (updatedFields: Partial<UserSettings>) => boolean;
  setAvatar: Dispatch<SetStateAction<string>>;
  setWallpaper: Dispatch<SetStateAction<string>>;
  onIconStatusChange?: (message: string) => void;
}

/** Owns settings image compression/upload actions while preserving existing limits and save boundaries. */
export function useSettingsAssetActions({
  settings,
  handleSave,
  setAvatar,
  setWallpaper,
  onIconStatusChange,
}: UseSettingsAssetActionsOptions) {
  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      // Profile avatars are rendered at small sizes. Keeping the persisted
      // data URL bounded prevents a large upload from exhausting the legacy
      // monolithic settings record (which now has an IndexedDB fallback).
      const compressed = await compressImage(file, 256, 256, 0.72);
      const saved = handleSave({ avatar: compressed });
      if (saved) setAvatar(compressed);
    } catch (error) {
      console.error("Avatar compression failed:", error);
    }
  };

  const handleWallpaperUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1000, 1000, 0.7);
      let savedInIndexedDb = false;
      let previousAssets = null;
      try {
        previousAssets = await loadSettingsAssetOverlay();
        await saveSettingsAssetOverlay({ ...(previousAssets || { version: 1 }), wallpaper: compressed });
        savedInIndexedDb = true;
      } catch (error) {
        // Older browsers may not expose IndexedDB. Keep the localStorage path
        // as a compatibility fallback when it still has enough space.
        console.warn("[settings] Wallpaper IndexedDB fallback unavailable; using local settings storage.", error);
      }
      const saved = handleSave({
        wallpaper: compressed,
        wallpaperSource: "user",
        wallpaperAssetId: savedInIndexedDb ? SETTINGS_WALLPAPER_ASSET_ID : null,
      });
      if (saved) setWallpaper(compressed);
      else if (savedInIndexedDb) {
        try { await restoreSettingsAssetOverlay(previousAssets); }
        catch (error) { console.error("[settings] Could not roll back an unsaved wallpaper asset.", error); }
      }
    } catch (error) {
      console.error("Wallpaper compression failed:", error);
    }
  };

  const handleIconUpload = async (appKey: string, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Allow selecting the same file again. Without resetting the input,
    // browsers do not emit `change` when the chosen path is unchanged.
    input.value = "";
    onIconStatusChange?.("");
    if (!file) return;
    try {
      const compressed = await compressImagePreservingTransparency(file, 120, 120, 0.8);
      let savedInIndexedDb = false;
      let previousAssets = null;
      let customIcons = { ...settings.customIcons, [appKey]: compressed };
      try {
        previousAssets = await loadSettingsAssetOverlay();
        // The settings panel can be used before the asynchronous startup
        // hydration finishes. Merge the durable map so an early upload cannot
        // discard icons that were already stored in IndexedDB.
        customIcons = { ...(previousAssets?.customIcons || {}), ...customIcons };
        await saveSettingsAssetOverlay({ ...(previousAssets || { version: 1 }), customIcons });
        savedInIndexedDb = true;
      } catch (error) {
        console.warn("[settings] Custom icon IndexedDB fallback unavailable; using local settings storage.", error);
      }
      const saved = handleSave({
        customIcons,
        customIconsAssetId: savedInIndexedDb ? SETTINGS_CUSTOM_ICONS_ASSET_ID : null,
      });
      if (!saved && savedInIndexedDb) {
        try { await restoreSettingsAssetOverlay(previousAssets); }
        catch (error) { console.error("[settings] Could not roll back an unsaved custom icon.", error); }
      }
      onIconStatusChange?.(saved
        ? "应用图标已更新"
        : "应用图标保存失败，请检查浏览器存储空间后重试");
    } catch (error) {
      console.error("Icon compression failed:", error);
      onIconStatusChange?.("图片读取或压缩失败，请使用 PNG、JPG 或 WebP 图片");
    }
  };

  const handleRestoreAllIcons = async () => {
    let savedInIndexedDb = false;
    let previousAssets = null;
    try {
      previousAssets = await loadSettingsAssetOverlay();
      await saveSettingsAssetOverlay({ ...(previousAssets || { version: 1 }), customIcons: {} });
      savedInIndexedDb = true;
    } catch (error) {
      console.warn("[settings] Custom icon IndexedDB reset unavailable; using local settings storage.", error);
    }
    const saved = handleSave({
      customIcons: {},
      customIconsAssetId: savedInIndexedDb ? SETTINGS_CUSTOM_ICONS_ASSET_ID : null,
    });
    if (!saved && savedInIndexedDb) {
      try { await restoreSettingsAssetOverlay(previousAssets); }
      catch (error) { console.error("[settings] Could not roll back a failed custom icon reset.", error); }
    }
    return saved;
  };

  return { handleAvatarUpload, handleWallpaperUpload, handleIconUpload, handleRestoreAllIcons };
}
