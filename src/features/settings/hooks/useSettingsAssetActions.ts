import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { UserSettings } from "../../../types";
import { compressImage, compressImagePreservingTransparency } from "../../../utils/pngParser";

interface UseSettingsAssetActionsOptions {
  settings: UserSettings;
  handleSave: (updatedFields: Partial<UserSettings>) => boolean;
  setAvatar: Dispatch<SetStateAction<string>>;
  setWallpaper: Dispatch<SetStateAction<string>>;
}

/** Owns settings image compression/upload actions while preserving existing limits and save boundaries. */
export function useSettingsAssetActions({ settings, handleSave, setAvatar, setWallpaper }: UseSettingsAssetActionsOptions) {
  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 400, 400, 0.75);
      setAvatar(compressed);
      handleSave({ avatar: compressed });
    } catch (error) {
      console.error("Avatar compression failed:", error);
    }
  };

  const handleWallpaperUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 1000, 1000, 0.7);
      setWallpaper(compressed);
      handleSave({ wallpaper: compressed, wallpaperSource: "user" });
    } catch (error) {
      console.error("Wallpaper compression failed:", error);
    }
  };

  const handleIconUpload = async (appKey: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImagePreservingTransparency(file, 120, 120, 0.8);
      handleSave({ customIcons: { ...settings.customIcons, [appKey]: compressed } });
    } catch (error) {
      console.error("Icon compression failed:", error);
    }
  };

  const handleRestoreAllIcons = () => handleSave({ customIcons: {} });

  return { handleAvatarUpload, handleWallpaperUpload, handleIconUpload, handleRestoreAllIcons };
}
