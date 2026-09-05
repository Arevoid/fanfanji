import assert from "node:assert/strict";
import { createCharacterPhoneTextImageDataUrl } from "../src/features/characterPhone/characterPhoneTextImage";
import { clearCharacterPhoneData, getCharacterPhone, getCharacterPhoneStorageUsage, migrateLegacyCharacterPhones, saveCharacterPhone } from "../src/core/storage/repositories/characterPhoneRepository";
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
const serialized = values.get(`phone_character_phone_v2_${encodeURIComponent(phone.id)}`) || "";
assert.equal(serialized.includes("data:image/svg+xml"), false, "text SVG data URLs stay out of localStorage");
assert.match(serialized, /textImageForId/);
assert.match(values.get("phone_character_phone_index_v2") || "", /phone-storage-test/);
assert.equal(values.has("phone_character_phones_v1"), false, "new phones no longer use the aggregate v1 record");

const loaded = getCharacterPhone(phone.ownerIdentityId, phone.characterId);
assert.equal(loaded?.galleryItems[0]?.dataUrl, undefined);
assert.equal(loaded?.galleryItems[0]?.textImageForId, "phone-text-image-storage");
assert.equal(loaded?.passcode, "8952", "legacy default phone passcodes migrate to the new default");
const usage = getCharacterPhoneStorageUsage(phone.ownerIdentityId, phone.characterId);
assert.ok(usage.currentPhoneBytes > 0);
assert.equal(usage.legacyBytes, 0);

values.clear();
const legacyOtherPhone = { ...phone, id: "legacy-other-phone", characterId: "character-storage-test-2" };
values.set("phone_character_phones_v1", JSON.stringify([phone, legacyOtherPhone]));
const migrated = { ...phone, updatedAt: 10 };
assert.equal(saveCharacterPhone(migrated).success, true, "legacy phone writes migrate only the changed phone");
assert.equal(JSON.parse(values.get("phone_character_phones_v1") || "[]").length, 1);
assert.ok(values.has(`phone_character_phone_v2_${encodeURIComponent(phone.id)}`));
assert.equal(getCharacterPhone(phone.ownerIdentityId, phone.characterId)?.updatedAt, 10);
const migration = migrateLegacyCharacterPhones();
assert.equal(migration.result.success, true);
assert.equal(migration.migratedCount, 1);
assert.equal(migration.remainingLegacyCount, 0);
assert.equal(values.has("phone_character_phones_v1"), false, "the aggregate legacy record is removed after all phones migrate");
assert.ok(getCharacterPhone(legacyOtherPhone.ownerIdentityId, legacyOtherPhone.characterId));

const populated: CharacterPhoneRecord = {
  ...phone,
  passcode: "1234",
  wallpaper: "custom-wallpaper",
  appIcons: { chat: "custom-icon" },
  messages: [{ id: "message-1", sender: "character", body: "保留前的消息", timestamp: 2 }],
  contacts: [{ id: "contact-1", name: "林深", relation: "旧识", isLongTerm: true, isNpc: true }],
  threadMessages: [{ id: "thread-1", contactId: "contact-1", sender: "character", content: "你好", timestamp: 2 }],
  posts: [{ id: "post-1", author: "步随影", content: "今天的记录", timestamp: 2, likes: 0, comments: [], source: "generated" }],
  browserHistory: [{ id: "browser-1", query: "测试", title: "测试", timestamp: 2 }],
  diaryEntries: [{ id: "diary-1", title: "测试", body: "测试", timestamp: 2 }],
  notes: [{ id: "note-1", title: "测试", content: "测试", timestamp: 2 }],
  todos: [{ id: "todo-1", text: "测试", checked: false }],
  scheduleItems: [{ id: "schedule-1", title: "测试", detail: "测试", timestamp: 2 }],
  phoneCalls: [{ id: "call-1", contactName: "林深", direction: "incoming", timestamp: 2 }],
  galleryItems: [{ id: "gallery-1", title: "测试", caption: "测试", timestamp: 2, imageAssetId: "asset-1" }],
  musicTracks: [{ id: "track-1", title: "测试", artist: "测试", duration: "1:00" }],
  listeningHistory: [{ id: "listen-1", trackId: "track-1", startedAt: 2, durationSeconds: 60 }],
  musicPlaylists: [{ id: "playlist-1", name: "测试", trackIds: ["track-1"] }],
  actionLog: [{ id: "action-1", kind: "data_changed", app: "notes", timestamp: 2, actor: "user", detectability: "none" }],
  lifeEvents: [{ id: "event-1", summary: "测试", startedAt: 2, generatedAt: 2, sourceRefs: [], artifactRefs: [] }],
  activities: [{ id: "activity-1", type: "user_edit", label: "测试", timestamp: 2 }],
  awarenessLevel: 2,
  awarenessUpdatedAt: 2,
  phoneOpenCount: 4,
};
const cleared = clearCharacterPhoneData(populated, 99);
assert.equal(cleared.passcode, "1234");
assert.equal(cleared.wallpaper, "custom-wallpaper");
assert.deepEqual(cleared.appIcons, { chat: "custom-icon" });
assert.equal(cleared.updatedAt, 99);
assert.equal(cleared.messages.length, 0);
assert.equal(cleared.contacts.length, 0);
assert.equal(cleared.threadMessages.length, 0);
assert.equal(cleared.posts.length, 0);
assert.equal(cleared.browserHistory.length, 0);
assert.equal(cleared.diaryEntries.length, 0);
assert.equal(cleared.notes?.length, 0);
assert.equal(cleared.todos?.length, 0);
assert.equal(cleared.scheduleItems.length, 0);
assert.equal(cleared.phoneCalls?.length, 0);
assert.equal(cleared.galleryItems.length, 0);
assert.equal(cleared.musicTracks?.length, 0);
assert.equal(cleared.listeningHistory?.length, 0);
assert.equal(cleared.musicPlaylists?.length, 0);
assert.equal(cleared.actionLog?.length, 0);
assert.equal(cleared.lifeEvents?.length, 0);
assert.equal(cleared.activities.length, 0);
assert.equal(cleared.awarenessLevel, undefined);
assert.equal(cleared.phoneOpenCount, 0);

console.log("character phone storage compaction tests passed");
