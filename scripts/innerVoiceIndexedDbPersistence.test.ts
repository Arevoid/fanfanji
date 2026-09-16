import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { InnerVoiceRecord } from "../src/types";

const values = new Map<string, string>();
const localStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(key, value); },
};
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });

const legacy: InnerVoiceRecord[] = [
  {
    id: "legacy-primary", characterId: "character", userIdentityId: "identity-primary", relationId: "relation-primary",
    conversationId: "direct:relation-primary", messageId: "same-message", triggerMessageSummary: "primary",
    state: "calm", content: "primary private thought", createdAt: 1,
  },
  {
    id: "legacy-alias", characterId: "character", userIdentityId: "identity-alias", relationId: "relation-alias",
    conversationId: "direct:relation-alias", messageId: "same-message", triggerMessageSummary: "alias",
    state: "calm", content: "alias private thought", createdAt: 2,
  },
  {
    id: "legacy-group", characterId: "speaker", userIdentityId: "identity-alias", groupId: "group-a",
    conversationId: "group:group-a", messageId: "same-message", triggerMessageSummary: "group",
    state: "calm", content: "group private thought", createdAt: 3,
  },
];
values.set("phone_inner_voice_records", JSON.stringify(legacy));

const repository = await import("../src/core/storage/repositories/innerVoiceRepository");
const initialized = await repository.initializeInnerVoiceRepository([]);
assert.equal(initialized.valid, true);
assert.equal(initialized.value.length, 3);
assert.equal(values.has("phone_inner_voice_records"), false, "legacy localStorage is removed after verified IndexedDB migration");

const isolated = repository.findInnerVoiceByMessage(initialized.value, {
  kind: "direct", relationId: "relation-alias", conversationId: "direct:relation-alias",
  characterId: "character", userIdentityId: "identity-alias", messageId: "same-message",
});
assert.equal(isolated?.id, "legacy-alias", "same role/message IDs stay isolated by the concrete relationship");
assert.equal(repository.findInnerVoiceByMessage(initialized.value, {
  kind: "direct", relationId: "relation-alias", conversationId: "direct:relation-alias",
  characterId: "character", userIdentityId: "identity-primary", messageId: "same-message",
}), undefined, "identity mismatch cannot read an alias-scoped thought");
assert.equal(repository.findInnerVoiceByMessage(initialized.value, {
  kind: "direct", relationId: "relation-alias", conversationId: "direct:relation-alias",
  characterId: "character", userIdentityId: "identity-legacy", messageId: "same-message",
}), undefined, "records with missing legacy identity metadata are not exposed across identity scopes");

const sameRelationDifferentIdentity: InnerVoiceRecord = {
  ...legacy[1], id: "same-relation-primary", userIdentityId: "identity-primary", createdAt: 3,
};
assert.equal((await repository.saveInnerVoiceRecord(sameRelationDifferentIdentity)).success, true);
const sameRelationResults = await repository.loadInnerVoiceRecordsAsync([]);
assert.equal(sameRelationResults.value.length, 4, "direct records remain distinct even if imported relationship IDs collide across identities");
assert.equal(repository.findInnerVoiceByMessage(sameRelationResults.value, {
  kind: "direct", relationId: "relation-alias", conversationId: "direct:relation-alias",
  characterId: "character", userIdentityId: "identity-alias", messageId: "same-message",
})?.id, "legacy-alias");
assert.equal(repository.findInnerVoiceByMessage(sameRelationResults.value, {
  kind: "direct", relationId: "relation-alias", conversationId: "direct:relation-alias",
  characterId: "character", userIdentityId: "identity-primary", messageId: "same-message",
})?.id, "same-relation-primary");

const replacement: InnerVoiceRecord = {
  ...legacy[1], id: "alias-replacement", content: "latest alias thought", createdAt: 4,
};
assert.equal((await repository.saveInnerVoiceRecord(replacement)).success, true);
const afterSave = await repository.loadInnerVoiceRecordsAsync([]);
assert.equal(afterSave.value.length, 4, "upsert replaces only the same identity's exact message scope rather than duplicating it");
assert.equal(repository.findInnerVoiceByMessage(afterSave.value, {
  kind: "direct", relationId: "relation-alias", conversationId: "direct:relation-alias",
  characterId: "character", userIdentityId: "identity-alias", messageId: "same-message",
})?.content, "latest alias thought");

const removed = repository.removeInnerVoicesByRelation(afterSave.value, "relation-alias");
assert.equal((await repository.saveInnerVoiceRecords(removed)).success, true);
assert.equal((await repository.loadInnerVoiceRecordsAsync([])).value.some((record) => record.relationId === "relation-alias"), false);
assert.equal((await repository.loadInnerVoiceRecordsAsync([])).value.some((record) => record.relationId === "relation-primary"), true);

console.log("PASS inner voice IndexedDB migration, persistence and strict identity scoping");
