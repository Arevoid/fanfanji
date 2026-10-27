import assert from "node:assert/strict";
import type { KnowledgeClaim, ConversationSummaryRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { SemanticMemoryIndex } from "../src/domain/memory/semanticMemoryIndex";
import { semanticClaimRevision } from "../src/domain/memory/semanticMemoryIndex";
import { chunkSemanticDocument, isIndexableSemanticClaim } from "../src/domain/memory/semanticMemoryDocuments";
import { emptyCharacterContinuity } from "../src/domain/memory/characterContinuity";
import { CHARACTER_CONTINUITY_KEY } from "../src/core/storage/repositories/characterContinuityRepository";
import { saveKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";
import { saveConversationSummaries } from "../src/core/storage/repositories/conversationSummaryRepository";
import { contributeSemanticDirectReplyTruthContext } from "../src/features/characterKnowledge/services/semanticMemoryRecallService";
import { formatTruthRetrievalForPrompt } from "../src/features/characterKnowledge/services/truthRetrievalService";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } } });
const scope = { characterId: "a", relationId: "r", userIdentityId: "u", conversationId: "c" };
const base: KnowledgeClaim = { ...scope, id: "source", statement: "用户认真照顾生病的朋友", kind: "fact", subject: "user", truthStatus: "asserted", temporalStatus: "past", recordedAt: 100,
  confidence: .85, userConfirmed: false, status: "active", visibility: "relation_private", schemaVersion: 1,
  source: { kind: "user_message", authorship: "user", producer: "fixture", evidenceKey: "source", messageIds: ["source"] } };
const summary: ConversationSummaryRecord = { ...scope, id: "ep", summary: "共同参观天文馆，认真观看星空展览", sourceClaimIds: [base.id], sourceMessageIds: [], generatedAt: 100,
  generator: "fixture", projectionVersion: 1, status: "active", schemaVersion: 1 };
saveConversationSummaries([summary]);
values.set(CHARACTER_CONTINUITY_KEY, JSON.stringify({ ...emptyCharacterContinuity(), impressions: [{ id: "belief", scope, category: "关怀", proposition: "觉得用户很体贴", sourceClaimIds: [base.id], confidence: .5, recordedAt: 100, status: "active" }],
  life: [{ id: "life", characterId: "a", userIdentityId: "u", summary: "完成整理书架，旧书已经分类", occurredAt: 100, recordedAt: 100, status: "completed", origin: "foreground_simulation", private: true },
    { id: "foreign-life", characterId: "other", userIdentityId: "u", summary: "秘密口令", occurredAt: 100, recordedAt: 100, status: "completed", origin: "foreground_simulation", private: true }] }));
let current = [base]; saveKnowledgeClaims(current);
let index: SemanticMemoryIndex | undefined; let requests = 0;
const configuration = { enabled: true, apiEndpoint: "https://synthetic.test/v1", model: "synthetic", apiKey: "synthetic", indexRequestsPerDay:4 };
const input = { configuration, visible: true, now: 1000, retrieval: { scope, claims: current, summaries: [summary], corrections: [], queryText: "shelving progress", now: 1000 },
  readClaims: () => current, readIndex: async (_scope: typeof scope, provider: string) => index || { version: 1 as const, scope, provider, entries: [] },
  writeIndex: async (value: SemanticMemoryIndex) => { index = structuredClone(value); }, request: async (params: { texts: readonly string[] }) => {
    requests++; assert.ok(params.texts.every((text) => !text.includes("秘密口令")));
    return params.texts.map((text) => /书架|shelving/u.test(text) ? [1, 0, 0, 0] : /体贴|kindness/u.test(text) ? [0, 1, 0, 0]
      : /天文馆|planet museum/u.test(text) ? [0, 0, 1, 0] : [0, 0, 0, 1]);
  } };
const life = await contributeSemanticDirectReplyTruthContext(input);
assert.match(formatTruthRetrievalForPrompt(life), /完成整理书架/);
const belief = await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: "kindness outlook" } });
assert.match(formatTruthRetrievalForPrompt(belief), /用户很体贴/);
const episode = await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: "planet museum" } });
assert.match(formatTruthRetrievalForPrompt(episode), /星空展览/);
const unchangedRequests = requests;
index = JSON.parse(JSON.stringify(index));
await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: "planet museum" } });
assert.equal(requests, unchangedRequests, "reloaded vectors and repeated queries remain reusable");
// Invalidated supporting evidence removes old cognition and summary documents, including their vectors.
current = [{ ...base, status: "retracted", truthStatus: "retracted" }]; saveKnowledgeClaims(current);
await contributeSemanticDirectReplyTruthContext({ ...input, indexOnly: true, retrieval: { ...input.retrieval, claims: current } });
assert.equal(index!.entries.some((entry) => entry.claimId.includes("impression:belief") || entry.claimId.includes("summary:ep")), false);
// Work survives a page reload and a daily request limit; no query request is made for indexing-only work.
values.clear(); index = undefined; requests = 0;
current = Array.from({ length: 300 }, (_, n) => ({ ...base, id: `noise-${n}`, statement: `用户曾经参观过普通商场编号${n}`, recordedAt: n + 100 })); saveKnowledgeClaims(current);
for (let n = 0; n < 5; n++) await contributeSemanticDirectReplyTruthContext({ ...input, indexOnly: true, retrieval: { ...input.retrieval, claims: current, summaries: [] } });
assert.equal(requests, 4); assert.equal(index!.entries.length, 256); assert.equal(index!.pending?.length, 44); assert.equal(index!.state, "limited");
index = JSON.parse(JSON.stringify(index));
await contributeSemanticDirectReplyTruthContext({ ...input, indexOnly: true, now: 86_401_000, retrieval: { ...input.retrieval, claims: current, summaries: [] } });
assert.equal(index!.entries.length, 300); assert.equal(index!.pending?.length, 0); assert.equal(index!.state, "ready");
const long = { ...base, statement: `${"普通资料。".repeat(300)}用户曾经参观天文馆。${"普通资料。".repeat(300)}` };
for (const reason of ["fact_changed", "plan_progressed"]) {
  const historical = { ...base, supersededById: "successor", retractionReason: reason };
  assert.equal(isIndexableSemanticClaim(historical, scope, 1000), true, `progress and writer must include ${reason}`);
  values.clear(); index = undefined; current = [historical]; saveKnowledgeClaims(current);
  await contributeSemanticDirectReplyTruthContext({ ...input, indexOnly: true, retrieval: { ...input.retrieval, claims: current, summaries: [] } });
  assert.ok(index!.entries.some((entry) => entry.claimId === JSON.stringify(["claim", base.id, 0])));
}
assert.equal(isIndexableSemanticClaim({ ...base, supersededById: "successor", retractionReason: "corrected" }, scope, 1000), false);
assert.equal(isIndexableSemanticClaim({ ...base, relationId: "foreign" }, scope, 1000), false);
assert.equal(isIndexableSemanticClaim({ ...base, validFrom: 2000 }, scope, 1000), false);
for (const [error, code] of [["embedding_status_401", "authentication"], ["embedding_status_429", "rate_limit"],
  ["embedding_status_405", "endpoint"], ["invalid_embedding_response", "invalid_vectors"], ["untrusted provider body synthetic-secret", "unavailable"]]) {
  values.clear(); index = undefined; current = [base]; saveKnowledgeClaims(current);
  await contributeSemanticDirectReplyTruthContext({ ...input, indexOnly: true, retrieval: { ...input.retrieval, claims: current, summaries: [] },
    request: async () => { throw Error(error); } });
  assert.equal(index!.state, "failed"); assert.equal(index!.failureCode, code); assert.equal(index!.pending?.length, 1);
  assert.doesNotMatch(JSON.stringify(index), /synthetic-secret|untrusted provider body/);
}
const chunks = chunkSemanticDocument(long, "claim");
assert.ok(chunks.length > 1); assert.equal(chunks.map((chunk) => chunk.statement).join(""), long.statement);
assert.ok(chunks.every((chunk) => chunk.statement.length <= 600));
assert.notEqual(semanticClaimRevision(chunks[0]), semanticClaimRevision(chunkSemanticDocument({ ...long, truthStatus: "disputed" }, "claim")[0]));
console.log("PASS vector coverage acceptance: all memory kinds, namespace isolation, scoped source invalidation, reload/cache, durable daily backlog, indexing-only budget and lossless long-document fragments; vectors synthetic");
