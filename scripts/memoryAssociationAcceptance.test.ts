import assert from "node:assert/strict";
import { meaningfulMemoryValue } from "./fixtures/memoryValueFixture";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { UserSettings } from "../src/types";
import { acceptOrganizedKnowledge, enrichOrganizedKnowledge, reconcileOrganizedKnowledge, organizedSourceCoverage } from "../src/domain/characterKnowledge/knowledgeOrganization";
import { saveKnowledgeClaims, loadKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { organizeLegacyMemory, readMemoryOrganization } from "../src/features/characterKnowledge/services/memoryOrganizationService";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const parent: KnowledgeClaim = { ...scope, id: "parent", statement: "用户养了一只橘猫。橘猫叫团团。", kind: "fact", subject: "user", temporalStatus: "unknown", truthStatus: "legacy_unverified", confidence: .25,
  userConfirmed: false, recordedAt: 100, status: "active", visibility: "relation_private", schemaVersion: 1, source: { kind: "legacy_memory", authorship: "unknown", producer: "fixture", evidenceKey: "parent", sourceRecordId: "parent" } };
const target = { ...parent, id: "other-source", statement: "用户的橘猫名字是团团", source: { ...parent.source, evidenceKey: "independent" } };
const atoms = acceptOrganizedKnowledge(parent, [{ sourceId: parent.id, quote: "用户养了一只橘猫", kind: "fact", temporalStatus: "unknown" }, { sourceId: parent.id, quote: "橘猫叫团团", kind: "fact", temporalStatus: "unknown" }]);
assert.equal(organizedSourceCoverage(parent, atoms), 1); assert.ok(organizedSourceCoverage(parent, atoms.slice(0, 1)) < 1);
assert.equal(acceptOrganizedKnowledge(parent, [{ sourceId: parent.id, quote: "用户养了一只橘猫。", kind: "fact", temporalStatus: "unknown" }, { sourceId: parent.id, quote: "橘猫叫团团。", kind: "fact", temporalStatus: "unknown" }]).length, 2, "complete quotes may include their sentence punctuation");
const association = { targetId: target.id, sourceQuote: "橘猫叫团团", targetQuote: target.statement, relation: "same_attribute", confidence: .98, reason: "同一只橘猫的名字" };
const linked = enrichOrganizedKnowledge(atoms[1], { association }, [target]);
assert.equal(linked.associations?.length, 1); assert.equal(linked.truthStatus, "legacy_unverified");
assert.equal(enrichOrganizedKnowledge(atoms[1], { association }, [{ ...target, relationId: "foreign" }]).associations, undefined);
assert.equal(enrichOrganizedKnowledge(atoms[1], { association: { ...association, sourceQuote: "编造" } }, [target]).associations, undefined);
assert.equal(reconcileOrganizedKnowledge([parent, linked, { ...target, statement: "橘猫已改名" }])[1].associations?.length, 0);
assert.equal(reconcileOrganizedKnowledge([{ ...parent, status: "retracted" }, linked, target])[1].status, "retracted");
saveKnowledgeClaims([parent, target]);
values.set("phone_memory_continuity_migration_v1", JSON.stringify({ version: 1, status: "completed", completed: 2, total: 2, orphanIds: [], consentAt: 1 }));
const settings = { apiKey: "synthetic", selectedModel: "synthetic" } as UserSettings;
let calls = 0;
const request = async (params: { message: string }) => {
  calls++; const body = JSON.parse(params.message);
  return { text: JSON.stringify({ items: body.sources.flatMap((source: { sourceId: string; text: string }) => body.stage === "associate"
    ? [{ sourceId: source.sourceId, quote: source.text, association: null, valueAssessment: meaningfulMemoryValue(source.text) }]
    : source.text.split("。").filter(Boolean).map((quote: string) => ({ sourceId: source.sourceId, quote, kind: "fact", temporalStatus: "unknown", valueAssessment: meaningfulMemoryValue(quote) }))) }) };
};
assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now: 1000, request }), "completed");
const atomCount = loadKnowledgeClaims().value.filter((claim) => claim.organizationSourceId).length;
assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now: 2000, request: async () => ({ text: '{"items":[]}' }) }), "completed", "missing association coverage is queued per source without advancing its successful association marker");
assert.equal(Object.keys(readMemoryOrganization().value.associated || {}).length, 0); assert.equal(loadKnowledgeClaims().value.filter((claim) => claim.organizationSourceId).length, atomCount);
assert.ok(Object.values(readMemoryOrganization().value.unresolved||{}).every(entry=>entry.attempts===1));assert.ok(readMemoryOrganization().value.reviewIds.length>0);
assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now: 86_401_000, request }), "completed");
const completed = calls;
assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now: 86_402_000, request }), "completed"); assert.equal(calls, completed);
saveKnowledgeClaims([...loadKnowledgeClaims().value, { ...target, id: "new-source", statement: "用户家还有小狗" }]);
assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now: 172_801_000, request }), "completed");
assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now: 172_802_000, request }), "completed"); assert.ok(calls > completed);
values.clear(); const long = { ...parent, id: "long", statement: "长段资料".repeat(1400) }; saveKnowledgeClaims([long]);
values.set("phone_memory_continuity_migration_v1", JSON.stringify({ version: 1, status: "completed", completed: 1, total: 1, orphanIds: [], consentAt: 1 }));
let attempts = 0; const unorganisable = async () => { attempts++; return { text: '{"items":[]}' }; };
for (const now of [1000, 2000, 86_401_000]) assert.equal(await organizeLegacyMemory({ scope, settings, visible: true, now, request: unorganisable }), "completed");
assert.equal(attempts, 3, "unresolved fragments remain retryable across days, with at most two requests per owner per day");
assert.ok(readMemoryOrganization().value.reviewIds.includes(long.id)); assert.equal(loadKnowledgeClaims().value[0].statement, long.statement);
console.log("PASS organisation: full/partial source coverage, independently quoted cross-source association, no authority upgrade, foreign/stale/retracted rejection, incomplete-source hold, idempotent restart and corpus requeue");
