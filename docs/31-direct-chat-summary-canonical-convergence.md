# Stage 4C-15 — Direct Chat Summary Canonical Convergence

## Decision

For ordinary automatic one-to-one Direct Chat, Summary V2 is formally defined
as an exact-scope, current-canonical, rebuildable projection of active
`KnowledgeClaim` records. The canonical Truth claim set remains authoritative;
Summary is derived and may be absent or stale without hiding Truth.

This stage converges the synchronous Summary input with the durable background
projection input. It does not perform the background cutover: the synchronous
write, existing extraction result, cursor updates, and fail-open storage
behavior remain in place.

## One final snapshot

After canonical claims are appended, the automatic Direct Chat path loads the
final localStorage claim repository once and builds one in-memory
`CanonicalMemoryCommitSnapshot` containing:

- exact `characterId`, `relationId`, `userIdentityId`, `conversationId` scope;
- all active claims in that scope, with deterministic IDs;
- sorted active claim IDs and source message IDs;
- the bounded canonical revision fingerprint.

The same snapshot is used for the synchronous Summary builder, durable enqueue
identity and shadow equivalence preview. No prompt, transcript, full response,
API key or authorization value is placed in the durable job. The background
executor rebuilds the equivalent snapshot from the repository at execution and
rejects scope/revision/reference changes.

If the final claim read is invalid or unavailable, the existing batch-local
Summary fallback is retained and the durable enqueue fails open. A later
startup reconciliation can recreate the pending projection intent. IndexedDB
failure cannot fail the user-facing memory write.

## Semantic evidence

1. `CharacterMemoryRepository` reads Truth independently and suppresses stale,
   mismatched or inactive Summary records; missing Summary does not block Truth.
2. Canonical revision and active source references already define Summary
   currentness, so a full exact-scope claim projection is the stable rebuild
   boundary.
3. The projection builder is shared and provider-free. It filters exact scope,
   active status and deterministic semantic ordering.
4. Repository append/dedupe makes a second extraction batch a cumulative
   canonical state rather than an isolated Summary authority.
5. Retract/supersede changes the canonical revision and active references; old
   Summary records therefore cannot remain current.

## Contract matrix

| Case | Required behavior |
| --- | --- |
| First batch | Sync and durable inputs contain the same exact-scope active claims. |
| Second batch | Summary is rebuilt from the cumulative canonical set, not only the new batch. |
| Duplicate candidate | Same canonical revision and job identity; no duplicate projection intent. |
| Retract/supersede | Old claim leaves active refs; new revision creates a new deterministic job. |
| Other relation/character | Excluded by exact scope and cannot enter the Summary. |
| Deterministic ordering | IDs, source message IDs and Summary claim order are stable. |
| Pending projection | Truth remains readable while Summary is missing or pending. |
| Stale Summary | Canonical Truth wins; stale/mismatched Summary is suppressed. |
| Database unavailable | Sync write succeeds or reports its existing Summary failure; enqueue is diagnostic-only and startup reconciliation remains recovery. |
| Cursor contract | No cursor field or marker is changed by this stage; existing conservative advancement rules remain. |

## Crash and failure boundaries

The two stores are not atomically committed. The existing order remains:

```text
canonical claims append
  -> best-effort enqueue/snapshot preparation
  -> synchronous Summary append
  -> existing archive marker/cursor update
```

If the canonical append fails, no derived write or cursor advancement occurs.
If the Summary append fails, the existing hook does not advance its archive
marker. If enqueue or IndexedDB fails, the synchronous path is unaffected and
startup reconciliation can recreate projection intent. A crash between stores
is therefore recoverable but not exactly-once.

## Scope isolation and non-goals

The snapshot is installed only for normal automatic Direct Chat. Manual Archive,
Group Chat, Offline, proactive jobs, Moments, Diary, Forum, Reading, voice,
image generation, Prompt/Provider behavior, Admission, Memory read switching,
cursor migration and legacy retirement are unchanged. `parentActionId` lineage
across follow-up background work remains a documented future gap.

## Cutover decision

The normal Direct Chat synchronous and background Summary production inputs are
now equivalent when the final canonical read succeeds. The durable projection
is still best-effort and can be pending/unavailable; the next stage may design
the normal Direct Chat background cutover only after separately approving its
cursor/read-switch and operational failure contract. This stage itself stops
here and does not execute that cutover.
