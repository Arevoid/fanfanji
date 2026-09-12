import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { UserSettings } from "../src/types";

const values = new Map<string, string>();
let settingsQuotaBlocked = true;
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) {
    if (key === "phone_settings" && settingsQuotaBlocked) {
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

console.log("PASS settings profile and keyboard edits survive localStorage quota via a scoped IndexedDB overlay");
