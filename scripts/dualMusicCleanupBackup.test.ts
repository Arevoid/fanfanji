import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { removeMusicTrackReferences } from "../src/core/storage/repositories/musicWidgetRepository";
import { buildDesktopModuleBackup } from "../src/features/home/desktopModuleBackup";

const cleaned = removeMusicTrackReferences(
  [{ ownerIdentityId: "identity", currentTrackId: "song", recentTrackIds: ["song", "keep"], updatedAt: 1 }],
  [{ relationId: "rel", conversationId: "direct:rel", characterId: "char", currentTrackId: "song", recentTrackIds: ["song", "keep"], updatedAt: 1 }],
  "song",
);
assert.equal(cleaned.identityStates[0].currentTrackId, undefined);
assert.deepEqual(cleaned.identityStates[0].recentTrackIds, ["keep"]);
assert.equal(cleaned.relationshipStates[0].currentTrackId, undefined);

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] || null; }
  getItem(key: string) { return this.values.get(key) || null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const storage = new MemoryStorage();
storage.setItem("phone_dual_music_widget_configs", "[]");
storage.setItem("phone_identity_music_states", "[]");
storage.setItem("phone_relationship_music_states", "[]");
const backup = buildDesktopModuleBackup({} as any, storage);
assert.deepEqual(Object.keys(backup.storage).sort(), [
  "phone_dual_music_widget_configs",
  "phone_identity_music_states",
  "phone_relationship_music_states",
]);
const settingsSource = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
assert.match(settingsSource, /"phone_dual_music_widget_configs"/);
assert.match(settingsSource, /音频和本地封面二进制不会写入 JSON/);
console.log("dual music cleanup and backup tests passed");
