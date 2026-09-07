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

const {
  initializeCharacterPhoneRepository,
  getCharacterPhone,
  saveCharacterPhone,
} = await import("../src/core/storage/repositories/characterPhoneRepository");
const { runCharacterPhoneIsolationRepair } = await import("../src/core/storage/characterPhoneOneTimeCleanup");

const phone: CharacterPhoneRecord = {
  id: "phone-isolation-repair-test",
  ownerIdentityId: "identity-isolation-repair-test",
  characterId: "character-isolation-repair-test",
  passcode: "1234",
  hiddenGalleryPasscode: "5678",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 2,
  wallpaper: "custom-wallpaper",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
  messages: [],
  contacts: [{ id: "old-contact", name: "旧联系人", relation: "朋友", isLongTerm: true, isNpc: true }],
  threadMessages: [{ id: "old-thread", contactId: "old-contact", sender: "contact", content: "旧聊天", timestamp: 2 }],
  posts: [{ id: "old-post", author: "角色", content: "旧动态", timestamp: 2, likes: 0, comments: [], source: "generated" }],
  browserHistory: [],
  diaryEntries: [],
  notes: [],
  todos: [],
  scheduleItems: [],
  phoneCalls: [],
  galleryItems: [],
  activities: [],
  initialContentPending: true,
  phoneDataVersion: 2,
};

assert.equal(saveCharacterPhone(phone).success, true);
assert.equal((await initializeCharacterPhoneRepository()).valid, true);
values.set("phone_messages_v3", "must-remain");

const result = await runCharacterPhoneIsolationRepair();
assert.equal(result.result.success, true);
assert.equal(result.removedPhoneCount, 1);
const repaired = getCharacterPhone(phone.ownerIdentityId, phone.characterId);
assert.equal(repaired?.passcode, "1234");
assert.equal(repaired?.wallpaper, "custom-wallpaper");
assert.equal(repaired?.contacts.length, 0);
assert.equal(repaired?.threadMessages.length, 0);
assert.equal(repaired?.posts.length, 0);
assert.equal(repaired?.initialContentPending, true);
assert.ok(repaired?.sourceHydrationSuppressedAt);
assert.equal(repaired?.phoneDataVersion, 3);
assert.equal(values.get("phone_messages_v3"), "must-remain", "repair must not touch main-phone data");

console.log("character phone isolation repair tests passed");
