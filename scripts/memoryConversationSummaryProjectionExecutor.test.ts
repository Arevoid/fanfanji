import assert from "node:assert/strict";
import { createMemoryProjectionJob } from "../src/domain/memory/memoryProjectionJob";
import { deriveCanonicalClaimSetRevision } from "../src/domain/memory/memoryCanonicalRevision";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";
import type { KnowledgeClaim, ConversationSummaryRecord } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { executeConversationSummaryProjection } from "../src/core/memory/memoryConversationSummaryProjectionExecutor";

const scope: MemoryProcessingScope = {
  characterId: "character-executor",
  relationId: "relation-executor",
  userIdentityId: "identity-executor",
  conversationId: "direct:relation-executor",
};

const claim = (id: string, statement = id, status: KnowledgeClaim["status"] = "active", targetScope = scope): KnowledgeClaim => ({
  ...targetScope,
  id,
  kind: "fact",
  subject: "user",
  statement,
  truthStatus: "asserted",
  temporalStatus: "present",
  source: { kind: "user_message", authorship: "user", messageIds: [`message-${id}`], producer: "test", evidenceKey: id },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status,
  visibility: "relation_private",
  schemaVersion: 1,
});

const claims = [claim("claim-a"), claim("claim-b")];
const revision = deriveCanonicalClaimSetRevision({ scope, claims });
const job = createMemoryProjectionJob({
  projectionKind: "conversation_summary",
  scope,
  canonicalRefs: revision.activeClaimIds,
  canonicalRevision: revision.revision,
  createdAt: 100,
});
let writes: ConversationSummaryRecord[] = [];

const first = await executeConversationSummaryProjection({
  job,
  claims,
  summaries: [],
  now: 200,
  writeSummary: (summary) => { writes.push(summary); return { success: true }; },
});
assert.equal(first.kind, "written");
assert.equal(writes.length, 1);
assert.equal(writes[0]?.canonicalRevision, revision.revision);
assert.deepEqual(writes[0]?.sourceClaimIds, revision.activeClaimIds);
assert.deepEqual(writes[0]?.sourceMessageIds, ["message-claim-a", "message-claim-b"]);

let duplicateWrites = 0;
const current = await executeConversationSummaryProjection({
  job,
  claims,
  summaries: writes,
  now: 201,
  writeSummary: () => { duplicateWrites += 1; return { success: true }; },
});
assert.equal(current.kind, "current");
assert.equal(duplicateWrites, 0, "current canonical summary is not rewritten");

const changedClaims = [claim("claim-a", "changed statement"), claim("claim-b")];
let staleWrites = 0;
const stale = await executeConversationSummaryProjection({
  job,
  claims: changedClaims,
  summaries: [],
  now: 202,
  writeSummary: () => { staleWrites += 1; return { success: true }; },
});
assert.deepEqual(stale, { kind: "failed", errorCode: "CANONICAL_REVISION_CHANGED" });
assert.equal(staleWrites, 0);

const missing = await executeConversationSummaryProjection({
  job: { ...job, canonicalRefs: ["missing-claim"] },
  claims,
  summaries: [],
  now: 203,
  writeSummary: () => ({ success: true }),
});
assert.deepEqual(missing, { kind: "failed", errorCode: "CANONICAL_MISSING" });

const scopeMismatch = await executeConversationSummaryProjection({
  job,
  claims: [claim("claim-a", "wrong scope", "active", { ...scope, relationId: "other-relation" }), claim("claim-b")],
  summaries: [],
  now: 204,
  writeSummary: () => ({ success: true }),
});
assert.deepEqual(scopeMismatch, { kind: "failed", errorCode: "SCOPE_MISMATCH" });

const noActiveClaims = await executeConversationSummaryProjection({
  job,
  claims: [claim("claim-a", "retracted", "retracted"), claim("claim-b", "retracted", "retracted")],
  summaries: [],
  now: 205,
  writeSummary: () => ({ success: true }),
});
assert.deepEqual(noActiveClaims, { kind: "failed", errorCode: "CANONICAL_REVISION_CHANGED" });

const noProvenance = await executeConversationSummaryProjection({
  job,
  claims: claims.map((item) => ({ ...item, source: { ...item.source, messageIds: [] } })),
  summaries: [],
  now: 206,
  writeSummary: () => ({ success: true }),
});
assert.deepEqual(noProvenance, { kind: "failed", errorCode: "CANONICAL_REVISION_CHANGED" });

const writeFailure = await executeConversationSummaryProjection({
  job,
  claims,
  summaries: [],
  now: 207,
  writeSummary: () => ({ success: false }),
});
assert.deepEqual(writeFailure, { kind: "failed", errorCode: "SUMMARY_WRITE_FAILED" });

const legacyIgnored = await executeConversationSummaryProjection({
  job: { ...job, projectionKind: "legacy_memory_mirror" },
  claims,
  summaries: [],
  now: 208,
  writeSummary: () => ({ success: true }),
});
assert.deepEqual(legacyIgnored, { kind: "failed", errorCode: "SCOPE_MISMATCH" });

console.log("memory ConversationSummary projection executor tests passed");
