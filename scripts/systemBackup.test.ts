import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import {
  buildSystemBackup,
  checksumPayload,
  filterSystemBackupLocalStorageForRestore,
  normalizeSystemBackupIndexedDb,
  parseSystemBackup,
  restoreSystemBackupIndexedDb,
  snapshotSystemBackupIndexedDb,
  splitSystemBackupJson,
  SystemBackupRestoreError,
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

const characters = [{ id: "character-a", name: "角色 A" }];
const moments = [{ id: "moment-a", content: "朋友圈内容" }];
const legacyMoment = { id: "legacy-moment", content: "仅在旧本地副本中的动态" };
const mergedMoments = [...moments, legacyMoment];
const innerVoices = [{
  id: "voice-backup", characterId: "character-a", relationId: "relation-a", userIdentityId: "identity-a",
  conversationId: "direct:relation-a", messageId: "message-a", triggerMessageSummary: "给旧数据迁移",
  state: "calm", content: "备份中的私密心声", createdAt: 1,
}];
await readingAssetDb.saveMetadataValue("character-archive-v4", characters);
await readingAssetDb.saveMetadataValue("moments-v4", moments);
values.set("phone_moments_v3", JSON.stringify([legacyMoment]));
const backupPhone = {
  id: "phone-backup-test",
  ownerIdentityId: "identity-backup-test",
  characterId: "character-a",
  passcode: "8952",
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
await characterPhoneDb.replaceAll([backupPhone as never]);
values.set("phone_worldbook_entries", JSON.stringify([{ id: "world-a" }]));
values.set("phone_inner_voice_records", JSON.stringify(innerVoices));
values.set("phone_characters_v3", JSON.stringify([{ id: "legacy-character" }]));
values.set("phone_reading_analysis_store_v1", JSON.stringify({ version: 1, tasks: [] }));

const backup = await buildSystemBackup(storage, ["phone_characters_v3", "phone_worldbook_entries", "phone_inner_voice_records", "phone_moments_v3"]);
assert.deepEqual(backup.indexedDb["character-archive-v4"], characters);
assert.deepEqual(backup.indexedDb["moments-v4"], mergedMoments, "backup consolidates divergent local and IndexedDB Moment copies");
assert.equal(backup.localStorage.phone_moments_v3, null, "merged Moments are exported once through IndexedDB");
assert.deepEqual(backup.indexedDb["character-phone-v1"], [backupPhone]);
assert.equal((backup.indexedDb["inner-voice-v1"] as typeof innerVoices)[0]?.content, innerVoices[0].content);
assert.ok((backup.indexedDb["inner-voice-v1"] as Array<{ storageScopeKey?: string }>)[0]?.storageScopeKey);
assert.equal(backup.localStorage.phone_inner_voice_records, null, "migrated heart voices are backed up only from IndexedDB");
assert.equal(backup.localStorage.phone_worldbook_entries, JSON.stringify([{ id: "world-a" }]));
assert.equal(backup.localStorage.phone_characters_v3, JSON.stringify([{ id: "legacy-character" }]), "legacy local data is retained when an IDB export is unavailable");
assert.equal(backup.localStorage.phone_reading_analysis_store_v1, undefined, "only requested local keys are exported");

const fullBackup = await buildSystemBackup(storage, ["phone_reading_analysis_store_v1"]);
assert.equal(fullBackup.localStorage.phone_reading_analysis_store_v1, JSON.stringify({ version: 1, tasks: [] }));
await assert.rejects(
  buildSystemBackup(storage, [], [["聊天记录", async () => ({ success: false, error: "write" })]]),
  /备份已取消.*聊天记录/,
  "backup export must stop when a repository reports that its pending snapshot was not flushed",
);

assert.deepEqual(
  filterSystemBackupLocalStorageForRestore([
    ["phone_messages_v3", "large-chat"],
    ["phone_inner_voice_records", "legacy-voices"],
    ["phone_moments_v3", "large-moments"],
    ["phone_offline_stories", "large-offline"],
    ["phone_settings", "settings"],
  ], { "message-entry-v1": [], "offline-story-entry-v1": [], "inner-voice-v1": [], "moments-v4": [] }),
  [["phone_settings", "settings"]],
  "durable backups must not recreate large LocalStorage content copies",
);
assert.deepEqual(
  filterSystemBackupLocalStorageForRestore([
    ["phone_messages_v3", "legacy-chat"],
    ["phone_offline_stories", "legacy-offline"],
    ["phone_settings", "settings"],
  ], {}),
  [["phone_messages_v3", "legacy-chat"], ["phone_settings", "settings"]],
  "legacy chat remains restorable when an entry-store payload is absent",
);
const originalPrototype = Object.prototype as { polluted?: boolean };
delete originalPrototype.polluted;
const hostileBackup = parseSystemBackup(JSON.parse(`{"format":"fanfanji-system-backup","version":3,"exportedAt":1,"localStorage":{"__proto__":"{\\"polluted\\":true}","phone_settings":"{\\"theme\\":\\"dark\\"}"},"indexedDb":{"__proto__":{"polluted":true},"unknown-module":[{"id":"ignored"}]}}`));
assert.equal((Object.prototype as { polluted?: boolean }).polluted, undefined, "hostile JSON must not pollute Object.prototype");
assert.equal(Object.prototype.hasOwnProperty.call(hostileBackup.localStorage, "__proto__"), true, "JSON keys remain data until the allowlist filters them");
assert.deepEqual(
  filterSystemBackupLocalStorageForRestore(Object.entries(hostileBackup.localStorage), {})
    .filter(([key]) => new Set(["phone_settings"]).has(key)),
  [["phone_settings", JSON.stringify({ theme: "dark" })]],
  "restore only accepts explicitly allowlisted localStorage keys",
);

const parsed = parseSystemBackup(backup);
assert.equal(parsed.legacy, false);
assert.deepEqual(parsed.indexedDb["moments-v4"], mergedMoments);
assert.equal(parsed.localStorage.phone_moments_v3, null);
assert.equal(typeof backup.checksum, "string");
const sanitizedPayload = {
  ...backup,
  localStorage: { ...backup.localStorage, phone_worldbook_entries: "sanitized" },
};
const resignedSanitizedBackup = { ...sanitizedPayload, checksum: checksumPayload(sanitizedPayload) };
assert.equal(parseSystemBackup(resignedSanitizedBackup).integrityWarning, undefined, "re-signing an envelope that still has its old checksum must verify");
const tamperedBackup = parseSystemBackup({ ...backup, localStorage: { ...backup.localStorage, phone_worldbook_entries: "changed" } });
assert.match(tamperedBackup.integrityWarning || "", /校验值不一致/);
const envelopedLegacyVoices = parseSystemBackup({
  format: "fanfanji-system-backup", version: 3, exportedAt: 1,
  localStorage: { phone_inner_voice_records: JSON.stringify(innerVoices) }, indexedDb: {},
});
assert.deepEqual(envelopedLegacyVoices.indexedDb["inner-voice-v1"], innerVoices, "older enveloped backups migrate localStorage voices into the IndexedDB restore channel");
assert.deepEqual(
  filterSystemBackupLocalStorageForRestore(Object.entries(envelopedLegacyVoices.localStorage), envelopedLegacyVoices.indexedDb),
  [],
  "restoring migrated voice records must not duplicate them in localStorage",
);

const migratedModuleNames = normalizeSystemBackupIndexedDb({
  "inner-voice-records-v1": innerVoices,
  "user-settings-durable-overlay-v1": { version: 1, wallpaper: "" },
});
assert.deepEqual(migratedModuleNames["inner-voice-v1"], innerVoices, "durable inner-voice module aliases migrate to the release key");
assert.equal(migratedModuleNames["inner-voice-records-v1"], undefined, "migrated inner-voice aliases are not reported as unknown modules");
assert.deepEqual(migratedModuleNames["user-settings-durable-overlay-v1"], { version: 1, wallpaper: "" });
const restoreError = new SystemBackupRestoreError("restore failed", ["messages-v4: write failed"]);
assert.deepEqual(restoreError.rollbackErrors, ["messages-v4: write failed"]);
const serializedBackup = "备份内容".repeat(20);
assert.equal(splitSystemBackupJson(serializedBackup, 7).join(""), serializedBackup);
assert.throws(() => splitSystemBackupJson(serializedBackup, 0), /分块大小无效/);

const legacy = parseSystemBackup({
  phone_worldbook_entries: JSON.stringify([{ id: "legacy-world" }]),
  phone_characters_v3: JSON.stringify([{ id: "legacy-character" }]),
  phone_messages_v3: JSON.stringify([{ id: "legacy-message", content: "旧版聊天" }]),
  phone_inner_voice_records: JSON.stringify(innerVoices),
});
assert.equal(legacy.legacy, true);
assert.deepEqual(legacy.indexedDb["character-archive-v4"], [{ id: "legacy-character" }]);
assert.deepEqual(legacy.indexedDb["message-entry-v1"], [{ id: "legacy-message", content: "旧版聊天" }]);
assert.deepEqual(legacy.indexedDb["inner-voice-v1"], innerVoices);
assert.deepEqual(
  filterSystemBackupLocalStorageForRestore(Object.entries(legacy.localStorage), legacy.indexedDb),
  [
    ["phone_worldbook_entries", JSON.stringify([{ id: "legacy-world" }])],
      ["phone_characters_v3", JSON.stringify([{ id: "legacy-character" }])],
  ],
  "legacy chat is restored to the durable entry store instead of remaining only in LocalStorage",
);

await restoreSystemBackupIndexedDb({ "character-archive-v4": [{ id: "restored-character" }] });
assert.deepEqual(await readingAssetDb.loadMetadataValue("character-archive-v4"), [{ id: "restored-character" }]);
await restoreSystemBackupIndexedDb({ "character-phone-v1": [backupPhone] });
assert.deepEqual(await characterPhoneDb.loadAll(), [backupPhone]);
const migratedModuleRestore = await restoreSystemBackupIndexedDb({
  "inner-voice-records-v1": innerVoices,
  "user-settings-durable-overlay-v1": { version: 1, wallpaper: "" },
});
assert.deepEqual(migratedModuleRestore.skippedKeys, [], "known durable migration module names are restored instead of skipped");
assert.ok(migratedModuleRestore.restoredKeys.includes("inner-voice-v1"));
assert.deepEqual(await readingAssetDb.loadMetadataValue("user-settings-durable-overlay-v1"), { version: 1, wallpaper: "" });

const indexedDbSnapshot = await snapshotSystemBackupIndexedDb();
assert.equal(indexedDbSnapshot["messages-v4"], null);
assert.equal(indexedDbSnapshot["offline-story-entry-v1"], null);
await restoreSystemBackupIndexedDb({ "message-entry-v1": [{ id: "temporary-message" }] });
assert.equal(await readingAssetDb.loadMetadataValue("messages-v4"), null);
await restoreSystemBackupIndexedDb(indexedDbSnapshot);
assert.equal(await readingAssetDb.loadMetadataValue("messages-v4"), null);

const originalSaveMetadataValue = readingAssetDb.saveMetadataValue.bind(readingAssetDb);
let saveCount = 0;
readingAssetDb.saveMetadataValue = (async (key: string, value: unknown) => {
  saveCount += 1;
  if (saveCount === 2) throw new Error("simulated IndexedDB write failure");
  return originalSaveMetadataValue(key, value);
}) as typeof readingAssetDb.saveMetadataValue;
await assert.rejects(
  restoreSystemBackupIndexedDb({
    "character-archive-v4": [{ id: "should-rollback" }],
    "moments-v4": [{ id: "second-write" }],
  }),
  /simulated IndexedDB write failure/,
);
readingAssetDb.saveMetadataValue = originalSaveMetadataValue;
assert.deepEqual(await readingAssetDb.loadMetadataValue("character-archive-v4"), [{ id: "restored-character" }]);
assert.deepEqual(await readingAssetDb.loadMetadataValue("moments-v4"), moments);

console.log("PASS system backup round-trip includes IndexedDB metadata and legacy flat backups");
