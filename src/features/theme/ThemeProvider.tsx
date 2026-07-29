import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadAppearanceSettings, saveAppearanceSettings, subscribeAppearanceSettings } from "./appearanceRepository";
import { getThemeColor, resolveTheme, subscribeToSystemTheme, THEME_COLOR_META_ID, type ResolvedTheme, type ThemeMode } from "./theme";

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemPreference(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = getThemeColor(theme);
  document.body.style.backgroundColor = getThemeColor(theme);
  document.body.style.colorScheme = theme;
  const appRoot = document.getElementById("root");
  if (appRoot) {
    appRoot.style.backgroundColor = getThemeColor(theme);
    appRoot.style.colorScheme = theme;
  }
  const meta = document.getElementById(THEME_COLOR_META_ID) as HTMLMetaElement | null;
  if (meta) meta.content = getThemeColor(theme);
  const appleStatusBar = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleStatusBar) appleStatusBar.content = theme === "dark" ? "black-translucent" : "default";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setStoredThemeMode] = useState<ThemeMode>(() => loadAppearanceSettings().themeMode);
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPreference);
  const resolvedTheme = resolveTheme(themeMode, systemPrefersDark);

  useEffect(() => subscribeAppearanceSettings((settings) => {
    setStoredThemeMode((current) => current === settings.themeMode ? current : settings.themeMode);
  }), []);

  useEffect(() => {
    if (themeMode !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemPrefersDark(query.matches);
    return subscribeToSystemTheme(query, setSystemPrefersDark);
  }, [themeMode]);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setStoredThemeMode(mode);
    saveAppearanceSettings({ themeMode: mode });
  }, []);

  const value = useMemo(() => ({ themeMode, resolvedTheme, setThemeMode }), [resolvedTheme, setThemeMode, themeMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
