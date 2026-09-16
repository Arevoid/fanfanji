import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { UserSettings } from "../src/types";

const values = new Map<string, string>();
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) {
    // Simulate a small browser quota. Asset-backed settings remain tiny even
    // when the runtime copy still contains large data URLs.
    if (key === "phone_settings" && value.length > 2000) {
      const error = new Error("quota");
      Object.assign(error, { name: "QuotaExceededError", code: 22 });
      throw error;
    }
    values.set(key, value);
  },
};

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const assets = await import("../src/core/storage/settingsAssetRepository");
const repository = await import("../src/core/storage/repositories/settingsRepository");
const wallpaper = `data:image/jpeg;base64,${"w".repeat(5000)}`;
const icon = `data:image/png;base64,${"i".repeat(2000)}`;
const settings = {
  name: "饭饭",
  avatar: "avatar",
  signature: "",
  bio: "",
  apiKey: "",
  selectedModel: "model",
  wallpaper,
  wallpaperSource: "user",
  wallpaperAssetId: assets.SETTINGS_WALLPAPER_ASSET_ID,
  customIcons: { chat: icon },
  customIconsAssetId: assets.SETTINGS_CUSTOM_ICONS_ASSET_ID,
  bubbleCss: "",
  globalCss: "",
  activePreset: "default",
} as UserSettings;

await assets.saveSettingsAssetOverlay({
  version: 1,
  wallpaper,
  customIcons: settings.customIcons,
});
assert.equal(repository.saveSettings(settings).success, true);
const persisted = JSON.parse(values.get("phone_settings") || "null") as UserSettings;
assert.equal(persisted.wallpaper, "");
assert.deepEqual(persisted.customIcons, {});
assert.equal(persisted.wallpaperAssetId, assets.SETTINGS_WALLPAPER_ASSET_ID);
assert.equal(persisted.customIconsAssetId, assets.SETTINGS_CUSTOM_ICONS_ASSET_ID);

const loadedOverlay = await assets.loadSettingsAssetOverlay();
assert.equal(loadedOverlay?.wallpaper, wallpaper);
assert.deepEqual(loadedOverlay?.customIcons, settings.customIcons);
const hydrated = assets.applySettingsAssetOverlay(persisted, loadedOverlay);
assert.equal(hydrated.wallpaper, wallpaper);
assert.deepEqual(hydrated.customIcons, settings.customIcons);

console.log("PASS wallpaper and custom icon assets persist in IndexedDB without bloating phone_settings");
