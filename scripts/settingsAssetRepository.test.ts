import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { UserSettings } from "../src/types";

const values = new Map<string, string>();
let forceSettingsQuota = false;
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) {
    // Simulate a small browser quota. Asset-backed settings remain tiny even
    // when the runtime copy still contains large data URLs.
    if (key === "phone_settings" && (forceSettingsQuota || value.length > 2000)) {
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

// Reproduce an older installation where legacy image data already filled the
// settings bucket. The IndexedDB asset write has succeeded, but even the small
// reference-only localStorage write is rejected; the settings reference must
// then survive through the scoped durable overlay.
values.set("phone_settings", JSON.stringify({
  ...persisted,
  wallpaper: `data:image/jpeg;base64,${"l".repeat(8000)}`,
  wallpaperAssetId: undefined,
  customIcons: { chat: `data:image/png;base64,${"o".repeat(4000)}` },
  customIconsAssetId: undefined,
}));
forceSettingsQuota = true;
assert.equal((await repository.saveSettingsAsync(settings)).success, true, "asset references should await the durable overlay when phone_settings remains over quota");
const durable = await repository.loadSettingsDurableOverlay();
assert.equal(durable?.wallpaperAssetId, assets.SETTINGS_WALLPAPER_ASSET_ID);
assert.equal(durable?.customIconsAssetId, assets.SETTINGS_CUSTOM_ICONS_ASSET_ID);
assert.equal("customIcons" in (durable || {}), false, "asset bytes must not be duplicated in the reference fallback");
assert.ok(await repository.loadSettingsDurableOverlay(), "an unsynced durable overlay must remain available across restarts");

// Startup must recover the durable IDs before reading asset bytes. If the
// asset overlay is read first, applySettingsAssetOverlay sees no stable ID and
// leaves both settings blank even though both IndexedDB records exist.
let startupSettings = JSON.parse(values.get("phone_settings")!) as UserSettings;
await repository.hydrateSettingsOverlays(
  () => startupSettings,
  (next) => { startupSettings = next; },
);
assert.equal(startupSettings.wallpaper, wallpaper);
assert.equal(startupSettings.wallpaperAssetId, assets.SETTINGS_WALLPAPER_ASSET_ID);
assert.deepEqual(startupSettings.customIcons, settings.customIcons);
assert.equal(startupSettings.customIconsAssetId, assets.SETTINGS_CUSTOM_ICONS_ASSET_ID);

const recovered = repository.applySettingsDurableOverlay(JSON.parse(values.get("phone_settings")!) as UserSettings, durable!);
const recoveredWithAssets = assets.applySettingsAssetOverlay(recovered, loadedOverlay);
assert.equal(recoveredWithAssets.wallpaper, wallpaper);
assert.deepEqual(recoveredWithAssets.customIcons, settings.customIcons);
forceSettingsQuota = false;
assert.equal(repository.saveSettings(recoveredWithAssets).success, true);
assert.equal(await repository.loadSettingsDurableOverlay(), null, "once the compact settings record is saved, its durable overlay can be removed");

forceSettingsQuota = true;
const reset = {
  ...recoveredWithAssets,
  wallpaper: "",
  wallpaperSource: null,
  wallpaperAssetId: null,
  customIcons: {},
  customIconsAssetId: null,
};
assert.equal(repository.saveSettings(reset).success, true, "asset reset references should also survive localStorage quota");
const resetOverlay = await repository.loadSettingsDurableOverlay();
const resetSettings = repository.applySettingsDurableOverlay(recoveredWithAssets, resetOverlay!);
assert.equal(resetSettings.wallpaper, "");
assert.equal(resetSettings.wallpaperAssetId, null);
assert.deepEqual(resetSettings.customIcons, {});
assert.equal(resetSettings.customIconsAssetId, null);
forceSettingsQuota = false;
assert.equal(repository.saveSettings(reset).success, true);
assert.equal(await repository.loadSettingsDurableOverlay(), null);

console.log("PASS wallpaper and custom icon assets survive localStorage quota via IndexedDB references");
