import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryProjectionJob } from "../src/domain/memory/memoryProjectionJob";
import { deriveCanonicalClaimSetRevision } from "../src/domain/memory/memoryCanonicalRevision";
import type { MemoryProjectionJob } from "../src/domain/memory/memoryProjectionJob";
import type { MemoryProcessingScope } from "../src/domain/memory/memorySourceProcessingCursor";
import type { CharacterRelationship } from "../src/domain/relationship/characterRelationship";
import type { ConversationSummaryRecord, KnowledgeClaim } from "../src/domain/characterKnowledge/characterKnowledgeTypes";
import {
  discoverBoundedMemoryProjectionScopes,
  MEMORY_PROJECTION_STARTUP_SCOPE_CAP,
  reconcileMemoryProjectionJobsOnStartup,
} from "../src/core/memory/memoryProjectionStartupReconciliation";

const startupSource = readFileSync(new URL("../src/core/memory/memoryProjectionStartupReconciliation.ts", import.meta.url), "utf8");
assert.doesNotMatch(startupSource, /loadMessages|apiChat|fetch\s*\(/u, "startup reconciliation does not read transcript or call a Provider");

class FakeRepository {
  readonly jobs = new Map<string, MemoryProjectionJob>();
  unavailable = false;
  forceInsertConflict = false;

  async listByScope(scope: MemoryProcessingScope, projectionKind?: MemoryProjectionJob["projectionKind"]): Promise<MemoryProjectionJob[]> {
    if (this.unavailable) throw new Error("unavailable");
    return [...this.jobs.values()].filter((job) => job.scope.characterId === scope.characterId
      && job.scope.relationId === scope.relationId
      && job.scope.userIdentityId === scope.userIdentityId
      && job.scope.conversationId === scope.conversationId
      && (!projectionKind || job.projectionKind === projectionKind));
  }

  async insertIfAbsent(job: MemoryProjectionJob): Promise<{ kind: "inserted" | "exists"; job: MemoryProjectionJob }> {
    if (this.unavailable) throw new Error("unavailable");
    const existing = this.jobs.get(job.jobId);
    if (existing) return { kind: "exists", job: existing };
    if (this.forceInsertConflict) {
      this.jobs.set(job.jobId, job);
      return { kind: "exists", job };
    }
    this.jobs.set(job.jobId, job);
    return { kind: "inserted", job };
  }
}

const relation = (scope: MemoryProcessingScope, updatedAt: number, isGroup = false): CharacterRelationship => ({
  id: scope.relationId,
  characterId: scope.characterId,
  userIdentityId: scope.userIdentityId,
  conversationId: isGroup ? `group:${scope.characterId}` : scope.conversationId,
  relationship: "friend",
  createdAt: updatedAt,
  updatedAt,
  lastActiveTime: updatedAt,
});

const claim = (scope: MemoryProcessingScope, id: string, statement = "A stable fact"): KnowledgeClaim => ({
  ...scope,
  id,
  kind: "fact",
  subject: "user",
  statement,
  truthStatus: "asserted",
  temporalStatus: "present",
  source: { kind: "manual", authorship: "user", producer: "test", evidenceKey: id },
  confidence: 1,
  userConfirmed: true,
  recordedAt: 10,
  status: "active",
  visibility: "relation_private",
  schemaVersion: 1,
});

const baseScope: MemoryProcessingScope = {
  characterId: "character-startup",
  relationId: "relation-startup",
  userIdentityId: "identity-startup",
  conversationId: "direct:relation-startup",
};
const baseClaim = claim(baseScope, "claim-startup");
const chars = [{ id: baseScope.characterId, isGroupChat: false }];
const identities = [{ id: baseScope.userIdentityId, kind: "primary", name: "test", avatar: "", createdAt: 1 } as never];
const baseRelationship = relation(baseScope, 100);

const summary = (scope: MemoryProcessingScope, status: ConversationSummaryRecord["status"], sourceClaimIds: string[], canonicalRevision?: string) => ({
  ...scope,
  id: `summary-${scope.relationId}`,
  summary: "metadata only",
  sourceMessageIds: [],
  sourceClaimIds,
  generatedAt: 100,
  generator: "test",
  projectionVersion: 1,
  status,
  schemaVersion: 1,
  ...(canonicalRevision ? { canonicalRevision } : {}),
}) as ConversationSummaryRecord;

let repository = new FakeRepository();
let result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [], summaries: [], now: 200, repository,
});
assert.equal(result.noActiveClaims, 1);
assert.equal(result.createdJobs, 0);

const revision = deriveCanonicalClaimSetRevision({ scope: baseScope, claims: [baseClaim] }).revision;
repository = new FakeRepository();
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [baseClaim], summaries: [summary(baseScope, "active", [baseClaim.id], revision)], now: 200, repository,
});
assert.equal(result.current, 1, "matching revision and exact refs do not create a job");

for (const status of [undefined, "stale", "active"] as const) {
  repository = new FakeRepository();
  result = await reconcileMemoryProjectionJobsOnStartup({
    relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
    claims: [baseClaim], summaries: status ? [summary(baseScope, status, ["old-claim"])] : [], now: 200, repository,
  });
  assert.equal(result.createdJobs, 1, status ? `${status} summary schedules bounded rebuild` : "missing summary schedules job");
}

repository = new FakeRepository();
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [baseClaim], summaries: [], now: 200, repository,
});
assert.equal(result.createdJobs, 1);
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [baseClaim], summaries: [], now: 200, repository,
});
assert.equal(result.createdJobs, 0);
assert.equal(result.alreadyScheduled, 1, "second startup is idempotent");

const completedJob = [...repository.jobs.values()][0];
assert.ok(completedJob);
repository.jobs.set(completedJob.jobId, { ...completedJob, status: "completed", version: 2, completedAt: 201, updatedAt: 201 });
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [baseClaim], summaries: [], now: 200, repository,
});
assert.equal(result.alreadyScheduled, 1, "completed same revision remains deduplicated");

repository = new FakeRepository();
repository.forceInsertConflict = true;
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [baseClaim], summaries: [], now: 200, repository,
});
assert.equal(result.databaseAvailable, true);
assert.equal(result.insertConflicts, 1, "insert conflict is a bounded diagnostic, not a startup failure");

repository = new FakeRepository();
const changedClaim = claim(baseScope, "claim-startup", "A changed stable fact");
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [changedClaim], summaries: [], now: 210, repository,
});
assert.equal(result.createdJobs, 1, "canonical revision change creates a new identity");

const secondScope = { ...baseScope, characterId: "character-second", relationId: "relation-second", conversationId: "direct:relation-second" };
const thirdScope = { ...baseScope, characterId: "character-third", relationId: "relation-third", conversationId: "direct:relation-third" };
const bounded = discoverBoundedMemoryProjectionScopes({
  relationships: [relation(baseScope, 100), relation(secondScope, 200), relation(thirdScope, 300), relation({ ...baseScope, relationId: "group-relation", conversationId: "group-relation" }, 400, true)],
  characters: [{ id: baseScope.characterId, isGroupChat: false }, { id: secondScope.characterId, isGroupChat: false }, { id: thirdScope.characterId, isGroupChat: false }],
  activeIdentityId: baseScope.userIdentityId, identities, maxScopes: 2,
});
assert.equal(bounded.length, 2);
assert.equal(bounded[0]?.relationId, thirdScope.relationId);
assert.ok(bounded.every((scope) => !scope.conversationId.startsWith("group:")));
assert.equal(MEMORY_PROJECTION_STARTUP_SCOPE_CAP, 20);

repository = new FakeRepository();
repository.unavailable = true;
result = await reconcileMemoryProjectionJobsOnStartup({
  relationships: [baseRelationship], characters: chars, activeIdentityId: baseScope.userIdentityId, identities,
  claims: [baseClaim], summaries: [], now: 200, repository,
});
assert.equal(result.databaseAvailable, false, "DB failure is fail-open");
assert.equal(result.createdJobs, 0);

console.log("memory projection startup reconciliation tests passed");
