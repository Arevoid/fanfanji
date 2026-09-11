# Stage 4D-11O-R3 — Governed Trigger Revalidation

## Result and stop state

This run was stopped at the explicit R3 hard gate:

`R3_ZERO_CANDIDATE_RUNTIME_REGRESSION` / collector gap — the real automatic
extraction path completed, but the formal Collector export contained zero
records. No evidence was reconstructed from console state and no second
trigger turn was sent.

Starting refactor HEAD was `ac5ca54c238abbd2821301e90a9535cd6f6380b1` and the
stable original baseline remains `f515f7408cfe19da145f15a8ddffceae06e608d`.
No production or runtime source code was changed.

## Fixture preflight

The existing isolated dedicated Direct Chat fixture matched the required
checkpoint before the run:

```text
durable messages 39
eligible messages 18
trigger count 20
distance to trigger 2
next turn triggers true
archive marker present and found in loaded scope
Memory count 0
exact scope healthy
in-flight false; cooldown false
```

All retained history, including earlier user-only failed turns, was left in
place. No reset, replacement bootstrap, deletion, edit, manual message, raw
database operation, marker rewind, or cursor manipulation was performed.

## Campaign and Window

The persisted preflight for
`campaign-memory-admission-v2-2026-09-10` was verified as:

```text
approved / closed windows 3 / 3
authoritative artifacts 2
formal sessions 2
promotion scopes 1
batches 2; controls 2; suppressions 0
zeroCandidateBatchCount 0
logical / physical 2 / 4
distinct UTC days 2
stickyFailure false; promotionEligible false
```

A new developer-held Window was started with a governed token. Its reviewer-
safe identity is `window-d3ece74319ea2f4d`; it was not the closed RG1 Window
`window-1352524908ffd837`. The raw token was held only in page memory, was not
logged, persisted, exported, sent to the Provider, or written to this
repository. Collector, admission Shadow, and Safety-veto Canary were enabled
only for this bounded run; Canary authority remained shadow-only.

## Exactly one trigger turn

One ordinary, low-risk synthetic Direct Chat turn was sent. The Direct Reply
completed with the expected lifecycle:

```text
initial_parse_success → candidate_created → delivery_success
```

One assistant bubble was delivered, the composer returned to idle, and no
duplicate user or assistant bubble was observed. The trigger `chat_reply`
accounting was one physical Provider attempt with no retry or fallback. The
Provider metadata remained the configured server-proxy / selected model path;
no secret or request body was captured.

The durable message snapshot advanced from 39 to 41 records. The post-turn
Inspector was healthy with the cursor/marker present, eligible count 0,
distance 20, no in-flight/cooldown state, and no next-turn trigger. Memory
vault count remained 0. No second turn was allowed.

## Automatic extraction and blocker

The production automatic extraction path did run after the trigger. Ledger
metadata contained one `memory_extract` logical action represented by two
physical backend-proxy attempts: the default extraction model attempt failed,
then the selected model attempt succeeded. No raw Provider response, Prompt,
message text, key, or Authorization value was recorded.

The formal Collector, however, remained empty:

```text
recordCount 0
formalWindowRecordCount 0
admission Shadow observations 0
Safety-veto Canary observations 0
```

Because R3 requires `recordCount >= 1` for either candidate evidence or a
`ZERO_CANDIDATE_BATCH`, no candidate count, record kind, classification,
Bridge/Safety/Canary evidence, canonical delta, or extraction artifact was
claimed. `extractNow()` was not called. No candidate, control, suppression, or
zero batch was fabricated. This is a collection/runtime instrumentation gap,
not a basis for changing Memory authority or replaying the trigger.

The likely seam to diagnose in a future separately approved run is that the
dev global observer was enabled after the app had already mounted/reloaded;
the formal hook may therefore have retained a different module instance.
This report does not patch that seam and does not repeat the trigger.

## Closure and Campaign checkpoint

The Window was stopped and closed as a non-success governance closure:

```text
windowStatus closed_unrecoverable
closureReason collector_gap
authoritativeArtifactCount 0
rawTokenPersisted false
interruptedRuntimeExcluded true
safety/privacy/accounting counts 0 / 0 / 0
```

Closure metadata is at:

`docs/evidence/memory-admission-v2/window-d3ece74319ea2f4d/window-closure.json`

No artifact file was created because persist-first could not begin without a
non-empty Collector export. The campaign manifest now records the explicit
approved/closed Window for audit continuity. A persisted Level-2 recompute
returned:

```text
status ok; approved / closed 4 / 4
authoritative artifacts 2; sessions 2; promotion scopes 1
batches 2; controls 2; suppressions 0; zeroCandidateBatchCount 0
logical / physical 2 / 4; distinct UTC days 2
stickyFailure false; promotionEligible false
```

The collector-gap Window contributes no authoritative artifact, session,
batch, scope, control, suppression, or evidence day. It does not clear or
alter the existing campaign safety/accounting state.

## Reload and readiness

The R3 reload checkpoint was **not run**. R3 requires successful extraction,
non-empty persist-first artifact, disk readback, and formal review before the
post-closure reload. The explicit collector hard stop occurred first, so no
retrigger or duplicate extraction claim is made.

Readiness: `R3_ZERO_CANDIDATE_RUNTIME_REGRESSION` (not
`GOVERNED_TRIGGER_REVALIDATION_PASSED`). The next step is a separately
approved instrumentation/runtime recovery run that enables the current
Collector seam before the app invokes automatic extraction; it must preserve
this closed Window and must not replay this trigger. RG2 and Phase 2 remain
out of scope.

