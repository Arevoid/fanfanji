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

const { readingAssetDb } = await import("../src/core/storage/readingAssetDb");
const oldCharacters = [{ id: "old", name: "旧档案", avatar: "", personality: "旧的半截内容", backstory: "" }];
await readingAssetDb.saveMetadataValue("character-archive-v4", oldCharacters);

let releaseRead!: (value: typeof oldCharacters) => void;
const delayedRead = new Promise<typeof oldCharacters>((resolve) => { releaseRead = resolve; });
const originalLoad = readingAssetDb.loadMetadataValue.bind(readingAssetDb);
readingAssetDb.loadMetadataValue = async () => delayedRead as never;

const repository = await import("../src/core/storage/repositories/characterRepository");
const initialization = repository.initializeCharacterRepository([]);
const fullText = "完整内容".repeat(10_000);
const importedCharacters = [{ id: "new", name: "新档案", avatar: "", personality: fullText, backstory: "" }];
repository.saveCharacters(importedCharacters);
releaseRead(oldCharacters);

const initialized = await initialization;
assert.equal(initialized.value[0]?.id, "new", "slow initialization must not overwrite a newer import");
assert.equal((await repository.flushCharacters()).success, true);
readingAssetDb.loadMetadataValue = originalLoad;
const stored = await readingAssetDb.loadMetadataValue<typeof importedCharacters>("character-archive-v4");
assert.equal(stored?.[0]?.personality, fullText);
console.log("PASS an in-flight archive initialization cannot overwrite a newer full import");
