import assert from "node:assert/strict";
import { deleteSelectedUserAppData, getUserDataAppUsage } from "../src/features/settings/userDataDeletion";

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
storage.setItem("phone_memo_notes", JSON.stringify([{ id: "note-1" }]));
storage.setItem("phone_memo_todos", JSON.stringify([{ id: "todo-1" }]));
storage.setItem("phone_messages_v3", JSON.stringify([{ id: "message-1" }]));
storage.setItem("phone_forum_threads", JSON.stringify([{ id: "thread-1" }]));
(globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: storage };

const before = getUserDataAppUsage();
assert.ok((before.find((entry) => entry.appId === "notes")?.bytes || 0) > 0);

const result = await deleteSelectedUserAppData(["notes"]);
assert.deepEqual(result.apps, ["notes"]);
assert.equal(storage.getItem("phone_memo_notes"), null);
assert.equal(storage.getItem("phone_memo_todos"), null);
assert.notEqual(storage.getItem("phone_messages_v3"), null, "unselected chat data must remain");
assert.notEqual(storage.getItem("phone_forum_threads"), null, "unselected forum data must remain");

await deleteSelectedUserAppData(["forum"]);
assert.equal(storage.getItem("phone_forum_threads"), null);
assert.notEqual(storage.getItem("phone_messages_v3"), null);

console.log("user data deletion tests passed");
