import type { UserSettings } from "../../../types";

export const LIQUID_GLASS_DEFAULT_TEXT_COLOR = "#1c1917";

/** Applies the readable liquid-glass text defaults exactly once. */
export function applyLiquidGlassTextDefaults(settings: UserSettings): UserSettings {
  if (settings.globalChatStylePreset !== "liquid-glass" || settings.liquidGlassTextDefaultsApplied) return settings;
  return {
    ...settings,
    selfBubbleColor: LIQUID_GLASS_DEFAULT_TEXT_COLOR,
    otherBubbleColor: LIQUID_GLASS_DEFAULT_TEXT_COLOR,
    liquidGlassTextDefaultsApplied: true,
  };
}
