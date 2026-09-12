import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import {
  buildSystemBackup,
  filterSystemBackupLocalStorageForRestore,
  parseSystemBackup,
  restoreSystemBackupIndexedDb,
  snapshotSystemBackupIndexedDb,
  SYSTEM_BACKUP_INDEXED_DB_KEYS,
  SYSTEM_BACKUP_CONTENT_ENTRY_KEYS,
} from "../src/features/settings/systemBackup";
import { readingAssetDb } from "../src/core/storage/readingAssetDb";
import { characterPhoneDb } from "../src/core/storage/characterPhoneDb";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
} as Storage;
Object.assign(globalThis, { indexedDB, window: { localStorage: storage } });

const identityA = { id: "identity-synthetic-a", name: "Synthetic A" };
const identityB = { id: "identity-synthetic-b", name: "Synthetic B" };
const characterA = { id: "character-synthetic-a", ownerIdentityId: identityA.id, name: "Character A" };
const characterB = { id: "character-synthetic-b", ownerIdentityId: identityB.id, name: "Character B" };
const relationA = { id: "relation-synthetic-a", userIdentityId: identityA.id, characterId: characterA.id, conversationId: "conversation-synthetic-a" };
const relationB = { id: "relation-synthetic-b", userIdentityId: identityB.id, characterId: characterB.id, conversationId: "conversation-synthetic-b" };
const messages = [
  { id: "message-synthetic-a", conversationId: relationA.conversationId, characterId: characterA.id, sender: "user", content: "synthetic message A" },
  { id: "message-synthetic-b", conversationId: relationB.conversationId, characterId: characterB.id, sender: "character", content: "synthetic reply B" },
];
const moments = [{ id: "moment-synthetic-a", characterId: characterA.id, authorIdentityId: identityA.id, content: "synthetic moment" }];
const phone = {
  id: "phone-synthetic-a",
  ownerIdentityId: identityA.id,
  characterId: characterA.id,
  passcode: "0000",
  failedAttempts: 0,
  createdAt: 1,
  updatedAt: 1,
  wallpaper: "white",
  appOrder: ["chat"],
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
  galleryItems: [],
  activities: [],
};

await readingAssetDb.saveMetadataValue("character-archive-v4", [characterA, characterB]);
await readingAssetDb.saveMetadataValue("moments-v4", moments);
await readingAssetDb.saveMetadataValue("messages-v4", messages);
await characterPhoneDb.replaceAll([phone as never]);

const localFixture: Record<string, unknown> = {
  phone_settings: { themeMode: "dark", selectedModel: "synthetic-model" },
  phone_character_relationships: [relationA, relationB],
  phone_memory_vault_items: [{ id: "legacy-memory-a", characterId: characterA.id, content: "legacy memory" }],
  phone_character_knowledge_claims: [{ id: "truth-a", characterId: characterA.id, kind: "fact", content: "canonical truth" }],
  phone_conversation_summaries: [{ id: "summary-a", conversationId: relationA.conversationId, summary: "synthetic summary" }],
  phone_diary_entries: [{ id: "diary-a", ownerIdentityId: identityA.id, authorType: "user", body: "synthetic diary" }],
  phone_offline_stories: [{ id: "offline-a", ownerIdentityId: identityA.id, title: "synthetic offline" }],
  phone_moments_v3: moments,
  phone_forum_threads: [{ id: "forum-a", title: "synthetic forum" }],
  phone_character_phones_v1: [phone],
};
for (const [key, value] of Object.entries(localFixture)) values.set(key, JSON.stringify(value));

const backupKeys = Object.keys(localFixture);
const backup = await buildSystemBackup(storage, backupKeys);
assert.equal(backup.format, "fanfanji-system-backup");
assert.equal(backup.version, 3);
assert.equal(typeof backup.checksum, "string");
assert.deepEqual(backup.indexedDb["character-archive-v4"], [characterA, characterB]);
assert.deepEqual(backup.indexedDb["moments-v4"], moments);
assert.deepEqual(backup.indexedDb["messages-v4"], messages);
assert.deepEqual(backup.indexedDb["character-phone-v1"], [phone]);
assert.equal(backup.localStorage.phone_memory_vault_items, JSON.stringify(localFixture.phone_memory_vault_items));
assert.equal(backup.localStorage.phone_character_knowledge_claims, JSON.stringify(localFixture.phone_character_knowledge_claims));
assert.equal(backup.localStorage.phone_conversation_summaries, JSON.stringify(localFixture.phone_conversation_summaries));
assert.equal(backup.localStorage.phone_diary_entries, JSON.stringify(localFixture.phone_diary_entries));

const parsed = parseSystemBackup(backup);
assert.equal(parsed.legacy, false);
assert.equal(parsed.integrityWarning, undefined);

// A clean isolated target can restore every canonical module and then reload
// each repository. The inventory comparison intentionally checks IDs and
// ownership rather than private message text.
const preImportSnapshot = await snapshotSystemBackupIndexedDb();
const preImportCharacters = preImportSnapshot["character-archive-v4"];
await restoreSystemBackupIndexedDb(parsed.indexedDb);
assert.deepEqual(await readingAssetDb.loadMetadataValue("character-archive-v4"), [characterA, characterB]);
assert.deepEqual(await readingAssetDb.loadMetadataValue("messages-v4"), messages);
assert.deepEqual(await characterPhoneDb.loadAll(), [phone]);
assert.equal((await readingAssetDb.loadMetadataValue<typeof moments>("moments-v4"))?.[0]?.characterId, characterA.id);
for (const [key, value] of filterSystemBackupLocalStorageForRestore(Object.entries(parsed.localStorage), parsed.indexedDb)) {
  if (value !== null) values.set(key, value);
}
assert.equal(JSON.parse(values.get("phone_character_relationships") || "[]").length, 2);
assert.equal(JSON.parse(values.get("phone_memory_vault_items") || "[]")[0].characterId, characterA.id);
assert.equal(JSON.parse(values.get("phone_character_knowledge_claims") || "[]")[0].characterId, characterA.id);
assert.equal(JSON.parse(values.get("phone_conversation_summaries") || "[]")[0].conversationId, relationA.conversationId);

// Reload/restart simulation: repository reads after the restore must expose
// the same canonical IDs, with no second copy or cross-character leakage.
const reloadedCharacters = await readingAssetDb.loadMetadataValue<typeof characterA[]>("character-archive-v4");
assert.deepEqual(reloadedCharacters?.map((entry) => entry.id), [characterA.id, characterB.id]);
assert.equal(new Set(reloadedCharacters?.map((entry) => entry.ownerIdentityId)).size, 2);

// Restore the pre-import state as the documented recovery point.
await restoreSystemBackupIndexedDb(preImportSnapshot);
assert.deepEqual(await readingAssetDb.loadMetadataValue("character-archive-v4"), preImportCharacters);

// Legacy v2/flat backup migration preserves the canonical character/message
// IDs through the existing parser and content-entry bridge.
const legacy = parseSystemBackup({
  phone_characters_v3: JSON.stringify([characterA, characterB]),
  phone_messages_v3: JSON.stringify(messages),
  phone_memory_vault_items: JSON.stringify(localFixture.phone_memory_vault_items),
  phone_character_knowledge_claims: JSON.stringify(localFixture.phone_character_knowledge_claims),
});
assert.equal(legacy.legacy, true);
assert.deepEqual(legacy.indexedDb["character-archive-v4"], [characterA, characterB]);
assert.deepEqual(legacy.indexedDb["message-entry-v1"], messages);
assert.deepEqual(
  filterSystemBackupLocalStorageForRestore(Object.entries(legacy.localStorage), legacy.indexedDb),
  Object.entries(legacy.localStorage).filter(([key]) => key !== "phone_messages_v3"),
);

assert.deepEqual(SYSTEM_BACKUP_CONTENT_ENTRY_KEYS, ["message-entry-v1", "offline-story-entry-v1"]);
assert.ok(SYSTEM_BACKUP_INDEXED_DB_KEYS.includes("character-archive-v4"));
console.log("PASS Early Baseline synthetic backup fixture: populated export, isolated restore/reload inventory, legacy migration, and recovery point");
