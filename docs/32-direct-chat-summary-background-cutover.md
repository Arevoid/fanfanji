# Stage 4C-16 — Normal Direct Chat Summary Background Cutover

## Cutover seam

Only the automatic one-to-one path in
`src/features/chat/hooks/useChatMemoryExtraction.ts` uses this policy.
`MemoryWriteCoordinator` remains a shared synchronous-summary coordinator for
other callers, including Manual Archive and Group/Offline flows.

After canonical claims are committed, the path resolves the final canonical
snapshot once and waits only for the durable enqueue outcome:

```text
canonical commit
  -> final canonical snapshot
  -> durable enqueue
     inserted / exists: no synchronous Summary write
     unavailable: synchronous canonical Snapshot fallback
```

`no_active_claims` is a successful no-op projection outcome: no empty Summary
or durable job is created, and the source cursor may advance after the
canonical intake has completed. If the final repository read is invalid, no
Summary is fabricated and the cursor is held.

## Cursor contract

For automatic Direct Chat only:

| Outcome | Sync Summary | Cursor |
| --- | ---: | ---: |
| canonical commit failed | 0 | hold |
| enqueue inserted | 0 | advance |
| enqueue exists | 0 | advance |
| enqueue unavailable + canonical fallback succeeds | 1 | advance |
| enqueue unavailable + fallback fails | 1 attempted | hold |
| final canonical snapshot unavailable | 0 | hold |
| zero candidates / no active claims | 0 | advance |

The cursor means source messages were safely processed through canonical
memory intake. It no longer means that ConversationSummary has completed.
Canonical Truth is never rolled back when a derived fallback or background
projection fails.

## Failure and recovery

The localStorage canonical store and IndexedDB job store are not atomic. The
system remains at-least-once with deterministic idempotency and bounded
eventual recovery:

- startup reconciliation repairs a crash before durable enqueue;
- deterministic job identity and `insertIfAbsent` prevent duplicate logical jobs;
- lease/CAS fencing and currentness checks protect runner concurrency;
- a crash after cursor advancement is recoverable because the durable job
  survives restart;
- a failed background Summary never rolls back Truth or the cursor.

No polling, infinite worker, per-job timer, or automatic failed-job retry
system was added.

## Diagnostics and privacy

The pure cutover policy exposes metadata-only outcomes:
`DURABLE_PROJECTION_INSERTED`, `DURABLE_PROJECTION_EXISTS`,
`DURABLE_PROJECTION_UNAVAILABLE_SYNC_FALLBACK`, `SYNC_FALLBACK_SUCCEEDED`,
`SYNC_FALLBACK_FAILED`, `CANONICAL_SNAPSHOT_UNAVAILABLE`,
`NO_ACTIVE_CANONICAL_CLAIMS`, and `ZERO_CANDIDATES`.

No Summary body, claim statement, transcript, Prompt, response, API key or
Authorization value is written to projection metadata or diagnostics.

## Non-goals

Prompt/provider behavior, token budgets, Admission, legacy Memory, Manual
Archive, Group, Offline, Diary, Moments, Forum, Music, Reading, proactive jobs,
and UI behavior are outside this cutover. Browser smoke remains a separate
verification gate if the environment is unavailable.
