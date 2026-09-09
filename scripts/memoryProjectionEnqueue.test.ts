import assert from "node:assert/strict";
import type { KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";
import { deriveCanonicalClaimSetRevision } from "../src/domain/memory/memoryCanonicalRevision";
import { enqueueConversationSummaryProjection } from "../src/core/memory/memoryProjectionEnqueue";

const scope: MemoryProcessingScope = {
  characterId: "character-enqueue",
  relationId: "relation-enqueue",
  userIdentityId: "identity-enqueue",
  conversationId: "direct:relation-enqueue",
};

const claim = (id: string, statement = id): KnowledgeClaim => ({
  ...scope,
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
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});

const claims = [claim("claim-a")];
const jobs = new Map<string, any>();
let drainSignals = 0;
const repository = {
  async insertIfAbsent(job: any) {
    const existing = jobs.get(job.jobId);
    if (existing) return { kind: "exists" as const, job: existing };
    jobs.set(job.jobId, job);
    return { kind: "inserted" as const, job };
  },
};

const inserted = await enqueueConversationSummaryProjection({
  scope,
  claims,
  canonicalStateResolved: true,
  now: 100,
  repository,
  scheduleDrain: () => { drainSignals += 1; return true; },
});
assert.equal(inserted.kind, "inserted");
assert.equal(drainSignals, 1);
if (inserted.kind !== "inserted") throw new Error("expected inserted job");
const revisionA = deriveCanonicalClaimSetRevision({ scope, claims });
assert.equal(inserted.job.canonicalRevision, revisionA.revision);
assert.deepEqual(inserted.job.canonicalRefs, revisionA.activeClaimIds);
assert.doesNotMatch(JSON.stringify(inserted.job), /statement|message-claim-a/u, "job metadata contains no claim body or message body");

const duplicate = await enqueueConversationSummaryProjection({
  scope,
  claims,
  canonicalStateResolved: true,
  now: 101,
  repository,
  scheduleDrain: () => { drainSignals += 1; return true; },
});
assert.equal(duplicate.kind, "exists");
assert.equal(jobs.size, 1, "same canonical revision is insertIfAbsent idempotent");
assert.equal(drainSignals, 2);

const changedClaims = [claim("claim-a", "changed")];
const changed = await enqueueConversationSummaryProjection({
  scope,
  claims: changedClaims,
  canonicalStateResolved: true,
  now: 102,
  repository,
  scheduleDrain: () => { drainSignals += 1; return true; },
});
assert.equal(changed.kind, "inserted");
assert.equal(jobs.size, 2, "canonical revision change creates a distinct logical job");

const noActiveClaims = await enqueueConversationSummaryProjection({
  scope,
  claims: [{ ...claim("retracted"), status: "retracted" }],
  canonicalStateResolved: true,
  repository,
  scheduleDrain: () => { drainSignals += 1; return true; },
});
assert.deepEqual(noActiveClaims, { kind: "no_active_claims" });

const unavailable = await enqueueConversationSummaryProjection({
  scope,
  claims,
  canonicalStateResolved: false,
  repository,
  scheduleDrain: () => { drainSignals += 1; return true; },
});
assert.equal(unavailable.kind, "unavailable");

const dbFailure = await enqueueConversationSummaryProjection({
  scope,
  claims,
  canonicalStateResolved: true,
  repository: { insertIfAbsent: async () => { throw new Error("idb unavailable"); } },
  scheduleDrain: () => { drainSignals += 1; return true; },
});
assert.equal(dbFailure.kind, "unavailable");

console.log("memory projection realtime enqueue tests passed");
