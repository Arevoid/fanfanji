import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { createFixedMigrationDataset, FIXED_MIGRATION_LARGE_STORY_MESSAGE_COUNT, FIXED_MIGRATION_MESSAGE_COUNT, FIXED_MIGRATION_MIN_SERIALIZED_BYTES, FIXED_MIGRATION_NEAR_QUOTA_PAYLOAD_BYTES } from "./fixtures/fixedMigrationDataset";
import { migrateContentStorage } from "../src/core/storage/contentStorageMigration";
import { isMessageEntryStoreEnabled, isOfflineStoryEntryStoreEnabled } from "../src/core/storage/contentStorageFlags";
import { messageEntryDb } from "../src/core/storage/messageEntryDb";
import { offlineStoryEntryDb } from "../src/core/storage/offlineStoryEntryDb";
import { buildSystemBackup, inspectSystemBackup } from "../src/features/settings/systemBackup";

const dataset = createFixedMigrationDataset();
const values = new Map<string, string>();
const localStorage = {
  get length() { return values.size; },
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
};
Object.assign(globalThis, { indexedDB, localStorage, window: { localStorage } });
Object.defineProperty(globalThis, "navigator", { value: { storage: { estimate: async () => ({ usage: 100, quota: 10_000_000 }) } }, configurable: true });

const messageIds = new Set(dataset.messages.map((message) => message.id));
assert.equal(messageIds.size, FIXED_MIGRATION_MESSAGE_COUNT);
assert.equal(new Set(dataset.stories.map((story) => story.id)).size, dataset.stories.length);
assert.ok(dataset.messages.some((message) => message.relationId === undefined), "fixture includes group messages");
assert.equal(dataset.identities.length, 3);
assert.equal(dataset.emptyCollections.messages.length, 0, "fixture includes empty data");
assert.equal(dataset.largeOfflineStory.messages.length, FIXED_MIGRATION_LARGE_STORY_MESSAGE_COUNT, "fixture includes a large offline story");
assert.equal(dataset.stickerGroups[0].stickers[0].url, "sticker://fixed-sticker-1", "fixture includes a sticker reference");
assert.equal(dataset.nearQuotaPayload.length, FIXED_MIGRATION_NEAR_QUOTA_PAYLOAD_BYTES, "fixture includes a near-quota payload");
assert.ok(JSON.stringify(dataset.messages).length > FIXED_MIGRATION_MIN_SERIALIZED_BYTES);
assert.equal(new Set(dataset.duplicateMessages.map((message) => message.id)).size, 1);
assert.equal(dataset.missingReferenceMessages[0].relationId, "relation-does-not-exist");

values.set("phone_messages_v3", JSON.stringify(dataset.messages));
values.set("phone_offline_stories", JSON.stringify(dataset.stories));
const report = await migrateContentStorage();
assert.equal(report.messageCount, FIXED_MIGRATION_MESSAGE_COUNT);
assert.equal(report.offlineStoryCount, dataset.stories.length);
assert.equal(isMessageEntryStoreEnabled(), true);
assert.equal(isOfflineStoryEntryStoreEnabled(), true);
assert.deepEqual((await messageEntryDb.loadAll()).map((message) => message.id), dataset.messages.map((message) => message.id));
assert.deepEqual((await offlineStoryEntryDb.loadAll()).map((story) => story.id), dataset.stories.map((story) => story.id));

const backup = await buildSystemBackup(localStorage as Storage, ["phone_messages_v3", "phone_offline_stories"]);
assert.equal((backup.indexedDb["message-entry-v1"] as unknown[]).length, FIXED_MIGRATION_MESSAGE_COUNT);
assert.equal((backup.indexedDb["offline-story-entry-v1"] as unknown[]).length, dataset.stories.length);
assert.equal(inspectSystemBackup(backup).valid, true);
assert.equal(inspectSystemBackup(dataset.malformedBackup).valid, false);

console.log("PASS fixed migration dataset covers empty data, identities, direct/group chat, large stories, 1000 messages, media/sticker references, near-quota payloads, corruption and reference anomalies");
