import type { HomeScreenItem, UserSettings } from "../../types";
import { normalizeHomeScreenLayout } from "./homeGrid";

export const DESKTOP_SETTING_KEYS = [
  "wallpaper", "wallpaperSource", "customIcons", "dockIcons", "dockColor", "dockOpacity", "dockBorderRadius",
  "widgetOpacity", "widgetBorderRadius", "iconBorderRadius", "iconBgOpacity",
  "iconBorderWidth", "iconBorderOpacity", "iconBorderEnabled", "hideAppNames",
  "desktopAppTextColor", "desktopIconMode", "hideHomeWelcomeWidget", "homeButtonPosition",
] as const satisfies ReadonlyArray<keyof UserSettings>;

const DESKTOP_STORAGE_KEYS = new Set([
  "phone_homescreen_items",
  "phone_installed_apps",
  "phone_memo_todos",
  "phone_dual_music_widget_configs",
  "phone_identity_music_states",
  "phone_relationship_music_states",
]);
const WIDGET_STORAGE_PREFIXES = ["album_widget_photos_", "calendar_album_", "anniversary_", "time_widget_"];

export interface DesktopModuleBackup {
  format: "fanfanji-desktop-module";
  version: 1;
  exportedAt: number;
  settings: Partial<Pick<UserSettings, (typeof DESKTOP_SETTING_KEYS)[number]>>;
  storage: Record<string, string>;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const isDesktopStorageKey = (key: string) =>
  DESKTOP_STORAGE_KEYS.has(key) || WIDGET_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));

export const buildDesktopModuleBackup = (settings: UserSettings, storage: StorageLike): DesktopModuleBackup => {
  const desktopSettings = Object.fromEntries(
    DESKTOP_SETTING_KEYS
      .filter((key) => settings[key] !== undefined)
      .map((key) => [key, settings[key]]),
  ) as DesktopModuleBackup["settings"];
  const desktopStorage: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !isDesktopStorageKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) desktopStorage[key] = value;
  }
  return { format: "fanfanji-desktop-module", version: 1, exportedAt: Date.now(), settings: desktopSettings, storage: desktopStorage };
};

export const parseDesktopModuleBackup = (value: unknown): DesktopModuleBackup => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("不是有效的桌面模块备份文件。");
  const source = value as Record<string, unknown>;
  if (source.format !== "fanfanji-desktop-module" || source.version !== 1) throw new Error("不支持的桌面模块备份格式。");
  if (!source.settings || typeof source.settings !== "object" || Array.isArray(source.settings)) throw new Error("桌面设置数据无效。");
  if (!source.storage || typeof source.storage !== "object" || Array.isArray(source.storage)) throw new Error("小组件数据无效。");
  const settings = source.settings as Record<string, unknown>;
  const storage = source.storage as Record<string, unknown>;
  if (Object.keys(settings).some((key) => !DESKTOP_SETTING_KEYS.includes(key as (typeof DESKTOP_SETTING_KEYS)[number]))) throw new Error("备份包含不支持的设置字段。");
  if (Object.entries(storage).some(([key, item]) => !isDesktopStorageKey(key) || typeof item !== "string")) throw new Error("备份包含无效的小组件数据。");
  const normalizedStorage = { ...storage } as Record<string, string>;
  if (normalizedStorage.phone_homescreen_items) {
    try {
      const parsedLayout = JSON.parse(normalizedStorage.phone_homescreen_items);
      normalizedStorage.phone_homescreen_items = JSON.stringify(normalizeHomeScreenLayout(
        Array.isArray(parsedLayout) ? parsedLayout as HomeScreenItem[] : [],
      ));
    } catch {
      normalizedStorage.phone_homescreen_items = "[]";
    }
  }
  return { format: source.format, version: source.version, exportedAt: typeof source.exportedAt === "number" ? source.exportedAt : 0, settings: settings as DesktopModuleBackup["settings"], storage: normalizedStorage };
};

/** Merges desktop-only values without touching accounts, API credentials, chats, or characters. */
export const applyDesktopModuleBackup = (backup: DesktopModuleBackup, storage: StorageLike) => {
  let currentSettings: Record<string, unknown> = {};
  const rawSettings = storage.getItem("phone_settings");
  if (rawSettings) {
    try { currentSettings = JSON.parse(rawSettings) as Record<string, unknown>; } catch { /* overwrite only known desktop fields below */ }
  }
  storage.setItem("phone_settings", JSON.stringify({ ...currentSettings, ...backup.settings }));
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && isDesktopStorageKey(key) && !Object.hasOwn(backup.storage, key)) storage.removeItem(key);
  }
  Object.entries(backup.storage).forEach(([key, value]) => storage.setItem(key, value));
};
