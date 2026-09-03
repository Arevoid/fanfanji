import assert from "node:assert/strict";
import { loadSettings, normalizeIdentitySettings, resolveSettingsUpdate, saveSettings } from "../src/core/storage/repositories/settingsRepository";
import type { UserSettings } from "../src/types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

const defaultSettings = {
  name: "默认身份",
  avatar: "default-avatar",
  signature: "",
  bio: "",
  apiKey: "",
  selectedModel: "",
  wallpaper: "",
  customIcons: {},
  bubbleCss: "",
  globalCss: "",
  activePreset: "default",
  activeIdentityId: "identity-1",
  identities: [
    { id: "identity-1", name: "身份一", avatar: "avatar-1", signature: "", bio: "" },
    { id: "identity-2", name: "身份二", avatar: "avatar-2", signature: "", bio: "" },
    { id: "identity-3", name: "身份三", avatar: "avatar-3", signature: "", bio: "" },
  ],
} as UserSettings;

let currentSettings = defaultSettings;
currentSettings = resolveSettingsUpdate(currentSettings, (previous) => ({
  ...previous,
  activeIdentityId: "identity-2",
  name: "身份二",
  avatar: "avatar-2",
}));
assert.equal(currentSettings.activeIdentityId, "identity-2");
assert.equal(saveSettings(currentSettings).success, true);

currentSettings = resolveSettingsUpdate(currentSettings, (previous) => ({
  ...previous,
  activeIdentityId: "identity-3",
  name: "身份三",
  avatar: "avatar-3",
}));
assert.equal(currentSettings.activeIdentityId, "identity-3");
assert.equal(saveSettings(currentSettings).success, true);

// A stale full-object snapshot must not be used by the migrated identity switch path.
const staleSettingsSnapshot = { ...defaultSettings, activeIdentityId: "identity-1" };
const latestSettings = resolveSettingsUpdate(currentSettings, (previous) => ({
  ...previous,
  bio: "最新资料",
  identities: (previous.identities || []).map((identity) => identity.id === "identity-3"
    ? { ...identity, bio: "最新资料" }
    : identity),
}));
assert.equal(latestSettings.activeIdentityId, "identity-3");
assert.equal(staleSettingsSnapshot.activeIdentityId, "identity-1");
assert.equal(saveSettings(latestSettings).success, true);

const restored = loadSettings(defaultSettings);
assert.equal(restored.valid, true);
assert.equal(restored.value.activeIdentityId, "identity-3");
assert.equal(restored.value.name, "身份三");
assert.equal(restored.value.bio, "最新资料");

console.log("settings identity persistence tests passed");

const duplicatedSettings = {
  ...defaultSettings,
  activeIdentityId: "identity-3",
  name: "旧主号名称",
  identities: [
    { id: "identity-1", name: "身份一", avatar: "avatar-1", signature: "签名一", bio: "简介一" },
    { id: "identity-2", name: "身份二", avatar: "avatar-2", signature: "签名二", bio: "简介二" },
    { id: "identity-2", name: "身份三", avatar: "avatar-3", signature: "签名三", bio: "简介三" },
  ],
} as UserSettings;
const normalized = normalizeIdentitySettings(duplicatedSettings);
assert.equal(normalized.changed, true);
assert.equal(new Set(normalized.settings.identities?.map((identity) => identity.id)).size, 3);
assert.equal(normalized.settings.activeIdentityId, "identity-1");
assert.equal(normalized.settings.name, "身份一");
assert.equal(normalized.settings.avatar, "avatar-1");

console.log("identity normalization tests passed");
