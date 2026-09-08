import assert from "node:assert/strict";
import { clearRebuildableCache, getRebuildableCacheUsage, REBUILDABLE_CACHE_PREFIX } from "../src/core/storage/rebuildableCache";
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

storage.setItem(storageKeys.messages, JSON.stringify([{ id: "formal-message" }]));
storage.setItem(storageKeys.diaryEntries, JSON.stringify([{ id: "formal-diary" }]));
storage.setItem(storageKeys.diaryTranslations, JSON.stringify([{ id: "translation-cache" }]));
storage.setItem(`${REBUILDABLE_CACHE_PREFIX}user:global:diary:one`, "temporary diary cache");

const diaryResult = await clearRebuildableCache({ scope: "user", target: "diary" });
assert.ok(diaryResult.removedLocalStorageKeys.includes(storageKeys.diaryTranslations));
assert.equal(storage.getItem(`${REBUILDABLE_CACHE_PREFIX}user:global:diary:one`), null);
assert.notEqual(storage.getItem(storageKeys.messages), null, "formal chat data must remain");
assert.notEqual(storage.getItem(storageKeys.diaryEntries), null, "formal diary data must remain");

storage.setItem(`${REBUILDABLE_CACHE_PREFIX}characterPhone:character-a:chat:one`, "chat cache");
storage.setItem(`${REBUILDABLE_CACHE_PREFIX}characterPhone:character-b:chat:one`, "other character cache");
await clearRebuildableCache({ scope: "characterPhone", scopeId: "character-a", target: "chat" });
assert.equal(storage.getItem(`${REBUILDABLE_CACHE_PREFIX}characterPhone:character-a:chat:one`), null);
assert.equal(storage.getItem(`${REBUILDABLE_CACHE_PREFIX}characterPhone:character-b:chat:one`), "other character cache");

storage.setItem(`${REBUILDABLE_CACHE_PREFIX}characterPhone:character-a:browser:one`, "browser cache");
const usage = getRebuildableCacheUsage({ scope: "characterPhone", scopeId: "character-a", targets: ["chat", "browser", "all"] });
assert.equal(usage.find((entry) => entry.target === "chat")?.bytes, 0);
assert.ok((usage.find((entry) => entry.target === "browser")?.bytes || 0) > 0);
assert.ok((usage.find((entry) => entry.target === "all")?.bytes || 0) > 0);
await clearRebuildableCache({ scope: "characterPhone", scopeId: "character-a", target: "all" });
assert.equal(storage.getItem(`${REBUILDABLE_CACHE_PREFIX}characterPhone:character-a:browser:one`), null);

console.log("rebuildable cache cleanup tests passed");
