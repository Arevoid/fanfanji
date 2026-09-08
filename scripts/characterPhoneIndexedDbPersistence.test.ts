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
  setItem(key, value) { values.set(key, value); },
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

const { initializeCharacterPhoneRepository, getCharacterPhone, saveCharacterPhone } = await import("../src/core/storage/repositories/characterPhoneRepository");
const phone: CharacterPhoneRecord = {
  id: "phone-idb-test",
  ownerIdentityId: "identity-idb-test",
  characterId: "character-idb-test",
  passcode: "8952",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  wallpaper: "white",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
  messages: [],
  contacts: [{ id: "contact-idb", name: "林深", relation: "朋友", isLongTerm: true, isNpc: true }],
  threadMessages: [],
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

// Before hydration, legacy callers can still write the old localStorage copy.
assert.equal(saveCharacterPhone(phone).success, true);
assert.ok(values.has("phone_character_phone_v2_phone-idb-test"));

const initialized = await initializeCharacterPhoneRepository();
assert.equal(initialized.valid, true);
assert.equal(getCharacterPhone(phone.ownerIdentityId, phone.characterId)?.contacts[0]?.name, "林深");
assert.equal(values.has("phone_character_phone_v2_phone-idb-test"), false, "legacy localStorage copy is removed only after IndexedDB migration succeeds");

// Once hydrated, writes no longer touch localStorage and therefore remain
// available even when the browser's localStorage quota is exhausted.
values.set("unrelated-full-key", "x".repeat(100_000));
const updated = { ...phone, updatedAt: 2, contacts: [{ ...phone.contacts[0], name: "周树生" }] };
assert.equal(saveCharacterPhone(updated).success, true);
assert.equal(getCharacterPhone(phone.ownerIdentityId, phone.characterId)?.contacts[0]?.name, "周树生");

console.log("character phone IndexedDB persistence tests passed");
