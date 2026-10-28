import assert from "node:assert/strict";
import { checksumPayload, iterateSystemBackupJson, SYSTEM_BACKUP_FORMAT, SYSTEM_BACKUP_VERSION, SYSTEM_BACKUP_JSON_CHUNK_SIZE, parseSystemBackup } from "../src/features/settings/systemBackup";

for (const length of [0, 65534, 65535, 65536, 262100, 262143, 262144, 1048576]) {
  const value = { format: SYSTEM_BACKUP_FORMAT, version: SYSTEM_BACKUP_VERSION, exportedAt: 1700000000000,
    localStorage: { phone_conversation_summaries: JSON.stringify([{ id: "a", text: "a".repeat(length) + '😀中文\n"\\\t' + "😀".repeat(400) }]) },
    indexedDb: { "acceptance": [{ id: "b", empty: null, list: [1, "two", true] }] } };
  const oldSerialized = JSON.stringify(value);
  let oldHash = 2166136261;
  for (let i = 0; i < oldSerialized.length; i++) { oldHash ^= oldSerialized.charCodeAt(i); oldHash = Math.imul(oldHash, 16777619); }
  const checksum = checksumPayload(value);
  assert.equal(checksum, `fnv1a-${(oldHash >>> 0).toString(16).padStart(8, "0")}`, "checksum remains compatible with existing files");
  const signed = { ...value, checksum };
  const parts = [...iterateSystemBackupJson(signed)];
  assert.ok(parts.every(part => part.length <= SYSTEM_BACKUP_JSON_CHUNK_SIZE));
  assert.equal(parts.join(""), JSON.stringify(signed));
  const blobText = await new Blob(parts).text();
  assert.deepEqual(JSON.parse(blobText), signed, "Blob part boundaries must preserve emoji and escapes");
  assert.equal(parseSystemBackup(JSON.parse(blobText)).integrityWarning, undefined);
}
console.log("Backup bounded serialization: exact JSON, legacy checksums, Unicode and Blob round-trip passed");
