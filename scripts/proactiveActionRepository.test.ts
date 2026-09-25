import assert from "node:assert/strict";

const values = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
} as Storage;
(globalThis as unknown as { window?: unknown }).window = { localStorage };

const { readJson, remove } = await import("../src/core/storage/storageAdapter");
const { storageKeys } = await import("../src/core/storage/storageKeys");
const { enqueueProactiveAction, listPendingProactiveActions, takePendingProactiveAction } = await import("../src/features/chat/services/proactiveActionRepository");

remove(storageKeys.proactiveActions);
const first = enqueueProactiveAction({
  relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a",
  type: "call", reason: "想听声音", createdAt: 1000,
});
assert.equal(first.id, "proactive-action-relation-a-1000");
assert.equal(listPendingProactiveActions(1000).length, 1);
const replaced = enqueueProactiveAction({
  relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a",
  type: "video_call", reason: "约好视频", createdAt: 1200,
});
assert.equal(listPendingProactiveActions(1200).length, 1, "one relation cannot accumulate duplicate pending calls");
assert.equal(listPendingProactiveActions(1200)[0].id, replaced.id);
const taken = takePendingProactiveAction({ relationId: "relation-a", characterId: "character-a", userIdentityId: "identity-a", now: 1200 });
assert.equal(taken?.type, "video_call");
assert.equal(listPendingProactiveActions(1200).length, 0);

enqueueProactiveAction({ relationId: "relation-old", characterId: "character-a", userIdentityId: "identity-a", type: "call", reason: "过期", createdAt: 0 });
assert.equal(listPendingProactiveActions(24 * 60 * 60 * 1000 + 1).length, 0);
assert.deepEqual(readJson(storageKeys.proactiveActions, []).value, []);
console.log("PASS proactive action relation-scoped queue persistence");
