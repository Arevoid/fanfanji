import type { UserSettings } from "../../../types";

export const CLASSIC_BUBBLE_PRESET_ID = "p-classic";
export const CLASSIC_BUBBLE_PRESET_NAME = "温和灰蓝 (Default)";

export const LEGACY_CLASSIC_BUBBLE_CSS = `.chat-bubble-self {
  background: #3b82f6 !important;
  color: #ffffff !important;
  border-radius: 18px 18px 2px 18px !important;
}
.chat-bubble-other {
  background: #e2e8f0 !important;
  color: #1e293b !important;
  border-radius: 18px 18px 18px 2px !important;
}`;

export const CLASSIC_BUBBLE_STRUCTURED_STYLE = {
  selfBubbleBg: "#3b82f6",
  selfBubbleColor: "#ffffff",
  selfBubbleRadius: 18,
  selfBubbleOpacity: 100,
  otherBubbleBg: "#e2e8f0",
  otherBubbleColor: "#1e293b",
  otherBubbleRadius: 18,
  otherBubbleOpacity: 100,
  bubbleTailEnabled: false,
} as const;

const normalizeCss = (value: string): string => value.replace(/\s+/g, " ").trim();

export function isLegacyClassicBubblePreset(settings: Pick<UserSettings, "activePreset" | "bubbleCss">): boolean {
  return settings.activePreset === CLASSIC_BUBBLE_PRESET_NAME
    && normalizeCss(settings.bubbleCss || "") === normalizeCss(LEGACY_CLASSIC_BUBBLE_CSS);
}

/**
 * Releases only the app-owned legacy preset CSS. Explicit palette values are
 * preserved, while missing values inherit the same preset through structured
 * fields so existing users do not lose their chosen appearance.
 */
export function migrateLegacyClassicBubblePreset(settings: UserSettings): {
  settings: UserSettings;
  migrated: boolean;
} {
  if (!isLegacyClassicBubblePreset(settings)) return { settings, migrated: false };

  return {
    migrated: true,
    settings: {
      ...CLASSIC_BUBBLE_STRUCTURED_STYLE,
      ...settings,
      bubbleCss: "",
      activePreset: "手动调色",
    },
  };
}
