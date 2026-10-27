import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { SemanticMemoryIndex } from "../src/domain/memory/semanticMemoryIndex";
import { normalizeEmbeddingVector, scoreSemanticMemories, semanticClaimRevision } from "../src/domain/memory/semanticMemoryIndex";
import { contributeSemanticDirectReplyTruthContext, MEMORY_SEMANTIC_DAILY_LIMITS } from "../src/features/characterKnowledge/services/semanticMemoryRecallService";
import { requestMemoryEmbeddings } from "../src/features/characterKnowledge/services/memoryEmbeddingProvider";
import { clearInMemoryAiRequestLedgerForTests, loadAiRequestLedger } from "../src/core/monitoring/aiRequestLedger";

// These are synthetic vectors. This file proves plumbing and guards, not real semantic model quality.
const scope = { characterId: "semantic-char", relationId: "semantic-relation", userIdentityId: "semantic-user", conversationId: "semantic-conversation" };
const claim: KnowledgeClaim = { ...scope, id: "thunder", statement: "用户害怕突如其来的雷声", kind: "fact", subject: "user",
  truthStatus: "asserted", temporalStatus: "present", source: { kind: "user_message", authorship: "user", messageIds: ["source"], evidenceKey: "source", producer: "fixture" },
  confidence: 0.85, userConfirmed: false, recordedAt: 100, status: "active", visibility: "relation_private", schemaVersion: 1 };
const foreign = { ...claim, id: "foreign", relationId: "another", statement: "另一个关系的秘密" };
const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
} } });
const configuration = { enabled: true, apiEndpoint: "https://embedding.test/v1", model: "synthetic-vector", apiKey: "synthetic-key" };
let index: SemanticMemoryIndex;
let requests = 0;
let latest: KnowledgeClaim[] = [claim, foreign];
const input = { retrieval: { scope, queryText: "storm outside", claims: latest, summaries: [], corrections: [], now: 1000 }, configuration,
  visible: true, now: 1000, readClaims: () => latest,
  readIndex: async (_scope: typeof scope, provider: string) => index || { version: 1 as const, scope, provider, entries: [] },
  writeIndex: async (next: SemanticMemoryIndex) => { index = structuredClone(next); },
  request: async (params: Parameters<typeof requestMemoryEmbeddings>[0]) => {
    requests++;
    assert.equal(params.texts.some((text) => text.includes("另一个关系的秘密")), false);
    return params.texts.map(() => [1, 0, 0]);
  },
};
assert.equal(normalizeEmbeddingVector([0, 0]), undefined);assert.equal(normalizeEmbeddingVector([1, Infinity]), undefined);
assert.equal((await contributeSemanticDirectReplyTruthContext({ ...input, visible: false })).orderedClaims?.length, 0);
assert.equal(requests, 0, "no index or query request while hidden");
assert.equal((await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, scenario: "public" } })).orderedClaims?.length, 0);
assert.equal(requests, 0, "public call cannot send private memories");
const result = await contributeSemanticDirectReplyTruthContext(input);
assert.deepEqual(result.orderedClaims?.map((item) => item.id), [claim.id], "non-lexical similarity can pass the recall seam");
assert.equal(requests, 2, "one bounded source batch plus one query");
await contributeSemanticDirectReplyTruthContext(input);assert.equal(requests, 2, "persisted sources and repeated query reuse cache");
const vector = [1, 0, 0];
const corroborating = [{ ...claim, id: JSON.stringify(["claim", claim.id, 0]) },
  { ...claim, id: JSON.stringify(["supplementary", "impression", 0]), source: { ...claim.source, kind: "automatic_summary" as const, producer: "semantic-document", supportingClaimIds: [claim.id] } }];
const closeIndex = { ...index!, entries: corroborating.map((item, position) => ({ claimId: item.id, revision: semanticClaimRevision(item),
  vector: [position ? .52 : .56, Math.sqrt(1 - (position ? .52 : .56) ** 2), 0] })) };
assert.equal(scoreSemanticMemories(corroborating, closeIndex, vector).size, 2, "a fact and its sourced reflection corroborate rather than compete");
const competing = corroborating.map((item) => ({ ...item, source: { ...item.source, supportingClaimIds: [] } }));
const competingIndex = { ...closeIndex, entries: closeIndex.entries.map((entry, position) => ({ ...entry, revision: semanticClaimRevision(competing[position]) })) };
assert.equal(scoreSemanticMemories(competing, competingIndex, vector).size, 0, "unrelated close scores still fail ambiguity gating");
assert.equal(scoreSemanticMemories([{ ...claim, statement: "用户明确说自己不害怕雷声" }], index!, vector).size, 0);
assert.equal(scoreSemanticMemories([{ ...claim, recallDisabled: true }], index!, vector).size, 0);
assert.equal(scoreSemanticMemories([{ ...claim, relationId: "another" }], index!, vector).size, 0);
assert.equal(scoreSemanticMemories([{ ...claim, status: "retracted" }], index!, vector).size, 0);
assert.equal(scoreSemanticMemories([claim], { ...index!, entries: [{ claimId: claim.id, revision: semanticClaimRevision(claim), vector: [0, 1, 0] }] }, vector).size, 0);

// A source changes during the request: a vector based on old text cannot influence recall.
values.clear(); index = { ...index!, entries: [] }; latest = [claim];
const changed = await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: "storm after source edit" },
  request: async (params) => { latest = [{ ...claim, statement: "用户不害怕雷声" }]; return params.texts.map(() => vector); } });
assert.equal(changed.orderedClaims?.length, 0);
latest = [claim]; values.clear();
const unavailable = await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: "storm unavailable" },
  request: async () => { throw new Error("synthetic_provider_failure"); } });
assert.equal(unavailable.orderedClaims?.length, 0);
const lexicalFallback = await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: "雷声" },
  request: async () => { throw new Error("synthetic_provider_failure"); } });
assert.deepEqual(lexicalFallback.orderedClaims?.map((item) => item.id), [claim.id]);

// Query request cap; exhausted budget never causes another paid request.
values.clear();requests = 0;
for (let position = 0; position < MEMORY_SEMANTIC_DAILY_LIMITS.queryRequests + 1; position++) {
  await contributeSemanticDirectReplyTruthContext({ ...input, retrieval: { ...input.retrieval, queryText: `new semantic query ${position}` } });
}
assert.equal(requests, MEMORY_SEMANTIC_DAILY_LIMITS.queryRequests);
clearInMemoryAiRequestLedgerForTests();

// Provider row ordering is runtime-owned; malformed or duplicate row indexes fail closed.
const ordered = await requestMemoryEmbeddings({ configuration, texts: ["one", "two"], fetch: async () => new Response(JSON.stringify({ data: [
  { index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { total_tokens: 2 } }), { status: 200 }) });
assert.deepEqual(ordered, [[1, 0], [0, 1]]);
await assert.rejects(requestMemoryEmbeddings({ configuration, texts: ["one", "two"], fetch: async () => new Response(JSON.stringify({ data: [
  { index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] }] }), { status: 200 }) }), /invalid_embedding_response/);
await assert.rejects(requestMemoryEmbeddings({ configuration: { ...configuration, apiEndpoint: "https://key@example.test/v1" }, texts: ["one"] }), /invalid_embedding_endpoint/);
assert.equal(JSON.stringify(loadAiRequestLedger()).includes("synthetic-key"), false);
console.log("PASS semantic memory plumbing: non-lexical vectors, scopes, source versions, visibility, cache, request cap, fallback and provider row validation; vectors are synthetic");
