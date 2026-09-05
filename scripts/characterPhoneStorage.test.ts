import assert from "node:assert/strict";
import { createCharacterPhoneTextImageDataUrl } from "../src/features/characterPhone/characterPhoneTextImage";
import { getCharacterPhone, saveCharacterPhone } from "../src/core/storage/repositories/characterPhoneRepository";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const values = new Map<string, string>();
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(key, value); },
};
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const phone: CharacterPhoneRecord = {
  id: "phone-storage-test",
  ownerIdentityId: "identity-storage-test",
  characterId: "character-storage-test",
  passcode: "0000",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  wallpaper: "linear-gradient(white, white)",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
  messages: [],
  contacts: [],
  threadMessages: [],
  posts: [],
  browserHistory: [],
  diaryEntries: [],
  notes: [],
  todos: [],
  scheduleItems: [],
  phoneCalls: [],
  galleryItems: [{
    id: "phone-text-image-storage",
    title: "夜路 · 文字图",
    caption: "路灯刚亮，风有点凉。",
    timestamp: 1,
    source: "generated",
    dataUrl: createCharacterPhoneTextImageDataUrl("路灯刚亮，风有点凉。", "夜路 · 文字图"),
  }],
  lifeEvents: [],
  activities: [],
};

assert.equal(saveCharacterPhone(phone).success, true);
const serialized = values.get("phone_character_phones_v1") || "";
assert.equal(serialized.includes("data:image/svg+xml"), false, "text SVG data URLs stay out of localStorage");
assert.match(serialized, /textImageForId/);

const loaded = getCharacterPhone(phone.ownerIdentityId, phone.characterId);
assert.equal(loaded?.galleryItems[0]?.dataUrl, undefined);
assert.equal(loaded?.galleryItems[0]?.textImageForId, "phone-text-image-storage");

console.log("character phone storage compaction tests passed");
