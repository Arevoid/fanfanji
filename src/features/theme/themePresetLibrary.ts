import type { ResolvedTheme } from "./theme";
import type { StylePreset, ThemeTokenMap } from "../../types";

export const THIN_STRAWBERRY_PRESET_ID = "p-thin-strawberry";
export const THIN_STRAWBERRY_PRESET_NAME = "薄巧莓莓";

/**
 * Semantic tokens intentionally mirror the variables in styles/tokens.css.
 * The light palette follows the supplied mint / strawberry / cream / cocoa
 * reference, while the dark palette keeps the same hue family readable.
 */
export const THIN_STRAWBERRY_LIGHT_TOKENS: ThemeTokenMap = {
  "--app-bg": "#f8f4e8",
  "--surface": "#fffdf7",
  "--surface-raised": "#fffaf1",
  "--surface-muted": "#eaf4ef",
  "--surface-selected": "#ffd3d4",
  "--text-primary": "#775c56",
  "--text-secondary": "#987c75",
  "--text-tertiary": "#b29a92",
  "--text-disabled": "#cbbdb7",
  "--text-inverse": "#fffdf7",
  "--border": "#d5ebe4",
  "--border-strong": "#b8d8d0",
  "--divider": "#e5ddd0",
  "--input-bg": "#fffdf7",
  "--input-placeholder": "#b29a92",
  "--overlay": "rgb(80 62 57 / 44%)",
  "--shadow-color": "rgb(119 92 86 / 14%)",
  "--accent": "#c98288",
  "--accent-hover": "#b96f76",
  "--accent-contrast": "#fffdf7",
  "--danger": "#b86d72",
  "--danger-bg": "#fff0ef",
  "--success": "#75a995",
  "--success-bg": "#edf8f1",
  "--warning": "#b98b63",
  "--warning-bg": "#fff6e8",
  "--focus-ring": "rgb(255 211 212 / 72%)",
  "--button-primary-bg": "#775c56",
  "--button-primary-text": "#fffdf7",
  "--button-primary-hover-bg": "#624945",
  "--button-secondary-bg": "#ffd3d4",
  "--button-secondary-text": "#775c56",
  "--button-secondary-border": "#efb8bb",
  "--button-ghost-text": "#775c56",
  "--button-ghost-hover-bg": "#eaf4ef",
  "--button-disabled-bg": "#eee8dc",
  "--button-disabled-text": "#b29a92",
  "--button-disabled-border": "#e5ddd0",
  "--tab-active-bg": "#775c56",
  "--tab-active-text": "#fffdf7",
  "--tab-inactive-bg": "transparent",
  "--tab-inactive-text": "#987c75",
  "--badge-bg": "#ffd3d4",
  "--badge-text": "#775c56",
  "--badge-muted-bg": "#eaf4ef",
  "--badge-muted-text": "#775c56",
  "--segmented-active-bg": "#775c56",
  "--segmented-active-text": "#fffdf7",
  "--segmented-inactive-bg": "#eaf4ef",
  "--segmented-inactive-text": "#987c75",
  "--segmented-border": "#b8d8d0",
  "--toggle-mono-on-bg": "#775c56",
  "--toggle-mono-on-thumb": "#fffdf7",
  "--toggle-mono-off-bg": "#d5ebe4",
  "--toggle-mono-off-thumb": "#775c56",
  "--toggle-mono-border": "#b8d8d0",
  "--media-placeholder-bg": "#eaf4ef",
  "--media-placeholder-text": "#987c75",
  "--progress-track": "#d5ebe4",
  "--progress-value": "#c98288",
  "--status-bar-bg": "#f8f4e8",
  "--desktop-default-bg": "#f8f4e8",
  "--desktop-default-text": "#775c56",
  "--scrollbar-thumb": "#b8d8d0",
  "--chat-user-bg": "#ffd3d4",
  "--chat-user-text": "#775c56",
  "--chat-ai-bg": "#fffaf1",
  "--chat-ai-text": "#775c56",
  "--color-background": "var(--app-bg)",
  "--color-surface": "var(--surface)",
  "--color-surface-secondary": "var(--surface-muted)",
  "--color-text-primary": "var(--text-primary)",
  "--color-text-secondary": "var(--text-secondary)",
  "--color-text-tertiary": "var(--text-tertiary)",
  "--color-border": "var(--border)",
  "--color-accent": "var(--accent)",
  "--color-danger": "var(--danger)",
  "--color-overlay": "var(--overlay)",
};

export const THIN_STRAWBERRY_DARK_TOKENS: ThemeTokenMap = {
  ...THIN_STRAWBERRY_LIGHT_TOKENS,
  "--app-bg": "#2d2524",
  "--surface": "#3a302f",
  "--surface-raised": "#463937",
  "--surface-muted": "#354542",
  "--surface-selected": "#714c50",
  "--text-primary": "#fff3e8",
  "--text-secondary": "#e9d4cb",
  "--text-tertiary": "#c7aca3",
  "--text-disabled": "#947b75",
  "--text-inverse": "#2d2524",
  "--border": "#5b716c",
  "--border-strong": "#78968e",
  "--divider": "#51403d",
  "--input-bg": "#463937",
  "--input-placeholder": "#c7aca3",
  "--overlay": "rgb(0 0 0 / 64%)",
  "--shadow-color": "rgb(0 0 0 / 34%)",
  "--accent": "#ffb7bb",
  "--accent-hover": "#ffcbd0",
  "--accent-contrast": "#2d2524",
  "--danger": "#ff9b9f",
  "--danger-bg": "#533436",
  "--success": "#9bd0ba",
  "--success-bg": "#29453d",
  "--warning": "#e7b581",
  "--warning-bg": "#54402d",
  "--focus-ring": "rgb(255 183 187 / 56%)",
  "--button-primary-bg": "#ffd3d4",
  "--button-primary-text": "#2d2524",
  "--button-primary-hover-bg": "#ffe2e3",
  "--button-secondary-bg": "#714c50",
  "--button-secondary-text": "#fff3e8",
  "--button-secondary-border": "#99666b",
  "--button-ghost-text": "#ffd3d4",
  "--button-ghost-hover-bg": "#463937",
  "--button-disabled-bg": "#4a3d3b",
  "--button-disabled-text": "#947b75",
  "--button-disabled-border": "#5b4d49",
  "--tab-active-bg": "#ffd3d4",
  "--tab-active-text": "#2d2524",
  "--tab-inactive-text": "#e9d4cb",
  "--badge-bg": "#714c50",
  "--badge-text": "#fff3e8",
  "--badge-muted-bg": "#354542",
  "--badge-muted-text": "#e9d4cb",
  "--segmented-active-bg": "#ffd3d4",
  "--segmented-active-text": "#2d2524",
  "--segmented-inactive-bg": "#354542",
  "--segmented-inactive-text": "#e9d4cb",
  "--segmented-border": "#78968e",
  "--toggle-mono-on-bg": "#ffd3d4",
  "--toggle-mono-on-thumb": "#2d2524",
  "--toggle-mono-off-bg": "#5b716c",
  "--toggle-mono-off-thumb": "#fff3e8",
  "--toggle-mono-border": "#78968e",
  "--media-placeholder-bg": "#354542",
  "--media-placeholder-text": "#e9d4cb",
  "--progress-track": "#5b716c",
  "--progress-value": "#ffb7bb",
  "--status-bar-bg": "#2d2524",
  "--desktop-default-bg": "#2d2524",
  "--desktop-default-text": "#fff3e8",
  "--scrollbar-thumb": "#78968e",
  "--chat-user-bg": "#714c50",
  "--chat-user-text": "#fff3e8",
  "--chat-ai-bg": "#463937",
  "--chat-ai-text": "#fff3e8",
};

export const THIN_STRAWBERRY_PRESET: StylePreset = {
  id: THIN_STRAWBERRY_PRESET_ID,
  name: THIN_STRAWBERRY_PRESET_NAME,
  bubbleCss: "",
  globalCss: ".phone-screen-container { font-family: 'Inter', sans-serif; }",
  wallpaper: "linear-gradient(160deg, #d5ebe4 0%, #f8f4e8 72%)",
  themeColor: "#775c56",
  previewColors: ["#ffd3d4", "#d5ebe4", "#f8f4e8", "#775c56"],
  themeTokens: {
    light: THIN_STRAWBERRY_LIGHT_TOKENS,
    dark: THIN_STRAWBERRY_DARK_TOKENS,
  },
};

export function resolveThemePreset(
  activePreset: string | undefined,
  customPresets: readonly StylePreset[] = [],
): StylePreset | undefined {
  if (!activePreset) return undefined;
  if (activePreset === THIN_STRAWBERRY_PRESET_ID || activePreset === THIN_STRAWBERRY_PRESET_NAME) {
    return THIN_STRAWBERRY_PRESET;
  }
  return customPresets.find((preset) => preset.id === activePreset || preset.name === activePreset);
}

export function applyThemePresetToRoot(
  preset: StylePreset | undefined,
  resolvedTheme: ResolvedTheme,
  root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement,
): void {
  if (!root) return;
  const previousKeys = (root.dataset.themePresetKeys || "").split(",").filter(Boolean);
  previousKeys.forEach((key) => root.style.removeProperty(key));
  const tokens = preset?.themeTokens?.[resolvedTheme] || preset?.themeTokens?.light;
  if (!tokens) {
    delete root.dataset.themePreset;
    delete root.dataset.themePresetKeys;
    return;
  }
  const appliedKeys: string[] = [];
  Object.entries(tokens).forEach(([key, value]) => {
    if (!key.startsWith("--") || !value.trim()) return;
    root.style.setProperty(key, value);
    appliedKeys.push(key);
  });
  root.dataset.themePreset = preset?.id || "";
  root.dataset.themePresetKeys = appliedKeys.join(",");
}
