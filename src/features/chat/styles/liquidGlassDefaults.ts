import type { UserSettings } from "../../../types";

export const LIQUID_GLASS_DEFAULT_TEXT_COLOR = "#1c1917";
export const LIQUID_GLASS_DEFAULT_BUBBLE_COLOR = "#ffffff";
export const LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY = 68;
export const LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS = 16;
export const LIQUID_GLASS_PALETTE_MIGRATION_VERSION = 1;

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

function normalizeColor(value?: string): string {
  return (value || "").trim().toLowerCase();
}

/**
 * The first liquid-glass implementation could leave a self bubble with a
 * dark background and dark text. Repair only that unreadable combination;
 * intentional black-background/white-text customizations remain untouched.
 */
function needsUnreadablePaletteRepair(settings: UserSettings): boolean {
  if ((settings.liquidGlassPaletteMigrationVersion || 0) >= LIQUID_GLASS_PALETTE_MIGRATION_VERSION) return false;
  const background = normalizeColor(settings.liquidGlassSelfBubbleBg);
  const text = normalizeColor(settings.liquidGlassSelfBubbleColor);
  const darkBackground = ["#000", "#000000", "#18181b"].includes(background);
  const darkText = ["#000", "#000000", "#18181b", LIQUID_GLASS_DEFAULT_TEXT_COLOR].includes(text);
  return darkBackground && darkText;
}

/** Applies the independent liquid-glass palette exactly once. */
export function applyLiquidGlassTextDefaults(settings: UserSettings): UserSettings {
  const shouldInitializeDefaults = settings.globalChatStylePreset === "liquid-glass" && !settings.liquidGlassVisualDefaultsApplied;
  const shouldRepairUnreadablePalette = needsUnreadablePaletteRepair(settings);
  if (!shouldInitializeDefaults && !shouldRepairUnreadablePalette) return settings;

  const repairLegacyClassicPalette = settings.liquidGlassTextDefaultsApplied
    && isLegacyUntouchedLiquidGlassState(settings);

  return {
    ...settings,
    ...(repairLegacyClassicPalette ? {
      selfBubbleColor: "#ffffff",
      otherBubbleColor: "#18181b",
    } : {}),
    ...(shouldInitializeDefaults ? {
      liquidGlassSelfBubbleBg: settings.liquidGlassSelfBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
      liquidGlassOtherBubbleBg: settings.liquidGlassOtherBubbleBg || LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
      liquidGlassSelfBubbleColor: settings.liquidGlassSelfBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR,
      liquidGlassOtherBubbleColor: settings.liquidGlassOtherBubbleColor || LIQUID_GLASS_DEFAULT_TEXT_COLOR,
      liquidGlassSelfBubbleOpacity: settings.liquidGlassSelfBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
      liquidGlassOtherBubbleOpacity: settings.liquidGlassOtherBubbleOpacity ?? LIQUID_GLASS_DEFAULT_BUBBLE_OPACITY,
      liquidGlassSelfBubbleRadius: settings.liquidGlassSelfBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS,
      liquidGlassOtherBubbleRadius: settings.liquidGlassOtherBubbleRadius ?? LIQUID_GLASS_DEFAULT_BUBBLE_RADIUS,
      liquidGlassBubbleTailEnabled: settings.liquidGlassBubbleTailEnabled ?? false,
      liquidGlassBubbleTailVertical: settings.liquidGlassBubbleTailVertical || "top",
      liquidGlassBubblePosition: settings.liquidGlassBubblePosition || "side",
      liquidGlassBubbleBorderEnabled: settings.liquidGlassBubbleBorderEnabled ?? false,
      liquidGlassBubbleBorderWidth: settings.liquidGlassBubbleBorderWidth ?? 1,
      liquidGlassSelfBubbleBorderColor: settings.liquidGlassSelfBubbleBorderColor || "#ffffff",
      liquidGlassOtherBubbleBorderColor: settings.liquidGlassOtherBubbleBorderColor || "#ffffff",
      liquidGlassTextDefaultsApplied: true,
      liquidGlassVisualDefaultsApplied: true,
    } : {}),
    ...(shouldRepairUnreadablePalette ? {
      liquidGlassSelfBubbleBg: LIQUID_GLASS_DEFAULT_BUBBLE_COLOR,
      liquidGlassSelfBubbleColor: LIQUID_GLASS_DEFAULT_TEXT_COLOR,
    } : {}),
    ...(shouldInitializeDefaults || shouldRepairUnreadablePalette
      ? { liquidGlassPaletteMigrationVersion: LIQUID_GLASS_PALETTE_MIGRATION_VERSION }
      : {}),
  };
}
