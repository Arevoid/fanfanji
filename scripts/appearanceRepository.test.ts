import assert from "node:assert/strict";
import { loadAppearanceSettings, saveAppearanceSettings } from "../src/features/theme/appearanceRepository";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const storage = new MemoryStorage();
assert.deepEqual(loadAppearanceSettings(storage), { themeMode: "light" });
storage.setItem("phone_appearance_settings", "{");
assert.deepEqual(loadAppearanceSettings(storage), { themeMode: "light" });
let broadcasts = 0;
const target = { dispatchEvent: () => { broadcasts += 1; return true; }, addEventListener: () => undefined, removeEventListener: () => undefined };
assert.equal(saveAppearanceSettings({ themeMode: "dark" }, storage, target), true);
assert.deepEqual(loadAppearanceSettings(storage), { themeMode: "dark" });
assert.equal(saveAppearanceSettings({ themeMode: "dark" }, storage, target), false);
assert.equal(broadcasts, 1);
console.log("PASS appearance persistence, corruption fallback, and duplicate-save guard");
