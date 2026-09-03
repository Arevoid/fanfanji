import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  clear: () => values.clear(),
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
Object.assign(globalThis, { indexedDB, window: { localStorage } });

const legacy = [{ id: "legacy", name: "旧角色", avatar: "", personality: "旧内容", backstory: "" }];
values.set("phone_characters_v3", JSON.stringify(legacy));
const repository = await import("../src/core/storage/repositories/characterRepository");
const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");
const initialized = await repository.initializeCharacterRepository([]);
assert.deepEqual(initialized.value, legacy);
assert.equal(values.has("phone_characters_v3"), false, "legacy localStorage data should be removed after migration");

const completeText = "完整正文".repeat(500_000);
const characters = [{ id: "large", name: "长档案", avatar: "", personality: completeText, backstory: "" }];
assert.equal(repository.saveCharacters(characters).success, true);
assert.equal((await repository.flushCharacters()).success, true);
const stored = await readingAssetDb.loadMetadataValue<typeof characters>("character-archive-v4");
assert.equal(stored?.[0]?.personality.length, completeText.length);
console.log("PASS large character archives persist in IndexedDB without localStorage quota loss");
