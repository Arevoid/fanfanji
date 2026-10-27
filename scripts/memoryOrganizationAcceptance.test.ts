import assert from "node:assert/strict";
import { meaningfulMemoryValue } from "./fixtures/memoryValueFixture";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { UserSettings } from "../src/types";
import { acceptOrganizedKnowledge } from "../src/domain/characterKnowledge/knowledgeOrganization";
import { saveKnowledgeClaims, loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { organizeLegacyMemory, readMemoryOrganization } from "../src/features/characterKnowledge/services/memoryOrganizationService";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const base: KnowledgeClaim = { ...scope, id: "old", statement: "以前喜欢咖啡。现在喜欢茶。", kind: "fact", subject: "user", temporalStatus: "unknown",
  truthStatus: "legacy_unverified", confidence: .25, userConfirmed: false, recordedAt: 100, status: "active", visibility: "relation_private", schemaVersion: 1,
  source: { kind: "legacy_memory", authorship: "unknown", producer: "legacy", evidenceKey: "old", sourceRecordId: "old" } };
const items = [{ sourceId: base.id, quote: "以前喜欢咖啡", kind: "preference", temporalStatus: "present", valueAssessment: meaningfulMemoryValue("以前喜欢咖啡") },
  { sourceId: base.id, quote: "现在喜欢茶", kind: "preference", temporalStatus: "present", valueAssessment: meaningfulMemoryValue("现在喜欢茶") },
  { sourceId: base.id, quote: "用户害怕打雷", kind: "fact", temporalStatus: "present" }];
const atoms = acceptOrganizedKnowledge(base, items);
for (const statement of ["用户不喜欢咖啡。", "如果下雨，用户喜欢咖啡。", "朋友说用户喜欢咖啡。", "用户喜欢咖啡但只在周末。"])
  assert.equal(acceptOrganizedKnowledge({ ...base, statement }, [{ sourceId: base.id, quote: "用户喜欢咖啡", kind: "preference", temporalStatus: "present" }]).length, 0,
    "substrings cannot erase negation, conditions or speaker attribution");
assert.equal(atoms.length, 2); assert.equal(atoms[0].temporalStatus, "past");
assert.ok(atoms.every((claim) => claim.truthStatus === "legacy_unverified" && !claim.userConfirmed && claim.relationId === scope.relationId && claim.organizationSourceId === base.id));
assert.equal(acceptOrganizedKnowledge(base, [{ ...items[0], sourceId: "foreign" }]).length, 0);
assert.ok(saveKnowledgeClaims([base, { ...base, id: "foreign", relationId: "other" }]).success);
const settings = { apiKey: "synthetic-key", selectedModel: "synthetic" } as UserSettings;
let requests = 0;
const input = { scope, settings, visible: true, now: 1000, request: async (params: { message: string }) => {
  requests++; assert.doesNotMatch(params.message, /other/);
  const body = JSON.parse(params.message);
  return { text: JSON.stringify({ items: body.stage === "associate" ? body.sources.map((source: { sourceId: string; text: string }) => ({ sourceId: source.sourceId, quote: source.text, association: null, valueAssessment: meaningfulMemoryValue(source.text) })) : items.map(item=>({...item,sourceId:body.sources[0].sourceId})) }) }; } };
assert.equal(await organizeLegacyMemory(input), "limited"); assert.equal(requests, 0, "legacy organization still requires migration consent");
values.set("phone_memory_continuity_migration_v1", JSON.stringify({ version: 1, status: "completed", completed: 1, total: 1, orphanIds: [], consentAt: 1 }));
assert.equal(await organizeLegacyMemory({ ...input, visible: false }), "ineligible");
assert.equal(await organizeLegacyMemory(input), "completed");
const stored = loadKnowledgeClaims().value;
assert.equal(stored.find((claim) => claim.id === base.id)?.statement, base.statement);
assert.ok(stored.find((claim) => claim.id === base.id)?.organizationOriginal);
assert.equal(stored.find((claim) => claim.id === base.id)?.status, "active", "archived originals still allow lookup of information omitted by the organiser");
assert.equal(stored.filter((claim) => claim.organizationSourceId === base.id).length, 2);
assert.equal(stored.find((claim) => claim.id === "foreign")?.supersededById, undefined);
assert.equal(await organizeLegacyMemory(input), "completed"); assert.equal(requests, 2, "a separate semantic association pass follows atomisation");
assert.equal(await organizeLegacyMemory(input), "completed"); assert.equal(requests, 2, "a finished corpus is not processed repeatedly");
assert.ok(readMemoryOrganization().value.processed[base.id]);
// A source edited while the request is pending cannot be overwritten by stale output.
values.clear(); saveKnowledgeClaims([base]);
values.set("phone_memory_continuity_migration_v1", JSON.stringify({ version: 1, status: "completed", completed: 1, total: 1, orphanIds: [], consentAt: 1 }));
assert.equal(await organizeLegacyMemory({ ...input, request: async () => {
  saveKnowledgeClaims([{ ...base, statement: "现在不喜欢茶" }]); return { text: JSON.stringify({ items }) };
} }), "completed");
assert.equal(loadKnowledgeClaims().value.length, 1); assert.equal(loadKnowledgeClaims().value[0].statement, "现在不喜欢茶");
console.log("PASS semantic organisation acceptance: consent/visibility, literal evidence, legacy authority, scope, preserved originals, atomic state, repeat suppression and concurrent edit guard; model simulated");
