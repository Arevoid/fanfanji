# Memory Projection Durable Repository and Startup Reconciliation

Stage 4C-12 establishes durable metadata for future memory projections. It does not execute a projection.

## Storage contract

- Database: `FanfanjiMemoryProjectionDB`
- Version: `1`
- Object store: `memory_projection_jobs`, keyed by deterministic `jobId`
- Indexes: `status`, `scopeKey`, `projectionKind`, `leaseUntil`, `updatedAt`
- Scope key: the encoded exact tuple `characterId | relationId | userIdentityId | conversationId`
- Stored fields: IDs, exact scope, canonical claim IDs, canonical revision, projection kind, status, attempt/version, lease and timestamps, plus bounded error code

This is a new empty database. Existing `KnowledgeClaim` and `ConversationSummary` records remain in their current localStorage buckets. No claims, summaries, MemoryItems, relationships or messages are migrated or rewritten.

## Repository behavior

`src/core/storage/repositories/memoryProjectionJobRepository.ts` adapts the Stage 4C-11 job contract to IndexedDB. `insertIfAbsent` performs lookup/add in one readwrite transaction. `compareAndSet` and all state transitions perform read, version validation and put in one readwrite transaction; stale versions return `conflict`. Lease reclaim uses a running-status cursor in one transaction and fences on the persisted lease/version state. Normal concurrency returns `exists`, `conflict` or `not_found`; storage failures are bounded errors and are never persisted into a job.

The record is intentionally metadata-only. It contains no statement, prompt, transcript, response, evidence quote, API key or authorization value.

## Startup reconciliation

`reconcileMemoryProjectionJobsOnStartup` is scheduled from the existing React app startup seam after the app can render. It discovers at most 20 recent direct scopes for the active identity workspace, limited to currently loaded non-group characters. Claims and summaries are each loaded once, then filtered by exact scope in memory. It derives revisions through `memoryCanonicalRevision.ts`, checks summary metadata, queries durable jobs and inserts at most one deterministic `conversation_summary` pending job per missing revision.

It never reads a transcript, calls a Provider, changes a summary, executes a job, retries failed jobs, reclaims running jobs, creates a legacy mirror job, or changes Direct Chat/Offline behavior. An unavailable or blocked IndexedDB causes a fail-open diagnostic; existing localStorage Memory behavior remains authoritative.

The startup pass is bounded and idempotent. A matching revision is current when summary metadata explicitly carries the revision and exact active claim references. Existing summaries without that field are `currentness unknown`, so a safe pending descriptor may be created; the descriptor is not executed. A changed canonical revision creates a new deterministic job while retaining the old record. This is an at-least-once foundation, not exactly-once execution.

## Recovery boundary

The repository makes job metadata survive refresh/restart. Startup reconciliation provides eventual recovery for the cross-store crash gap:

```text
canonical commit survived
+ app later starts successfully
+ scope is in the bounded discovery set
→ missing projection intent is recreated
```

This is not an atomic localStorage/IndexedDB transaction and is not an exactly-once guarantee. Projection execution, worker/scheduler policy, cursor migration and Admission cutover remain outside this stage.
