import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { UserSettings } from "../src/types";

const values = new Map<string, string>();
let settingsQuotaBlocked = true;
let maxSettingsLength = Number.POSITIVE_INFINITY;
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) {
    if (key === "phone_settings" && (settingsQuotaBlocked || value.length > maxSettingsLength)) {
      const error = new Error("quota");
      Object.assign(error, { name: "QuotaExceededError", code: 22 });
      throw error;
    }
    values.set(key, value);
  },
};

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const repository = await import("../src/core/storage/repositories/settingsRepository");
const settings = {
  name: "新身份",
  avatar: "data:image/jpeg;base64,profile",
  signature: "",
  bio: "新的背景",
  apiKey: "must-stay-out-of-overlay",
  selectedModel: "model",
  wallpaper: "",
  customIcons: {},
  bubbleCss: "",
  globalCss: "",
  activePreset: "default",
  activeIdentityId: "identity-1",
  chatEnterKeyNewline: true,
  identities: [{ id: "identity-1", name: "新身份", avatar: "data:image/jpeg;base64,profile", signature: "", bio: "新的背景" }],
} as UserSettings;
const baseSettings = {
  ...settings,
  name: "旧身份",
  avatar: "old-avatar",
  bio: "旧背景",
  chatEnterKeyNewline: false,
  identities: [{ id: "identity-1", name: "旧身份", avatar: "old-avatar", signature: "", bio: "旧背景" }],
} as UserSettings;
// Seed the old monolithic record without going through the quota-throwing
// setItem implementation, matching a previously persisted user profile.
values.set("phone_settings", JSON.stringify(baseSettings));

// The legacy monolithic value is full, but the profile and keyboard edit must
// still be accepted without replacing or deleting the old value.
assert.equal(repository.saveSettings(settings).success, true);
const overlay = await repository.loadSettingsDurableOverlay();
assert.equal(overlay?.name, "新身份");
assert.equal(overlay?.chatEnterKeyNewline, true);
assert.equal(overlay?.identities?.[0]?.avatar, settings.avatar);
assert.equal("apiKey" in (overlay || {}), false, "credentials must never enter the quota fallback");

assert.equal(
  repository.saveSettings({ ...settings, wallpaper: "wallpaper-change" }).success,
  false,
  "non-profile settings must not be reported as saved when the monolithic record is full",
);

const merged = repository.applySettingsDurableOverlay({ ...settings, name: "旧身份", chatEnterKeyNewline: false }, overlay!);
assert.equal(merged.name, "新身份");
assert.equal(merged.chatEnterKeyNewline, true);
settingsQuotaBlocked = false;
assert.equal(repository.saveSettings(settings).success, true);
assert.equal(await repository.loadSettingsDurableOverlay(), null, "a later successful settings save must clear an old overlay");
assert.equal(await repository.clearSettingsDurableOverlay(), undefined);
assert.equal(await repository.loadSettingsDurableOverlay(), null);

maxSettingsLength = 2_000;
const bulkyApiSettings = {
  ...settings,
  apiKey: "credential-must-remain-in-localStorage",
  apiPresets: [{ id: "preset-large", name: "API", apiKey: "credential-must-remain-in-localStorage", apiEndpoint: "https://example.test/v1", selectedModel: "model" }],
  globalCss: "repeated-style-rule;".repeat(4_000),
} as UserSettings;
assert.equal(repository.saveSettings(bulkyApiSettings).success, true, "compressing settings should free enough LocalStorage room for API edits");
assert.match(values.get("phone_settings") || "", /^lz-settings-v1:/, "API settings stay in the compressed LocalStorage record, not an IndexedDB credential overlay");
assert.equal((repository.loadSettings({ ...bulkyApiSettings, globalCss: "" } as UserSettings).value.apiPresets?.[0]?.apiKey), "credential-must-remain-in-localStorage");

console.log("PASS settings profile and keyboard edits survive localStorage quota via a scoped IndexedDB overlay");
