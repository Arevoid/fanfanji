# Stage 4D-11R — Controlled New Window Validation

Date: 2026-09-11  
Campaign: `campaign-memory-admission-v2-2026-09-10`  
Starting refactor HEAD: `be6f26f163bd4f04cb9f57e42cec162429e98601`  
Stable repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`

## Starting checkpoint

The on-disk Level-1 reviewer and Level-2 campaign reviewer both returned
`status=ok`. The starting authoritative snapshot was:

```text
approved windows 1 / closed windows 1
artifacts 1, sessions 1, scopes 1, batches 1, controls 1, suppressions 0
logical actions 1, physical attempts 2
firstEvidenceDay 2026-09-10, lastEvidenceDay 2026-09-10, distinct days 1
stickyFailure false, allMinimumsSatisfied false, promotionEligible false
```

Actual UTC date was `2026-09-11`; no clock mocking was used.

## Token and pre-approval protocol

Exactly one new governed raw token was generated through the existing dev-only
`createWindowToken()` entry point. It was written to a private ephemeral
developer-side holder and passed an exact roundtrip check before use. The raw
token was never output, logged, committed, persisted to product storage, or
included in any artifact. It was cleared from the holder after closure and is
not recoverable there.

The new deterministic Window fingerprint is
`window-1c673ae85a3ee3ba`, different from the prior lost Window
`window-8817672802574c9a`. The new formal session fingerprint is
`session-51b03d3bc8e9b879`.

The campaign manifest was explicitly updated before extraction with the new
Window approved and the campaign active. The cumulative evidence snapshot was
not increased during pre-approval. No Provider request occurred before that
approval. The Window used the existing Stage4D3 isolated direct-chat scope;
its local scope fingerprint was `scope-e75fd317`, mapped to the existing
promotion scope `promotion-scope-001`.

## Bounded real run

Collector, admission shadow, and safety-veto Canary were enabled only after
Window approval. Canary remained shadow-only and allowlisted only
`SAFETY_VETO_CANCELLED_PLAN`; positive V2 authority was not enabled.

One synthetic message was sent in the isolated `Stage4D3 临时样本` one-to-one
conversation. One and only one real automatic Memory extraction batch was run;
no group, offline, diary, Moments, phone, manual extraction, migration, or
backfill path was used. The extraction used the real Provider pipeline and
completed as a `VALID_CONTROL`:

```text
provider accounting: 1 logical / 2 physical attempts
fallback: yes (existing default-model fallback contract)
candidate: 1 accepted before / 1 accepted after
suppression: false; canaryReason none
exactScope true; provenanceTrusted true; pairUnique true; lineage shared
canonicalWriteObserved true; v2OnlyWrite false
cursorAdvanced true; cursorLoop false; replayLoop false
```

The control path produced one active canonical claim and one projection delta;
no vetoed candidate, summary, or projection was present. The runtime shadow
diagnostic observed one P2 destination-divergence/kind-mismatch observation;
it was not a safety incident, did not fail open, and did not alter canonical
authority.

## Persist-first and Window closure

The exact sanitized collector export was obtained before shutdown and written
without semantic editing to:

`docs/evidence/memory-admission-v2/window-1c673ae85a3ee3ba/2026-09-11__session-51b03d3bc8e9b879.json`

Disk readback, JSON/schema validation, privacy validation, and the strict
Level-1 Window reviewer all succeeded:

```text
status ok; windowCount 1; mixedWindow false
malformed 0; privacy 0; accounting conflicts 0; safety incidents 0
formal sessions 1; exact scopes 1; batches 1; controls 1; suppressions 0
logical 1; physical 2; evidence day 2026-09-11
```

After persistence and review, collector, Canary, and safety shadow were
disabled. The Window was then finished with:

```text
windowStatus closed
closureReason intentional_window_rotation
interruptedRuntimeExcluded true
rawTokenPersisted false
authoritativeEvidence false
```

Closure manifest:

`docs/evidence/memory-admission-v2/window-1c673ae85a3ee3ba/window-closure.json`

## Campaign checkpoint after closure

The campaign manifest was rebuilt from the Level-2 reviewer result, not by
manually adding old and new counters. Both Windows are approved and closed;
the campaign is paused with no active Window.

```text
status ok
approved/closed windows 2 / 2
authoritative artifacts 2
formal sessions 2
promotion scopes 1
batches 2
controls 2; suppressions 0
logical actions 2; physical attempts 4
firstEvidenceDay 2026-09-10
lastEvidenceDay 2026-09-11
distinctEvidenceDays 2
crossWindowCopyCount 0
duplicateWindowCount 0
missingScopeMappingCount 0
conflictingScopeMappingCount 0
unapprovedWindowCount 0
stickyFailure false
allMinimumsSatisfied false
promotionEligible false
```

Threshold progress remains `sessions 2/5`, `suppressions 0/10`, `scopes 1/3`,
`days 2/7`, and `batches 2/20`. This is not `LONG_EVIDENCE_VALIDATED` and no
promotion cutover occurred.

## Security and product invariants

The artifact and Ledger checks found no Prompt text, complete response,
API key, Authorization header, or raw Provider body. Product storage did not
receive the Window token. Provider, Prompt, Memory authority, retry/fallback
policy, storage schema, and user-data behavior were unchanged. The only
product data change was the one explicitly requested isolated test message and
its normal direct-chat response; no production-user data was used.

## Readiness

`CONTROLLED_NEW_WINDOW_REAL_EVIDENCE_VALIDATED` is satisfied for this one
bounded Window. The next recommendation is the already-defined
campaign-governed continuation: repeat the same baseline-review → approved
Window → private holder → bounded session → persist-first → Level-1 → close →
Level-2 checkpoint sequence only after a separate approval. Do not create
another Window in this stage.
