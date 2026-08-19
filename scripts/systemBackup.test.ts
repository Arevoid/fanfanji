import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import {
  buildSystemBackup,
  parseSystemBackup,
  restoreSystemBackupIndexedDb,
} from "../src/features/settings/systemBackup";
import { readingAssetDb } from "../src/core/storage/readingAssetDb";

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
await readingAssetDb.saveMetadataValue("character-archive-v4", characters);
await readingAssetDb.saveMetadataValue("moments-v4", moments);
values.set("phone_worldbook_entries", JSON.stringify([{ id: "world-a" }]));
values.set("phone_characters_v3", JSON.stringify([{ id: "legacy-character" }]));
values.set("phone_reading_analysis_store_v1", JSON.stringify({ version: 1, tasks: [] }));

const backup = await buildSystemBackup(storage, ["phone_characters_v3", "phone_worldbook_entries"]);
assert.deepEqual(backup.indexedDb["character-archive-v4"], characters);
assert.deepEqual(backup.indexedDb["moments-v4"], moments);
assert.equal(backup.localStorage.phone_worldbook_entries, JSON.stringify([{ id: "world-a" }]));
assert.equal(backup.localStorage.phone_characters_v3, JSON.stringify([{ id: "legacy-character" }]), "legacy local data is retained when an IDB export is unavailable");
assert.equal(backup.localStorage.phone_reading_analysis_store_v1, undefined, "only requested local keys are exported");

const fullBackup = await buildSystemBackup(storage, ["phone_reading_analysis_store_v1"]);
assert.equal(fullBackup.localStorage.phone_reading_analysis_store_v1, JSON.stringify({ version: 1, tasks: [] }));

const parsed = parseSystemBackup(backup);
assert.equal(parsed.legacy, false);
assert.deepEqual(parsed.indexedDb["moments-v4"], moments);
assert.equal(typeof backup.checksum, "string");
assert.throws(() => parseSystemBackup({ ...backup, localStorage: { ...backup.localStorage, phone_worldbook_entries: "changed" } }), /校验失败/);

const legacy = parseSystemBackup({
  phone_worldbook_entries: JSON.stringify([{ id: "legacy-world" }]),
  phone_characters_v3: JSON.stringify([{ id: "legacy-character" }]),
});
assert.equal(legacy.legacy, true);
assert.deepEqual(legacy.indexedDb["character-archive-v4"], [{ id: "legacy-character" }]);

await restoreSystemBackupIndexedDb({ "character-archive-v4": [{ id: "restored-character" }] });
assert.deepEqual(await readingAssetDb.loadMetadataValue("character-archive-v4"), [{ id: "restored-character" }]);

console.log("PASS system backup round-trip includes IndexedDB metadata and legacy flat backups");
