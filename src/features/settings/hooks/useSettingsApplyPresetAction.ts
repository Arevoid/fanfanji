import type { useSettingsAppearanceDraftState } from "./useSettingsAppearanceDraftState";
import type { useSettingsStyleDraftState } from "./useSettingsStyleDraftState";
import type { StylePreset, UserSettings } from "../../../types";
import { CLASSIC_BUBBLE_PRESET_ID, CLASSIC_BUBBLE_STRUCTURED_STYLE } from "../../chat/styles/classicBubblePreset";

type AppearanceState = ReturnType<typeof useSettingsAppearanceDraftState>;
type StyleState = ReturnType<typeof useSettingsStyleDraftState>;

interface UseSettingsApplyPresetActionOptions {
  onSaveSettings: (updater: (previous: UserSettings) => UserSettings) => boolean;
  appearanceState: AppearanceState;
  styleState: StyleState;
}

/** Applies a style preset while preserving the legacy classic-preset overrides and storage fields. */
export function useSettingsApplyPresetAction({ onSaveSettings, appearanceState, styleState }: UseSettingsApplyPresetActionOptions) {
  const { setWallpaper, setBubbleCss, setGlobalCss } = styleState;
  const {
    setSelfBubbleBg, setSelfBubbleColor, setSelfBubbleRadius, setSelfBubbleOpacity,
    setOtherBubbleBg, setOtherBubbleColor, setOtherBubbleRadius, setOtherBubbleOpacity,
    setBubbleTailEnabled,
  } = appearanceState;

  const applyPreset = (preset: StylePreset) => {
    const isClassicPreset = preset.id === CLASSIC_BUBBLE_PRESET_ID;
    setWallpaper(preset.wallpaper);
    setBubbleCss(isClassicPreset ? "" : preset.bubbleCss);
    setGlobalCss(preset.globalCss);
    if (isClassicPreset) {
      setSelfBubbleBg(CLASSIC_BUBBLE_STRUCTURED_STYLE.selfBubbleBg);
      setSelfBubbleColor(CLASSIC_BUBBLE_STRUCTURED_STYLE.selfBubbleColor);
      setSelfBubbleRadius(CLASSIC_BUBBLE_STRUCTURED_STYLE.selfBubbleRadius);
      setSelfBubbleOpacity(CLASSIC_BUBBLE_STRUCTURED_STYLE.selfBubbleOpacity);
      setOtherBubbleBg(CLASSIC_BUBBLE_STRUCTURED_STYLE.otherBubbleBg);
      setOtherBubbleColor(CLASSIC_BUBBLE_STRUCTURED_STYLE.otherBubbleColor);
      setOtherBubbleRadius(CLASSIC_BUBBLE_STRUCTURED_STYLE.otherBubbleRadius);
      setOtherBubbleOpacity(CLASSIC_BUBBLE_STRUCTURED_STYLE.otherBubbleOpacity);
      setBubbleTailEnabled(false);
    }
    onSaveSettings((previous) => ({
      ...previous,
      wallpaper: preset.wallpaper,
      wallpaperSource: "preset",
      bubbleCss: isClassicPreset ? "" : preset.bubbleCss,
      globalCss: preset.globalCss,
      activePreset: preset.name,
      ...(isClassicPreset ? CLASSIC_BUBBLE_STRUCTURED_STYLE : {}),
    }));
  };

  return { applyPreset };
}
