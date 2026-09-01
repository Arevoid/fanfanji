import assert from "node:assert/strict";
import type { MemoryItem } from "../src/types";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { commitMemoryWriteBundle } from "../src/domain/memory/memoryWriteCoordinator";

const claim: KnowledgeClaim = {
  id: "claim:coordinator:1",
  characterId: "character-1",
  relationId: "relation-1",
  userIdentityId: "identity-1",
  kind: "fact",
  subject: "relationship",
  statement: "双方约定周末见面。",
  truthStatus: "confirmed",
  temporalStatus: "future",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: ["message-1"],
    producer: "test",
    evidenceKey: "message-1",
  },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 1,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
};

const summary: ConversationSummaryRecord = {
  id: "conversation-summary:relation-1:message-1:message-1",
  characterId: "character-1",
  relationId: "relation-1",
  userIdentityId: "identity-1",
  summary: "- 双方约定周末见面。",
  sourceMessageIds: ["message-1"],
  sourceClaimIds: [claim.id],
  generatedAt: 2,
  generator: "test",
  projectionVersion: 1,
  status: "active",
  schemaVersion: 1,
};

const memory: MemoryItem = {
  id: "memory-1",
  characterId: "character-1",
  relationId: "relation-1",
  content: "双方约定周末见面。",
  timestamp: 2,
  importance: 5,
  isManual: false,
};

const calls: string[] = [];
const successful = await commitMemoryWriteBundle({
  claims: [claim],
  summary,
  memories: [memory],
  appendClaims: () => {
    calls.push("claims");
    return { success: true };
  },
  appendSummaries: () => {
    calls.push("summary");
    return { success: true };
  },
  saveMemories: () => {
    calls.push("memories");
    return true;
  },
});
assert.deepEqual(calls, ["claims", "summary", "memories"]);
assert.deepEqual(successful, {
  canonicalWritten: true,
  summaryWritten: true,
  memoriesWritten: true,
  complete: true,
});

const blockedCalls: string[] = [];
const blocked = await commitMemoryWriteBundle({
  claims: [claim],
  summary,
  memories: [memory],
  appendClaims: () => {
    blockedCalls.push("claims");
    return { success: false, error: "quota" };
  },
  appendSummaries: () => {
    blockedCalls.push("summary");
    return { success: true };
  },
  saveMemories: () => {
    blockedCalls.push("memories");
    return true;
  },
});
assert.deepEqual(blockedCalls, ["claims"], "derived projections must not be written after canonical failure");
assert.equal(blocked.canonicalWritten, false);
assert.equal(blocked.complete, false);
assert.equal(blocked.error, "quota");

const summaryFailureCalls: string[] = [];
const summaryFailure = await commitMemoryWriteBundle({
  claims: [claim],
  summary,
  memories: [memory],
  appendClaims: () => ({ success: true }),
  appendSummaries: () => {
    summaryFailureCalls.push("summary");
    return { success: false, error: "write" };
  },
  saveMemories: () => {
    summaryFailureCalls.push("memories");
    return true;
  },
});
assert.deepEqual(summaryFailureCalls, ["summary", "memories"], "summary cache failure must not discard canonical or compatibility data");
assert.equal(summaryFailure.canonicalWritten, true);
assert.equal(summaryFailure.summaryWritten, false);
assert.equal(summaryFailure.memoriesWritten, true);
assert.equal(summaryFailure.complete, false);

const memoryOnly = await commitMemoryWriteBundle({
  memories: [memory],
  saveMemories: () => ({ success: true }),
});
assert.equal(memoryOnly.canonicalWritten, true);
assert.equal(memoryOnly.memoriesWritten, true);
assert.equal(memoryOnly.complete, true, "group summaries without canonical claims remain valid compatibility writes");

const summaryBatchCalls: number[] = [];
const summaryBatch = await commitMemoryWriteBundle({
  claims: [claim],
  summaries: [summary, { ...summary, id: `${summary.id}:2` }],
  appendClaims: () => ({ success: true }),
  appendSummaries: (values) => {
    summaryBatchCalls.push(values.length);
    return { success: true };
  },
});
assert.deepEqual(summaryBatchCalls, [2], "a group archive writes all canonical summary projections in one batch");
assert.equal(summaryBatch.complete, true);

const specializedCalls: string[] = [];
const specialized = await commitMemoryWriteBundle({
  claims: [claim],
  memories: [memory],
  writeClaims: () => {
    specializedCalls.push("supersede");
    return { success: true };
  },
  appendClaims: () => {
    specializedCalls.push("append-should-not-run");
    return { success: true };
  },
  saveMemories: () => {
    specializedCalls.push("memories");
    return { success: true };
  },
});
assert.deepEqual(specializedCalls, ["supersede", "memories"], "specialized canonical edits must keep the same commit boundary");
assert.equal(specialized.complete, true);

console.log("Memory write coordinator: ordering, failure boundaries and memory-only writes passed");
