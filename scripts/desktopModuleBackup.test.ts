import assert from "node:assert/strict";
import { applyDesktopModuleBackup, buildDesktopModuleBackup, parseDesktopModuleBackup } from "../src/features/home/desktopModuleBackup";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] || null; }
  getItem(key: string) { return this.values.get(key) || null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
storage.setItem("phone_homescreen_items", JSON.stringify([
  { id: "chat", type: "app", size: "1x1", page: 0, position: { page: 0, row: 3, column: 3 } },
]));
storage.setItem("calendar_album_image_widget-1", "data:image/png;base64,calendar");
storage.setItem("anniversary_title_widget-2", "纪念日");
storage.setItem("phone_messages", "must-not-export");
const settings: any = { wallpaper: "wallpaper", customIcons: { chat: "icon" }, dockColor: "#fff", dockOpacity: 70, apiKey: "secret", selectedModel: "model" };

const exported = buildDesktopModuleBackup(settings, storage);
assert.equal(exported.settings.wallpaper, "wallpaper");
assert.equal("apiKey" in exported.settings, false);
assert.deepEqual(Object.keys(exported.storage).sort(), ["anniversary_title_widget-2", "calendar_album_image_widget-1", "phone_homescreen_items"]);
const parsedBackup = parseDesktopModuleBackup(exported);
assert.equal(parsedBackup.format, "fanfanji-desktop-module");
assert.deepEqual(
  JSON.parse(parsedBackup.storage.phone_homescreen_items),
  [{ id: "chat", type: "app", size: "1x1", page: 0, position: { page: 0, row: 3, column: 3 } }],
);
assert.throws(() => parseDesktopModuleBackup({ ...exported, settings: { apiKey: "secret" } }), /不支持/);

const destination = new MemoryStorage();
destination.setItem("phone_settings", JSON.stringify({ apiKey: "keep", wallpaper: "old" }));
destination.setItem("calendar_album_image_old", "stale");
applyDesktopModuleBackup(parsedBackup, destination);
assert.deepEqual(JSON.parse(destination.getItem("phone_settings") || "{}"), { apiKey: "keep", wallpaper: "wallpaper", customIcons: { chat: "icon" }, dockColor: "#fff", dockOpacity: 70 });
assert.equal(destination.getItem("calendar_album_image_old"), null);
assert.equal(destination.getItem("anniversary_title_widget-2"), "纪念日");
assert.deepEqual(
  JSON.parse(destination.getItem("phone_homescreen_items") || "[]")[0].position,
  { page: 0, row: 3, column: 3 },
);

const legacyBackup = parseDesktopModuleBackup({
  ...exported,
  storage: {
    phone_homescreen_items: JSON.stringify([
      { id: "legacy-a", type: "app", size: "1x1", page: 0 },
      { id: "legacy-b", type: "app", size: "1x1", page: 0 },
    ]),
  },
});
assert.deepEqual(
  JSON.parse(legacyBackup.storage.phone_homescreen_items).map((entry: any) => entry.position),
  [{ page: 0, row: 0, column: 0 }, { page: 0, row: 0, column: 1 }],
);

console.log("desktop module backup tests passed");
