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

The existing synchronous batch Summary remains produced by the existing builder
and still uses the extracted batch claims. It now carries the final canonical
revision when the post-append claim read succeeds; this is additive metadata and
requires no migration. The durable projection uses the final canonical scope.
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

Consequently the shadow phase is not a cutover approval. Existing batch Summary
and full-canonical background projection can differ in source scope, so runtime
mismatch metadata remains possible and must be resolved/characterized before a
future Normal Direct Chat cutover. The future policy recommendation is:

```text
try durable enqueue
if unavailable: retain synchronous Summary fallback
cursor semantics remain conservative until the fallback and reader timing are approved
```

The localStorage/IndexedDB boundary is not atomic. Startup reconciliation stays
in place, and no Group, Offline, Manual Archive, Admission, Prompt, Provider,
or Memory read switch is included here.
