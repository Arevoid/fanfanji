import type { ResolvedTheme } from "./theme";
import type { StylePreset, ThemeTokenMap } from "../../types";

/**
 * The built-in preset is deliberately named after the visual language rather
 * than the reference image: a warm pink-grey grid, creamy surfaces and soft
 * berry accents. The reference is used as direction, not copied as an asset.
 */
export const BERRY_GRID_PRESET_ID = "p-berry-grid";
export const BERRY_GRID_PRESET_NAME = "莓粉方格";

export const BERRY_GRID_LIGHT_TOKENS: ThemeTokenMap = {
  "--app-bg": "#eee5e4",
  "--surface": "#fffdfc",
  "--surface-raised": "#fff8f7",
  "--surface-muted": "#f5eeee",
  "--surface-selected": "#f3dce0",
  "--text-primary": "#514b4e",
  "--text-secondary": "#756b70",
  "--text-tertiary": "#a3989c",
  "--text-disabled": "#c9bec1",
  "--text-inverse": "#fffdfc",
  "--border": "#e4d9db",
  "--border-strong": "#d4c3c7",
  "--divider": "#ebe2e3",
  "--input-bg": "#fffdfc",
  "--input-placeholder": "#a3989c",
  "--overlay": "rgb(69 57 62 / 44%)",
  "--shadow-color": "rgb(112 83 91 / 15%)",
  "--accent": "#d295a0",
  "--accent-hover": "#c17f8c",
  "--accent-contrast": "#fffdfc",
  "--danger": "#c97482",
  "--danger-bg": "#fff0f2",
  "--success": "#78a391",
  "--success-bg": "#edf7f1",
  "--warning": "#bd946e",
  "--warning-bg": "#fff7ec",
  "--focus-ring": "rgb(210 149 160 / 58%)",
  "--button-primary-bg": "#756b70",
  "--button-primary-text": "#fffdfc",
  "--button-primary-hover-bg": "#5f565b",
  "--button-secondary-bg": "#f3dce0",
  "--button-secondary-text": "#514b4e",
  "--button-secondary-border": "#e1bbc3",
  "--button-ghost-text": "#756b70",
  "--button-ghost-hover-bg": "#f5eeee",
  "--button-disabled-bg": "#eee7e7",
  "--button-disabled-text": "#a3989c",
  "--button-disabled-border": "#e4d9db",
  "--tab-active-bg": "#756b70",
  "--tab-active-text": "#fffdfc",
  "--tab-inactive-bg": "transparent",
  "--tab-inactive-text": "#756b70",
  "--badge-bg": "#f3dce0",
  "--badge-text": "#514b4e",
  "--badge-muted-bg": "#f5eeee",
  "--badge-muted-text": "#756b70",
  "--segmented-active-bg": "#756b70",
  "--segmented-active-text": "#fffdfc",
  "--segmented-inactive-bg": "#f5eeee",
  "--segmented-inactive-text": "#756b70",
  "--segmented-border": "#d4c3c7",
  "--toggle-mono-on-bg": "#756b70",
  "--toggle-mono-on-thumb": "#fffdfc",
  "--toggle-mono-off-bg": "#e4d9db",
  "--toggle-mono-off-thumb": "#756b70",
  "--toggle-mono-border": "#d4c3c7",
  "--media-placeholder-bg": "#f5eeee",
  "--media-placeholder-text": "#756b70",
  "--progress-track": "#e4d9db",
  "--progress-value": "#d295a0",
  "--status-bar-bg": "#fffdfc",
  "--nav-bg": "#eee5e4",
  "--nav-text": "#514b4e",
  "--desktop-default-bg": "#eee5e4",
  "--desktop-default-text": "#514b4e",
  "--scrollbar-thumb": "#d4c3c7",
  "--chat-user-bg": "#e8b5be",
  "--chat-user-text": "#514b4e",
  "--chat-ai-bg": "#fffdfc",
  "--chat-ai-text": "#514b4e",
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

export const BERRY_GRID_DARK_TOKENS: ThemeTokenMap = {
  ...BERRY_GRID_LIGHT_TOKENS,
  "--app-bg": "#2d282a",
  "--surface": "#3b3336",
  "--surface-raised": "#473c40",
  "--surface-muted": "#40363a",
  "--surface-selected": "#654750",
  "--text-primary": "#fff3f1",
  "--text-secondary": "#e5ced1",
  "--text-tertiary": "#bda8ad",
  "--text-disabled": "#8c777d",
  "--text-inverse": "#2d282a",
  "--border": "#5c4c52",
  "--border-strong": "#79636b",
  "--divider": "#514248",
  "--input-bg": "#473c40",
  "--input-placeholder": "#bda8ad",
  "--overlay": "rgb(0 0 0 / 64%)",
  "--shadow-color": "rgb(0 0 0 / 35%)",
  "--accent": "#f0aeb8",
  "--accent-hover": "#f6c4cb",
  "--accent-contrast": "#2d282a",
  "--danger": "#ff9eaa",
  "--danger-bg": "#56343d",
  "--success": "#a2d0bb",
  "--success-bg": "#29473b",
  "--warning": "#e2b483",
  "--warning-bg": "#54402e",
  "--focus-ring": "rgb(240 174 184 / 54%)",
  "--button-primary-bg": "#f0aeb8",
  "--button-primary-text": "#2d282a",
  "--button-primary-hover-bg": "#f6c4cb",
  "--button-secondary-bg": "#654750",
  "--button-secondary-text": "#fff3f1",
  "--button-secondary-border": "#8a606c",
  "--button-ghost-text": "#f0aeb8",
  "--button-ghost-hover-bg": "#473c40",
  "--button-disabled-bg": "#4a3f43",
  "--button-disabled-text": "#8c777d",
  "--button-disabled-border": "#5c4c52",
  "--tab-active-bg": "#f0aeb8",
  "--tab-active-text": "#2d282a",
  "--tab-inactive-text": "#e5ced1",
  "--badge-bg": "#654750",
  "--badge-text": "#fff3f1",
  "--badge-muted-bg": "#40363a",
  "--badge-muted-text": "#e5ced1",
  "--segmented-active-bg": "#f0aeb8",
  "--segmented-active-text": "#2d282a",
  "--segmented-inactive-bg": "#40363a",
  "--segmented-inactive-text": "#e5ced1",
  "--segmented-border": "#79636b",
  "--toggle-mono-on-bg": "#f0aeb8",
  "--toggle-mono-on-thumb": "#2d282a",
  "--toggle-mono-off-bg": "#5c4c52",
  "--toggle-mono-off-thumb": "#fff3f1",
  "--toggle-mono-border": "#79636b",
  "--media-placeholder-bg": "#40363a",
  "--media-placeholder-text": "#e5ced1",
  "--progress-track": "#5c4c52",
  "--progress-value": "#f0aeb8",
  "--status-bar-bg": "#3b3336",
  "--nav-bg": "#2d282a",
  "--nav-text": "#fff3f1",
  "--desktop-default-bg": "#2d282a",
  "--desktop-default-text": "#fff3f1",
  "--scrollbar-thumb": "#79636b",
  "--chat-user-bg": "#654750",
  "--chat-user-text": "#fff3f1",
  "--chat-ai-bg": "#473c40",
  "--chat-ai-text": "#fff3f1",
};

const BERRY_GRID_WALLPAPER = [
  "repeating-linear-gradient(0deg, rgb(137 118 118 / 14%) 0 1px, transparent 1px 24px)",
  "repeating-linear-gradient(90deg, rgb(137 118 118 / 14%) 0 1px, transparent 1px 24px)",
  "#eee5e4",
].join(", ");

/** CSS additions that make the existing desktop primitives read like the reference. */
const BERRY_GRID_DESKTOP_CSS = `
.phone-screen-container {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --app-icon-radius: 30%;
  --app-default-icon-color: #d695a0;
  --app-default-icon-surface: #ffffff;
  --app-default-icon-border: rgb(255 255 255 / 86%);
  --desktop-app-text-color: #756b70;
}
.phone-screen-container .home-screen-drag-surface {
  background-color: transparent !important;
}
.phone-screen-container .app-icon-surface {
  background: #ffffff !important;
  border-color: rgb(255 255 255 / 90%) !important;
  box-shadow: 0 4px 10px rgb(112 83 91 / 12%), inset 0 0 0 1px rgb(255 255 255 / 55%) !important;
}
.phone-screen-container .app-icon-surface .app-default-icon {
  color: #d695a0 !important;
}
.phone-screen-container .desktop-app-label {
  color: #756b70 !important;
  text-shadow: 0 1px rgb(255 255 255 / 72%);
}
.phone-screen-container .dock-container {
  background: rgb(255 253 252 / 68%) !important;
  border-color: rgb(255 255 255 / 84%) !important;
  box-shadow: 0 10px 28px rgb(112 83 91 / 16%) !important;
  backdrop-filter: blur(18px) saturate(1.05);
}
.phone-screen-container .home-widget-card {
  background: rgb(255 253 252 / 78%) !important;
  border-color: rgb(255 255 255 / 82%) !important;
  box-shadow: 0 8px 20px rgb(112 83 91 / 12%) !important;
}
`;

export const BERRY_GRID_PRESET: StylePreset = {
  id: BERRY_GRID_PRESET_ID,
  name: BERRY_GRID_PRESET_NAME,
  bubbleCss: "",
  globalCss: BERRY_GRID_DESKTOP_CSS,
  wallpaper: BERRY_GRID_WALLPAPER,
  themeColor: "#d295a0",
  previewColors: ["#eee5e4", "#fffdfc", "#e8b5be", "#756b70"],
  themeTokens: {
    light: BERRY_GRID_LIGHT_TOKENS,
    dark: BERRY_GRID_DARK_TOKENS,
  },
};

/**
 * The previous built-in preset was removed from the library. These aliases are
 * intentionally private and only keep an existing user's saved preference
 * from becoming a blank theme after upgrading.
 */
const REMOVED_PRESET_ALIASES = new Set(["p-thin-strawberry", "薄巧莓莓"]);

export function resolveThemePreset(
  activePreset: string | undefined,
  customPresets: readonly StylePreset[] = [],
): StylePreset | undefined {
  if (!activePreset) return undefined;
  if (activePreset === BERRY_GRID_PRESET_ID || activePreset === BERRY_GRID_PRESET_NAME || REMOVED_PRESET_ALIASES.has(activePreset)) {
    return BERRY_GRID_PRESET;
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
