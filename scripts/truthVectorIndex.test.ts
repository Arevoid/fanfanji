import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { buildSemanticVector, cosineSimilarity, MEMORY_VECTOR_DIMENSIONS } from "../src/domain/memory/semanticVector";
import { TRUTH_VECTOR_INDEX_DB_NAME } from "../src/core/storage/truthVectorIndexDb";
import {
  buildTruthVectorRecords,
  loadTruthVectorIndex,
  persistTruthVectorIndex,
  rankTruthVectorCandidates,
} from "../src/features/characterKnowledge/services/truthVectorIndexService";

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: indexedDB });

const scope = { relationId: "relation-vector", characterId: "char-vector", userIdentityId: "identity-vector", conversationId: "direct:vector" };
const claim: KnowledgeClaim = {
  ...scope,
  id: "claim-vector",
  kind: "fact",
  subject: "relationship",
  statement: "用户和角色每天晚上十点打卡，格式是亲亲老婆",
  truthStatus: "confirmed",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: ["message-vector"], producer: "test", evidenceKey: "claim-vector" },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};
const summary: ConversationSummaryRecord = {
  id: "summary-vector",
  ...scope,
  layer: "episode",
  summary: "昨晚双方确认了每天打卡的约定",
  sourceMessageIds: ["message-vector"],
  sourceClaimIds: [],
  generatedAt: 10,
  generator: "character-truth-extraction.v1",
  projectionVersion: 2,
  status: "active",
  schemaVersion: 1,
};

assert.equal(buildSemanticVector("打卡格式").length, MEMORY_VECTOR_DIMENSIONS);
assert.ok(cosineSimilarity(buildSemanticVector("每天打卡格式"), buildSemanticVector("每天打卡格式为亲亲老婆")) > 0.2);
const records = buildTruthVectorRecords([claim], [summary], 20);
assert.deepEqual(records.map((record) => record.id), ["claim:claim-vector", "episode:summary-vector"]);
const ranked = rankTruthVectorCandidates("每天打卡", records, 2);
assert.deepEqual(ranked.map((item) => item.id).sort(), ["claim:claim-vector", "episode:summary-vector"]);
assert.ok(ranked[0]?.score > 0);

await new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase(TRUTH_VECTOR_INDEX_DB_NAME);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});
const write = await persistTruthVectorIndex([claim], [summary]);
assert.equal(write.success, true);
assert.equal(write.count, 2);
const loaded = await loadTruthVectorIndex(scope);
assert.deepEqual(loaded.map((record) => record.id).sort(), ["claim:claim-vector", "episode:summary-vector"]);

const otherScope = { ...scope, relationId: "relation-other" };
await persistTruthVectorIndex([claim], [], scope);
await persistTruthVectorIndex([], [], scope);
assert.deepEqual(await loadTruthVectorIndex(scope), [], "rebuilding an empty exact scope removes stale vectors");
await persistTruthVectorIndex([{ ...claim, ...otherScope, id: "claim-other" }], [], otherScope);
assert.deepEqual((await loadTruthVectorIndex(otherScope)).map((record) => record.id), ["claim:claim-other"], "vector scopes remain isolated");

console.log("PASS deterministic semantic vectors and IndexedDB Truth/Episode index persistence");
