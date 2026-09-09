import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import { createConversationSummaryRecord } from "../src/domain/characterKnowledge/conversationSummaryProjection";
import { buildCanonicalMemoryCommitSnapshot } from "../src/domain/memory/canonicalMemoryCommitSnapshot";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";
import { compareConversationSummaryProjectionEquivalence } from "../src/core/memory/conversationSummaryProjectionEquivalence";
import { enqueueConversationSummaryProjection } from "../src/core/memory/memoryProjectionEnqueue";
import { appendToKnowledgeClaims } from "../src/core/storage/repositories/characterKnowledgeRepository";

const scope: MemoryProcessingScope = {
  characterId: "character-convergence",
  relationId: "relation-convergence",
  userIdentityId: "identity-convergence",
  conversationId: "direct:relation-convergence",
};
const otherScope: MemoryProcessingScope = {
  ...scope,
  relationId: "relation-other",
  conversationId: "direct:relation-other",
};

const claim = (id: string, statement: string, claimScope = scope, status: KnowledgeClaim["status"] = "active"): KnowledgeClaim => ({
  ...claimScope,
  id,
  kind: "fact",
  subject: "user",
  statement,
  truthStatus: "asserted",
  temporalStatus: "present",
  source: {
    kind: "user_message",
    authorship: "user",
    messageIds: [`message-${id}`],
    producer: "test",
    evidenceKey: id,
  },
  confidence: 1,
  userConfirmed: true,
  recordedAt: id === "claim-second" ? 20 : 10,
  status,
  visibility: "relation_private",
  schemaVersion: 1,
});

const makeSummaryPair = (snapshot: ReturnType<typeof buildCanonicalMemoryCommitSnapshot>) => {
  const synchronous = createConversationSummaryRecord({
    id: "sync-summary",
    scope,
    claims: snapshot.activeClaims,
    sourceMessageIds: snapshot.sourceMessageIds,
    canonicalRevision: snapshot.canonicalRevision,
    generatedAt: 100,
  });
  const background = createConversationSummaryRecord({
    id: "background-summary",
    scope,
    claims: snapshot.activeClaims,
    sourceMessageIds: snapshot.sourceMessageIds,
    canonicalRevision: snapshot.canonicalRevision,
    generatedAt: 150,
    generator: "memory-projection.conversation-summary.v1",
  });
  assert.ok(synchronous && background);
  if (!synchronous || !background) throw new Error("summary pair missing");
  return { synchronous, background };
};

const firstBatch = [claim("claim-first", "第一批事实")];
const firstCanonicalClaims = appendToKnowledgeClaims([], firstBatch);
const firstSnapshot = buildCanonicalMemoryCommitSnapshot({ scope, claims: firstCanonicalClaims });
assert.deepEqual(firstSnapshot.activeClaimIds, ["claim-first"]);
assert.deepEqual(firstSnapshot.sourceMessageIds, ["message-claim-first"]);
assert.equal(makeSummaryPair(firstSnapshot).synchronous.summary, "- [用户陈述] 第一批事实");
assert.equal(compareConversationSummaryProjectionEquivalence(
  makeSummaryPair(firstSnapshot).synchronous,
  makeSummaryPair(firstSnapshot).background,
).equivalent, true);

const secondBatch = [
  claim("claim-second", "第二批事实"),
  claim("claim-first", "第一批事实"),
  claim("other-scope", "其他关系事实", otherScope),
];
const cumulativeCanonicalClaims = appendToKnowledgeClaims(firstCanonicalClaims, secondBatch);
const cumulativeSnapshot = buildCanonicalMemoryCommitSnapshot({ scope, claims: cumulativeCanonicalClaims });
assert.deepEqual(cumulativeSnapshot.activeClaimIds, ["claim-first", "claim-second"], "second batch uses the cumulative exact-scope claim set");
assert.deepEqual(cumulativeSnapshot.sourceMessageIds, ["message-claim-first", "message-claim-second"]);
assert.deepEqual(
  makeSummaryPair(cumulativeSnapshot).synchronous.sourceClaimIds,
  ["claim-first", "claim-second"],
);
assert.equal(compareConversationSummaryProjectionEquivalence(
  makeSummaryPair(cumulativeSnapshot).synchronous,
  makeSummaryPair(cumulativeSnapshot).background,
).equivalent, true);

const duplicateCanonicalClaims = appendToKnowledgeClaims(cumulativeCanonicalClaims, [claim("claim-first", "第一批事实")]);
const duplicateSnapshot = buildCanonicalMemoryCommitSnapshot({ scope, claims: duplicateCanonicalClaims });
assert.equal(duplicateSnapshot.canonicalRevision, cumulativeSnapshot.canonicalRevision, "a duplicate candidate does not create a false canonical revision");
assert.deepEqual(duplicateSnapshot.activeClaimIds, cumulativeSnapshot.activeClaimIds);
assert.equal(makeSummaryPair(duplicateSnapshot).synchronous.summary, makeSummaryPair(cumulativeSnapshot).synchronous.summary);

const multiMessageClaim = {
  ...claim("claim-multi", "多消息来源事实"),
  source: {
    ...claim("claim-multi", "多消息来源事实").source,
    messageIds: ["message-multi-a", "message-multi-b"],
  },
};
const multiMessageSnapshot = buildCanonicalMemoryCommitSnapshot({ scope, claims: [multiMessageClaim] });
assert.deepEqual(multiMessageSnapshot.sourceMessageIds, ["message-multi-a", "message-multi-b"]);

const reversed = buildCanonicalMemoryCommitSnapshot({ scope, claims: [...secondBatch].reverse() });
assert.equal(reversed.canonicalRevision, cumulativeSnapshot.canonicalRevision, "canonical revision is deterministic");
assert.deepEqual(reversed.sourceMessageIds, cumulativeSnapshot.sourceMessageIds, "source ordering is deterministic");
assert.equal(makeSummaryPair(reversed).synchronous.summary, makeSummaryPair(cumulativeSnapshot).synchronous.summary);

const retracted = buildCanonicalMemoryCommitSnapshot({
  scope,
  claims: [claim("claim-first", "第一批事实", scope, "retracted"), claim("claim-second", "第二批事实")],
});
assert.deepEqual(retracted.activeClaimIds, ["claim-second"], "retraction removes the old claim from the canonical Summary projection");
assert.doesNotMatch(makeSummaryPair(retracted).synchronous.summary, /第一批事实/u);

const jobs = new Map<string, any>();
const enqueue = await enqueueConversationSummaryProjection({
  scope,
  snapshot: cumulativeSnapshot,
  canonicalStateResolved: true,
  now: 200,
  repository: {
    async insertIfAbsent(job: any) {
      const existing = jobs.get(job.jobId);
      if (existing) return { kind: "exists" as const, job: existing };
      jobs.set(job.jobId, job);
      return { kind: "inserted" as const, job };
    },
  },
  scheduleDrain: () => true,
});
assert.equal(enqueue.kind, "inserted");
if (enqueue.kind !== "inserted") throw new Error("expected canonical convergence job");
assert.strictEqual(enqueue.snapshot, cumulativeSnapshot, "enqueue and synchronous write share one final snapshot");
assert.deepEqual(enqueue.job.canonicalRefs, cumulativeSnapshot.activeClaimIds);
assert.doesNotMatch(JSON.stringify(enqueue.job), /第一批事实|第二批事实|message-claim/u, "durable job remains metadata-only");

console.log("direct chat canonical Summary convergence tests passed");
