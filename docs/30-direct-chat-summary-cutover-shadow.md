# Direct Chat Summary Cutover Shadow

Stage 4C-14 adds real-time enqueue and shadow comparison without removing the
existing synchronous Summary write. After Direct Chat canonical claims commit,
the hook reloads the final localStorage claim snapshot once, derives its exact
scope revision and active refs, and calls `insertIfAbsent` for a deterministic
`conversation_summary` job. IndexedDB failure is diagnostic-only; the existing
Summary write and cursor behavior continue, and startup reconciliation remains
the recovery path.

The enqueue result (`inserted` or `exists`) schedules one coalesced, zero-delay,
fire-and-forget drain. There is no polling and no per-job timer. The drain keeps
the Stage 4C-13 cap of five jobs and does not retry failed jobs automatically.

At the end of the Stage 4C-14 shadow phase the existing synchronous Summary
still used the extracted batch claims, while the durable projection used the
final canonical scope. Stage 4C-15 resolves that specific input mismatch for
ordinary automatic Direct Chat: after the canonical append, one final exact-
scope snapshot is shared by the synchronous Summary, enqueue metadata and the
shadow preview. Manual archive remains on its historical batch-local path.
The pure equivalence comparator checks exact scope, normalized Summary text,
source IDs, status, projection version, canonical revision and schema version.
Generator names are compared by Summary semantic family, IDs are intentionally
ignored, and `generatedAt` is reported as a bounded delta rather than a mismatch.
Diagnostics contain only mismatch field names and timing; no Summary text or
claim statements are persisted.

The reader audit found that `CharacterMemoryRepository` supplies Direct Chat
Truth/context and regeneration retrieval. It keeps canonical claims readable
when a derived Summary is missing, and drops stale/mismatched Summary records
without blocking or triggering a second rebuild. AppChat also reads summaries
for group/offline/manual UI flows; AppMemory is a manual management reader;
Offline, migration and deletion code have separate maintenance reads. This
stage does not change any of those readers.

This convergence is still not a final background cutover approval. The
synchronous write, cursor behavior and fail-open IndexedDB boundary remain in
place; the durable projection can still be unavailable and startup
reconciliation remains recovery. The exact contract and evidence are recorded
in `docs/31-direct-chat-summary-canonical-convergence.md`.

The recovery policy remains:

```text
try durable enqueue
if unavailable: retain synchronous Summary fallback
cursor semantics remain conservative until the fallback and reader timing are approved
```

The localStorage/IndexedDB boundary is not atomic. Startup reconciliation stays
in place, and no Group, Offline, Manual Archive, Admission, Prompt, Provider,
or Memory read switch is included here.
