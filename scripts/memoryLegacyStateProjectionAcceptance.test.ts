import assert from "node:assert/strict";
import { meaningfulMemoryValue } from "./fixtures/memoryValueFixture";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { organizationSourceRevision, projectOrganizedKnowledge } from "../src/domain/characterKnowledge/knowledgeOrganization";
import { loadKnowledgeClaims, saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { organizeLegacyMemory, MEMORY_ORGANIZATION_KEY, emptyMemoryOrganization } from "../src/features/characterKnowledge/services/memoryOrganizationService";
import { retrieveTruthForPrivatePrompt, formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
import type { UserSettings } from "../src/types";
import { enrichOrganizedKnowledge } from "../src/domain/characterKnowledge/knowledgeOrganization";
import { memoryQueryMatchingIds } from "../src/domain/memory/memoryQueryConstraints";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const old: KnowledgeClaim = { ...scope, id: "old", statement: "我的橘猫叫豆豆", kind: "fact", subject: "user", temporalStatus: "unknown", truthStatus: "legacy_unverified", confidence: .25,
  userConfirmed: false, recordedAt: 100, status: "active", visibility: "relation_private", schemaVersion: 1,
  source: { kind: "legacy_memory", authorship: "unknown", producer: "fixture", evidenceKey: "old", sourceRecordId: "old" } };
const next: KnowledgeClaim = { ...old, id: "next", statement: "我家的橘猫现在改叫团团，豆豆这个称呼不用了", temporalStatus: "present", recordedAt: 200,
  source: { ...old.source, evidenceKey: "next", sourceRecordId: "next" } };
saveKnowledgeClaims([old, next]);
values.set("phone_memory_continuity_migration_v1", JSON.stringify({ version: 1, status: "completed", completed: 2, total: 2, orphanIds: [], consentAt: 1 }));
values.set(MEMORY_ORGANIZATION_KEY, JSON.stringify({ ...emptyMemoryOrganization(), processed: Object.fromEntries([old, next].map((record) => [record.id, organizationSourceRevision(record)])) }));
let calls = 0;
assert.equal(await organizeLegacyMemory({ scope, settings: { apiKey: "synthetic", selectedModel: "synthetic" } as UserSettings, visible: true, now: 1000,
  request: async (params) => {
    calls++;
    if (params.systemInstruction?.startsWith("独立核对旧资料")) return { text: JSON.stringify({ reviews: [{ index: 1, previousId: old.id, sameEntity: true, sameAttribute: true,
      supported: true, operation: "change", confidence: .99, previousQuote: old.statement, currentQuote: next.statement, reason: "同一只猫明确改名" }] }) };
    const body=JSON.parse(params.message);
    return { text: JSON.stringify({ items: [{ sourceId: body.sources.find((s:{text:string})=>s.text===old.statement).sourceId, quote: old.statement, association: null, valueAssessment: meaningfulMemoryValue(old.statement) }, { sourceId: body.sources.find((s:{text:string})=>s.text===next.statement).sourceId, quote: next.statement, valueAssessment: meaningfulMemoryValue(next.statement),
      factDecision: { targetClaimId: body.registry.find((r:{text:string})=>r.text===old.statement).id, entity: "橘猫", attribute: "名字", value: "团团", operation: "change", confidence: .99, reason: "同一只猫改名",
        currentQuote: next.statement, previousQuote: old.statement } }] }) };
  } }), "completed");
assert.equal(calls, 2, "one association pass plus one bounded independent review");
const raw = loadKnowledgeClaims().value; assert.equal(raw[0].supersededById, undefined, "original legacy records remain intact");
const projected = projectOrganizedKnowledge(raw);
assert.equal(projected[0].supersededById, next.id); assert.equal(projected[1].supersedesId, old.id);
assert.equal(projected[1].factIdentity?.entityId, projected[0].factIdentity?.entityId);
assert.ok(projected.every((record) => record.truthStatus === "legacy_unverified"));
assert.deepEqual(projectOrganizedKnowledge(projected), projected, "read projection is idempotent");
saveKnowledgeClaims(JSON.parse(JSON.stringify(projected)));
assert.equal(loadKnowledgeClaims().value[0].supersededById, undefined, "a read projection cannot accidentally overwrite its source records on backup/save");
const prompt = formatTruthRetrievalForPrompt(retrieveTruthForPrivatePrompt({ scope, claims: raw, summaries: [], corrections: [], queryText: "橘猫现在叫什么", now: 1000 }));
assert.match(prompt, /团团/); assert.match(prompt, /旧数据待核验/);
const changed = projectOrganizedKnowledge(raw.map((record) => record.id === next.id ? { ...record, statement: "橘猫的名字不确定" } : record));
assert.equal(changed[0].supersededById, undefined, "source edits invalidate the derived version without a migration");
assert.equal(projectOrganizedKnowledge(raw.map((record) => record.id === old.id ? { ...record, relationId: "foreign" } : record))[0].supersededById, undefined);
const plan = { ...old, id: "plan", kind: "plan" as const, temporalStatus: "future" as const, statement: "我们计划周六看电影" };
const answer: KnowledgeClaim = { ...old, id: "answer", statement: "好呀，到时不见不散", temporalStatus: "future", organizationJudgment: {
  targetId: plan.id, sourceRevision: "", targetRevision: organizationSourceRevision(plan), event: { activity: "看电影", state: "confirmed",
    referenceClaimId: plan.id, referenceQuote: plan.statement, matchConfidence: .99, matchReason: "独立核对接受同一计划" } } };
answer.organizationJudgment!.sourceRevision = organizationSourceRevision(answer);
const event = projectOrganizedKnowledge([plan, answer]);
assert.equal(event[0].supersededById, answer.id); assert.equal(event[1].event?.identityId, "legacy-event:plan"); assert.equal(event[1].planStatus, "confirmed");
assert.equal(event[1].truthStatus, "legacy_unverified");
const dated = { ...old, id: "dated", statement: "2026-10-01我们一起去过天文馆" };
const more = enrichOrganizedKnowledge({ ...old, id: "more", statement: "那次参观天文馆时一起看了星空展览" }, { association: {
  targetId: dated.id, relation: "same_event", sourceQuote: "参观天文馆", targetQuote: "天文馆", confidence: .98, reason: "同一趟参观的两个来源" } }, [dated]);
const family = projectOrganizedKnowledge([dated, more]); assert.equal(family[0].organizationFamilyId, family[1].organizationFamilyId);
assert.ok(family[0].organizationFamilyId); assert.ok(memoryQueryMatchingIds(family, { eventDate: "2026-10-01" }).has(more.id));
assert.equal(projectOrganizedKnowledge([dated, { ...more, relationId: "foreign" }])[1].organizationFamilyId, undefined);
console.log("PASS legacy semantic state: formal association/review, actual current/history/event projection, original preservation, reload/idempotence, no authority upgrade, source edit and scope invalidation; model judgments synthetic");
