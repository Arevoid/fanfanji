# ConversationSummary Background Projection Executor

Stage 4C-13 adds the first bounded durable projection execution. It executes only `conversation_summary` jobs and intentionally leaves the existing synchronous Direct Chat bundle in place.

## Execution lifecycle

`runPendingConversationSummaryProjections` performs one drain of at most five jobs, oldest first (`createdAt`, then `updatedAt`, then `jobId`). It reclaims at most five expired `conversation_summary` leases, queries pending `conversation_summary` jobs, acquires each pending job with `markRunning(expectedVersion)`, and executes only the lease winner. The lease duration is 45 seconds and the owner is a runtime-scoped governed application ID; it is not part of job identity and contains no user data.

Claims and summaries are loaded once per non-empty drain. The executor validates exact scope, canonical claim references and a fresh canonical revision before building a Summary. It aggregates source message IDs only from claim provenance; it never reads a transcript, prompt, AI response or legacy `MemoryItem`. The existing `conversationSummaryService.ts` builder and `conversationSummaryRepository.appendMany` are reused. No Provider call is made.

## Idempotency and crash recovery

The write order is:

```text
lease acquired
→ validate R1 and exact refs
→ if an active Summary has matching canonicalRevision and sourceClaimIds, skip write
→ otherwise write Summary
→ CAS markCompleted
```

`ConversationSummaryRecord.canonicalRevision` is an additive optional field. Old records remain valid and require no migration. New projection records store the canonical revision alongside existing `projectionVersion`; the two fields have different meanings. Existing summaries without the field remain currentness-unknown and may receive a bounded rebuild descriptor.

If Summary writing succeeds but completion is lost, the next drain sees the matching metadata and completes the job without another write. If completion CAS conflicts after a successful write, the runner records a bounded conflict and does not overwrite the competing state. This is at-least-once execution with idempotent projection writes, not exactly-once execution.

## Failure policy

- `CANONICAL_MISSING`: a referenced claim or required source provenance is unavailable.
- `SCOPE_MISMATCH`: a referenced claim is not in the exact job scope.
- `CANONICAL_REVISION_CHANGED`: current claims are R2 while the job carries R1, or no active claims remain.
- `SUMMARY_WRITE_FAILED`: the existing Summary repository rejects or throws.

Failures are persisted through versioned `markFailed`; a failed job is not automatically retried by this one-shot runner. Failed-to-pending retry remains a future explicit policy. Legacy mirror jobs are ignored. No active claims never produces an empty Summary.

## Production integration and overlap boundary

The existing App startup seam schedules reconciliation, then a short-delayed one-shot drain. It does not block the first screen, show a spinner/toast, or expose projection failures to users. At the Stage 4C-13 boundary, new claims created during an already-open session could wait until a later startup reconciliation. Stage 4C-14 adds the separate Direct Chat real-time enqueue seam; this document remains the executor baseline, while its shadow/cutover rules are recorded in `docs/30-direct-chat-summary-cutover-shadow.md`.

During this overlap period, synchronous Summary creation and a durable background job may both exist. Idempotent metadata-aware writes make that safe. `MemoryWriteCoordinator`, Direct Chat cursor behavior, Offline behavior, Admission, Prompt and Provider paths are unchanged.

## Storage and privacy

The only new production writes are existing Summary records through `conversationSummaryRepository` and status/lease transitions in `FanfanjiMemoryProjectionDB`. No new user-data schema or migration is introduced. Job and diagnostics metadata contain no prompt, transcript, API key, full response or evidence quote. Existing localStorage whole-array race limitations remain; job CAS prevents duplicate logical executors, but does not create cross-store atomicity.
