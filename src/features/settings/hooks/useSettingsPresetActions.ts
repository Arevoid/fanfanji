import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { StylePreset } from "../../../types";

interface UseSettingsPresetActionsOptions {
  newPresetName: string;
  setNewPresetName: Dispatch<SetStateAction<string>>;
  bubbleCss: string;
  globalCss: string;
  wallpaper: string;
  onSavePreset: (preset: StylePreset) => void;
}

/** Owns style preset creation while preserving the existing preset format. */
export function useSettingsPresetActions({
  newPresetName, setNewPresetName, bubbleCss, globalCss, wallpaper, onSavePreset,
}: UseSettingsPresetActionsOptions) {
  const handleSaveCurrentAsPreset = (event: FormEvent) => {
    event.preventDefault();
    if (!newPresetName.trim()) return;
    onSavePreset({
      id: `preset-${Date.now()}`,
      name: newPresetName.trim(),
      bubbleCss,
      globalCss,
      wallpaper,
      themeColor: "#3b82f6",
    });
    setNewPresetName("");
  };

  return { handleSaveCurrentAsPreset };
}
