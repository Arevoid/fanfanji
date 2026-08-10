import type { UserSettings } from "../../../types";

export const LIQUID_GLASS_DEFAULT_TEXT_COLOR = "#1c1917";
export const LIQUID_GLASS_DEFAULT_BUBBLE_COLOR = "#ffffff";
export const LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY = 68;

const LEGACY_SELF_BUBBLE_COLOR = "#18181b";
const LEGACY_OTHER_BUBBLE_COLOR = "#f4f4f5";

function isLegacyUntouchedLiquidGlassState(settings: UserSettings): boolean {
  const selfBackground = (settings.selfBubbleBg || LEGACY_SELF_BUBBLE_COLOR).toLowerCase();
  const otherBackground = (settings.otherBubbleBg || LEGACY_OTHER_BUBBLE_COLOR).toLowerCase();
  const selfText = (settings.selfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR).toLowerCase();
  const otherText = (settings.otherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR).toLowerCase();
  return selfBackground === LEGACY_SELF_BUBBLE_COLOR
    && otherBackground === LEGACY_OTHER_BUBBLE_COLOR
    && selfText === LIQUID_GLASS_DEFAULT_TEXT_COLOR
    && otherText === LIQUID_GLASS_DEFAULT_TEXT_COLOR
    && (settings.selfBubbleOpacity === undefined || settings.selfBubbleOpacity === 100)
    && (settings.otherBubbleOpacity === undefined || settings.otherBubbleOpacity === 100);
}

/** Applies the independent liquid-glass palette exactly once. */
export function applyLiquidGlassTextDefaults(settings: UserSettings): UserSettings {
  if (settings.globalChatStylePreset !== "liquid-glass" || settings.liquidGlassVisualDefaultsApplied) return settings;

  const repairLegacyClassicPalette = settings.liquidGlassTextDefaultsApplied
    && isLegacyUntouchedLiquidGlassState(settings);

  return {
    ...settings,
    ...(repairLegacyClassicPalette ? {
      selfBubbleColor: "#ffffff",
      otherBubbleColor: "#18181b",
    } : {}),
    liquidGlassSelfBubbleBg: settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
    liquidGlassOtherBubbleBg: settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
    liquidGlassSelfBubbleColor: settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR,
    liquidGlassOtherBubbleColor: settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR,
    liquidGlassSelfBubbleOpacity: settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
    liquidGlassOtherBubbleOpacity: settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
    liquidGlassTextDefaultsApplied: true,
    liquidGlassVisualDefaultsApplied: true,
  };
}
