import assert from "node:assert/strict";
import { buildCharacterPhoneBrowserDetail } from "../src/features/characterPhone/characterPhoneBrowserDetails";
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

const makePhone = (characterId: string, query: string): CharacterPhoneRecord => ({
  id: `phone-${characterId}`,
  ownerIdentityId: "synthetic-owner",
  characterId,
  passcode: "0001",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 2,
  wallpaper: "synthetic",
  appOrder: ["chat", "browser", "schedule", "gallery", "diary", "notes", "music", "settings"],
  messages: [],
  contacts: [],
  threadMessages: [],
  posts: [],
  browserHistory: [{
    id: `browser-${characterId}`,
    query,
    title: `${query} 的搜索结果`,
    timestamp: 2,
    summary: `${characterId} 的独立浏览记录`,
  }],
  diaryEntries: [],
  notes: [],
  todos: [],
  scheduleItems: [],
  phoneCalls: [],
  galleryItems: [],
  lifeEvents: [],
  activities: [],
});

assert.equal(saveCharacterPhone(makePhone("character-a", "角色 A 的搜索")).success, true);
assert.equal(saveCharacterPhone(makePhone("character-b", "角色 B 的搜索")).success, true);

const phoneA = getCharacterPhone("synthetic-owner", "character-a");
const phoneB = getCharacterPhone("synthetic-owner", "character-b");
assert.deepEqual(phoneA?.browserHistory.map((entry) => entry.query), ["角色 A 的搜索"]);
assert.deepEqual(phoneB?.browserHistory.map((entry) => entry.query), ["角色 B 的搜索"]);
assert.equal(phoneA?.browserHistory.some((entry) => entry.query.includes("角色 B")), false);
assert.equal(phoneB?.browserHistory.some((entry) => entry.query.includes("角色 A")), false);

const blocked = buildCharacterPhoneBrowserDetail({
  id: "blocked",
  query: "example",
  title: "<!doctype html><title>Just a moment... Cloudflare</title>",
  timestamp: 3,
}, "角色 A");
assert.equal(blocked.error?.code, "cloudflare_block");
assert.equal(blocked.results.length, 0);
assert.equal(blocked.summary.includes("<!doctype html>"), false);
assert.equal(blocked.reflection.includes("Cloudflare"), false);

console.log("PASS browser history is character-scoped and blocked HTML stays friendly");
