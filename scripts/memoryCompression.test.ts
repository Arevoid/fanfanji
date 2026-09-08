import assert from "node:assert/strict";
import { compressMemoriesForStorage, MEMORY_COMPRESSION_PREFIX } from "../src/core/storage/memoryCompression";
import { compressStoredMemories, loadMemories, saveMemories } from "../src/core/storage/repositories/memoryRepository";
import { storageKeys } from "../src/core/storage/storageKeys";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const storage = new MemoryStorage();
Object.assign(globalThis, { window: { localStorage: storage } });
const now = Date.now();
const oldContent = "这是一个较久以前生成的记忆。".repeat(80);
const memories = [
  { id: "old-generated", characterId: "character-a", relationId: "relation-a", content: oldContent, timestamp: now - 60 * 24 * 60 * 60 * 1000, importance: 5 },
  { id: "manual", characterId: "character-a", relationId: "relation-a", content: oldContent, timestamp: now - 60 * 24 * 60 * 60 * 1000, importance: 5, isManual: true },
  { id: "recent", characterId: "character-a", relationId: "relation-a", content: oldContent, timestamp: now, importance: 5 },
] as const;

const prepared = compressMemoriesForStorage(memories, now);
assert.equal(prepared.result.compressed, 1);
assert.ok(prepared.records.find((memory) => memory.id === "old-generated")?.content.startsWith(MEMORY_COMPRESSION_PREFIX));
assert.equal(prepared.records.find((memory) => memory.id === "manual")?.content, oldContent);

assert.equal(saveMemories([...memories]).success, true);
const raw = JSON.parse(storage.getItem(storageKeys.memoryVaultItems) || "[]") as Array<{ id: string; content: string }>;
assert.ok(raw.find((memory) => memory.id === "old-generated")?.content.startsWith(MEMORY_COMPRESSION_PREFIX));
assert.equal(loadMemories([]).value.find((memory) => memory.id === "old-generated")?.content, oldContent);

const explicit = compressStoredMemories(now);
assert.equal(explicit.result.compressed, 0, "already compressed records must not be repeatedly rewritten");

console.log("memory compression safety tests passed");
