import assert from "node:assert/strict";
import { loadMoments, saveMoments } from "../src/core/storage/repositories/momentRepository";
import type { Moment } from "../src/types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });

const moment: Moment = {
  id: "moment-repository-a",
  ownerIdentityId: "identity-a",
  authorName: "饭饭",
  authorAvatar: "🙂",
  content: "本地快照可以恢复。",
  timestamp: 10,
  likes: [],
  comments: [],
};

assert.equal(saveMoments([moment]).success, true);
assert.deepEqual(loadMoments([]).value, [moment]);
assert.equal(saveMoments([]).success, true);
assert.deepEqual(loadMoments([]).value, []);

console.log("moment repository persistence fallback tests passed");
