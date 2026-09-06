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

const { characterPhoneDb } = await import("../src/core/storage/characterPhoneDb");
const existing: CharacterPhoneRecord = {
  id: "phone-existing-before-hydration",
  ownerIdentityId: "identity-existing-before-hydration",
  characterId: "character-existing-before-hydration",
  passcode: "8952",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 10,
  wallpaper: "white",
  appOrder: ["chat"],
  messages: [],
  contacts: [{ id: "existing-contact", name: "原有联系人", relation: "朋友", isLongTerm: true, isNpc: true }],
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
await characterPhoneDb.replaceAll([existing]);

const doomed = {
  ...existing,
  id: "phone-doomed-before-hydration",
  ownerIdentityId: "identity-doomed-before-hydration",
  characterId: "character-doomed-before-hydration",
};
await characterPhoneDb.replaceAll([existing, doomed]);

const { flushCharacterPhoneRepository, getCharacterPhone, initializeCharacterPhoneRepository, removeCharacterPhonesByCharacterIds, saveCharacterPhone } = await import("../src/core/storage/repositories/characterPhoneRepository");
// Deleting while hydration is pending must create a tombstone, not only edit
// the still-empty localStorage view.
assert.equal(removeCharacterPhonesByCharacterIds([doomed.characterId]).result.success, true);
const openedDuringHydration: CharacterPhoneRecord = {
  ...existing,
  id: "phone-new-during-hydration",
  ownerIdentityId: "identity-new-during-hydration",
  characterId: "character-new-during-hydration",
  updatedAt: 20,
  contacts: [],
};

// This write happens before repository initialization and therefore must merge
// with the existing IndexedDB snapshot instead of replacing it.
assert.equal(saveCharacterPhone(openedDuringHydration).success, true);
assert.equal((await flushCharacterPhoneRepository()).success, true);
await initializeCharacterPhoneRepository();
assert.equal(getCharacterPhone(existing.ownerIdentityId, existing.characterId)?.contacts[0]?.name, "原有联系人");
assert.equal(getCharacterPhone(openedDuringHydration.ownerIdentityId, openedDuringHydration.characterId)?.id, openedDuringHydration.id);
assert.equal(getCharacterPhone(doomed.ownerIdentityId, doomed.characterId), undefined);

console.log("character phone early hydration merge tests passed");
