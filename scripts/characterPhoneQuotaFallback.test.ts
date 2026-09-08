import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { CharacterPhoneRecord } from "../src/domain/characterPhone/types";

const values = new Map<string, string>();
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) {
    if (key.startsWith("phone_character_phone_v2_")) {
      const error = new Error("quota");
      Object.assign(error, { name: "QuotaExceededError", code: 22 });
      throw error;
    }
    values.set(key, value);
  },
};
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage,
    dispatchEvent() { return true; },
    addEventListener() {},
    removeEventListener() {},
  },
});

const { flushCharacterPhoneRepository, getCharacterPhone, saveCharacterPhone } = await import("../src/core/storage/repositories/characterPhoneRepository");
const phone: CharacterPhoneRecord = {
  id: "phone-quota-fallback-test",
  ownerIdentityId: "identity-quota-fallback-test",
  characterId: "character-quota-fallback-test",
  passcode: "8952",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  wallpaper: "white",
  appOrder: ["chat"],
  messages: [],
  contacts: [],
  threadMessages: [{ id: "thread-1", contactId: "contact-1", sender: "contact", content: "保留完整记录", timestamp: 1 }],
  posts: [],
  browserHistory: [],
  diaryEntries: [],
  notes: [],
  todos: [],
  scheduleItems: [],
  phoneCalls: [],
  galleryItems: [],
  activities: [],
};

assert.equal(saveCharacterPhone(phone).success, true, "localStorage quota must fall back to IndexedDB");
assert.equal(getCharacterPhone(phone.ownerIdentityId, phone.characterId)?.threadMessages[0]?.content, "保留完整记录");
assert.equal(values.has(`phone_character_phone_v2_${encodeURIComponent(phone.id)}`), false);
assert.equal((await flushCharacterPhoneRepository()).success, true);

console.log("character phone quota fallback tests passed");
