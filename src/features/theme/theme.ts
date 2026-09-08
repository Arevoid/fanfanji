export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export interface AppearanceSettings {
  themeMode: ThemeMode;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  themeMode: "light",
};

// Keep these literals in sync with the tiny pre-React bootstrap in index.html.
export const LIGHT_THEME_COLOR = "#f7f7f5";
export const DARK_THEME_COLOR = "#171719";
export const THEME_COLOR_META_ID = "app-theme-color";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function sanitizeAppearanceSettings(value: unknown): AppearanceSettings {
  if (!value || typeof value !== "object" || !isThemeMode((value as Record<string, unknown>).themeMode)) {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }
  return { themeMode: (value as AppearanceSettings).themeMode };
}

export function resolveTheme(themeMode: ThemeMode, systemPrefersDark = false): ResolvedTheme {
  if (themeMode === "system") return systemPrefersDark ? "dark" : "light";
  return themeMode;
}

export function getThemeColor(theme: ResolvedTheme): string {
  return theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

export interface ThemeMediaQuery {
  matches: boolean;
  addEventListener?: (type: "change", listener: (event: ThemeMediaQuery) => void) => void;
  removeEventListener?: (type: "change", listener: (event: ThemeMediaQuery) => void) => void;
  addListener?: (listener: (event: ThemeMediaQuery) => void) => void;
  removeListener?: (listener: (event: ThemeMediaQuery) => void) => void;
}

export function subscribeToSystemTheme(query: ThemeMediaQuery, listener: (prefersDark: boolean) => void): () => void {
  const handleChange = (event: ThemeMediaQuery) => listener(event.matches);
  if (query.addEventListener && query.removeEventListener) {
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener?.("change", handleChange);
  }
  query.addListener?.(handleChange);
  return () => query.removeListener?.(handleChange);
}
