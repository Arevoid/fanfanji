# Stage 4D-11N — Bounded Local Long-Evidence Collection — Window Day 1

## Status and stop state

This Day 1 run is **blocked before formal-window start**. The refactor
worktree was inspected at `28d64a9218a34f6f3fcc8a7627c59a41cff38b9d`; the
stable original repository remains at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

Readiness is therefore:

`LONG_EVIDENCE_COLLECTION_BLOCKED`

No formal window token was created or retained, no formal session was started,
and no Day 1 checkpoint or formal evidence record exists. This document does
not claim long-evidence completion or authorize Phase 2.

## Runtime audit

The refactor Vite development server was running at `http://localhost:3000/`
from the refactor worktree. The isolated `Stage4D3` Direct Chat fixture was
opened in the local browser. One previously approved natural Direct Chat turn
completed normally through the real Provider: the user bubble appeared once,
one assistant reply appeared, loading ended, and no duplicate delivery was
observed. No backup or production user data was used, and the fixture was not
cleared.

The formal Memory extraction trigger was not invoked. No `memory_extract`
formal evidence, suppression, control, or `real_runtime` long-evidence record
was produced.

## Blocking structural gap

`src/features/chat/services/directChatMemoryLongEvidenceCollector.ts` is still
a standalone, in-memory observer. A repository-wide source audit found no
runtime caller of `recordDirectChatMemoryLongEvidence()` and no import that
installs its dev API in the application entry path. The existing AppChat
`extractNow()` trigger only runs the established observation-only extraction
path and exposes bounded Admission Shadow diagnostics; it does not create a
long-evidence record.

Consequently a real Provider extraction cannot currently be joined to the
formal window/session/batch/evidence fingerprints, authoritative Ledger
accounting, and exact-scope canonical readback required by 4D-11N. Adding a
single global import would expose controls but would not supply the required
recording seam or the canonical readback/accounting contract. Completing that
connection is a design/integration change, not a safe evidence-only action, so
collection stops here rather than using handcrafted DTOs or synthetic records.

## Evidence and privacy

- Formal window/session/scope/batch/suppression/control counts: **0**.
- Formal evidence days and checkpoint summary: **none**.
- Provider/Prompt/Memory/Writer behavior: unchanged.
- No Prompt text, message text, candidate statement, raw ID, token, response,
  API key, Authorization header, or raw Provider body was exported.
- No canonical Memory, Summary, Projection, cursor, or user data was changed
  by this blocked run.
- The existing Canary and collector were not enabled for formal collection.

## Required follow-up before the next collection attempt

First design and separately approve a minimal dev-only integration seam that
receives the real extraction result, current Bridge/Safety metadata, canonical
readback, and authoritative AI Ledger accounting as one bounded observation.
That seam must remain fail-open, metadata-only, automatic one-to-one Direct
Chat only, and must not alter Prompt, Provider, retry/fallback, canonical
authority, or storage behavior. After that seam is tested, a new 4D-11N run may
create a fresh developer-held token and start Day 1.

Until then, the correct state remains `LONG_EVIDENCE_COLLECTION_BLOCKED`.

## Historical status after 4D-11N-R1

The structural gap above is retained as the historical reason that the original
4D-11N attempt stopped. Stage 4D-11N-R1 adds and tests a separate, dev-only
observation seam in `directChatMemoryLongEvidenceRuntime.ts`; it does not start
formal Day 1, create a formal token, or alter this document's prior evidence
counts. The R1 seam must be reviewed in its own report before any bounded local
window is opened.

## R2 Actual Day 1

This section records the first bounded **formal** local window after the R1
runtime seam was validated. The historical blocked attempt above is retained
unchanged; this section does not claim long-evidence completion or authorize
Phase 2.

### Run boundary and identity

- Starting refactor HEAD: `d4d9a1ce05f5510b7a66956d78263e11546e0bb3`.
- Formal window start: this bounded local run on UTC evidence day
  `2026-09-10`; the collector intentionally retains only the UTC evidence day
  and reviewer fingerprints, not a wall-clock start timestamp.
- Stable original repository remained at `f515f7408cfe19da145f15a8ddffceae06e608d`.
- A fresh developer-held window token was created in the local dev page and
  was never exported, persisted, or logged. Only its reviewer fingerprint was
  retained in evidence: `window-8817672802574c9a`.
- One formal session produced one authoritative observation. Its sanitized
  fingerprint is `session-1df2c8bbdcd05b15`.
- The run used only the isolated `Stage4D3 临时样本` automatic one-to-one
  Direct Chat fixture. No group, manual, diary, Moments, phone, migration,
  backfill, production user data, or backup was used.

### Actual bounded activity

- One short synthetic local test turn was sent through the real Provider so
  the fixture had a real message boundary; the UI returned to its normal send
  state with two ordered assistant bubbles and no duplicate user/reply.
- One formal `extractNow()` batch then ran through the real Provider extraction
  path and the existing fallback. No mock DTO, handcrafted bridge result, or
  fake canonical readback was used.
- Formal batch identity: `batch-b9c40c91`; evidence identity:
  `evidence-901c1008d2439e06`.
- The natural result was a control (`VALID_CONTROL`), not a suppression:
  validator `deny_veto`, bridge `route`, correlation `shared_unique`, shared
  lineage, exact scope, trusted provenance, and `v2_model_native` metadata.
  The only enabled Canary reason remained
  `SAFETY_VETO_CANCELLED_PLAN`; no synthetic or forced suppression was added.

### Sanitized Day 1 checkpoint

The following is the saved metadata-only checkpoint. It contains no prompt,
message, candidate statement, response, raw identifier, token, API key,
Authorization header, or provider response body.

```json
{
  "windowFingerprint": "window-8817672802574c9a",
  "formalSessionCount": 1,
  "distinctExactScopeCount": 1,
  "extractionBatchCount": 1,
  "validSuppressionCount": 0,
  "validControlCount": 1,
  "failOpenCount": 0,
  "invalidSampleCount": 0,
  "safetyIncidentCount": 0,
  "logicalActionTotal": 1,
  "physicalAttemptTotal": 2,
  "accountingConflictCount": 0,
  "unknownGroupingCount": 0,
  "firstEvidenceDay": "2026-09-10",
  "lastEvidenceDay": "2026-09-10",
  "distinctEvidenceDayCount": 1
}
```

The formal record had `exactScope=true`, `canonicalWriteCountDelta=1`,
`projectionDelta=1`, `summaryDelta=0` (no new summary row was required),
`survivingCanonicalWritesObserved=true`, `cursorAdvanced=true`,
`cursorLoop=false`, `replayLoop=false`, `v2OnlyWrite=false`,
`blockingMaterialUserRegression=false`, `promptDelta=0`, and
`canaryProviderDelta=0`. No vetoed candidate existed, so vetoed canonical,
summary, and projection absence were not applicable; no unauthorized write
was observed.

### Accounting and review

The formal batch was represented by two Ledger rows under one real
`logicalActionId`, each with one physical provider attempt (one failed default
model row followed by one successful fallback row). The authoritative formal
accounting is therefore logical `1`, physical `2`, with one fallback batch;
the collector does not expose raw action IDs.

Export A was combined with an identical second export using
`combineLongEvidenceExports()`. The formal-data review returned
`status=ok`, `windowCount=1`, `mixed_window=false`, `malformedExportCount=0`,
`malformedRecordCount=0`, `recordCount=2`, `dedupedRecordCount=1`, one formal
session, one batch, one control, zero suppressions, zero accounting conflicts,
zero unknown groupings, zero safety incidents, and one UTC evidence day.

### Shutdown and readiness

After the checkpoint, the collector and Canary were disabled. The formal
window identity remains active in memory (`windowState=active`) and the raw
developer token is retained only in the current automation session for a
future `resumeWindow(token)`; the window was not finished or destroyed.

All Day 1 safety thresholds are zero: wrong/cross-scope suppression,
unauthorized or V2-only write, legacy-reject write, cursor/replay loop,
privacy violation, Canary provider delta, prompt delta, and blocking/material
user regression. The appropriate readiness is therefore
`LONG_EVIDENCE_WINDOW_ACTIVE_HEALTHY` for this bounded Day 1 window only.
The long-term minimum (5 sessions, 10 suppressions, 3 scopes, 7 days or 20
batches) is intentionally not met and is not a failure.

The next step, if separately approved, is **Stage 4D-11O — Long-Evidence
Window Continuation** using the same developer-held token, a new session
fingerprint, real elapsed days, and bounded checkpoints. Do not run Day 2 or
enter Phase 2 automatically.

## Stage 4D-11O — Day 1 continuation checkpoint

This continuation resumed the same formal window on the same real UTC
calendar day. It did not create a replacement window, simulate Day 2, or
enter Phase 2.

### Continuity and bounded activity

- Starting refactor HEAD: `2563c329ab3497e5d838abd17dba9eb9cc4f86b2`.
- The previously retained raw developer token was successfully passed to
  `resumeWindow(token)`; the resulting fingerprint remained
  `window-8817672802574c9a`.
- Actual UTC evidence day remained `2026-09-10`, so this is a Day 1
  continuation and `distinctEvidenceDayCount` remains `1`.
- A new formal session was created with unique fingerprint
  `session-803588fc45247e6e` (distinct from
  `session-1df2c8bbdcd05b15`).
- One short synthetic message was sent only in the isolated
  `Stage4D3 临时样本` Direct Chat fixture to establish a real message
  boundary. One subsequent `extractNow()` batch used the real Provider path,
  existing fallback, writer, cursor, and exact-scope readback.

### Continuation checkpoint

The current sanitized export contains one formal `VALID_CONTROL` record:

- batch fingerprint: `batch-17b6502c`
- evidence fingerprint: `evidence-30e3b20a69bc9b70`
- exact scope: `scope-bbb51957`
- `legacyAccepted=true`, `legacyWriteEligible=true`, `correlation=shared_unique`,
  `lineage=shared`, `pairUnique=true`, `exactScope=true`,
  `provenanceTrusted=true`, `metadataSource=v2_model_native`
- validator: `deny_veto` / `bridge_not_safety_veto`; `candidateSuppressed=false`
- canonical survivor observed, `cursorAdvanced=true`, `cursorLoop=false`,
  `replayLoop=false`, `v2OnlyWrite=false`
- logical `1`, physical `2`, accounting shape `fallback_split_rows`
- `promptDelta=0`, `canaryProviderDelta=0`, privacy `metadata_only`

Repeating this current export through `combineLongEvidenceExports()` produced
`status=ok`, `windowCount=1`, `mixed_window=false`, malformed counts `0`,
`recordCount=2`, `dedupedRecordCount=1`, one formal session, one batch, one
control, and zero suppression/safety/accounting-conflict counts.

### Cumulative-merge limitation

The complete R2 Day 1 sanitized export was held only in the prior browser page
and was not persisted to the repository before that page closed. Its summary
is documented above, but the original record payload is unavailable for the
required machine-checked `combineLongEvidenceExports(previous, current)`.
No record was reconstructed, no counters were hand-added as authoritative,
and no synthetic evidence was introduced. Therefore the continuation evidence
is valid and safe, but the cumulative combined checkpoint is **not yet
reviewable** and long-window promotion must not proceed until the prior
sanitized export is recovered or a new approved continuation protocol captures
both exports durably.

### Shutdown and readiness

After the current checkpoint, collector and Canary were disabled. The formal
window remains active in memory and the same raw token is retained only in the
current developer automation session; the window was not finished or
destroyed. Current continuation safety thresholds remain zero (no wrong or
cross-scope suppression, unauthorized/V2-only write, loop, privacy issue,
Provider/Prompt delta, or material user regression).

Because the required previous-plus-current cumulative review cannot be
performed from the available sanitized artifact, this stage closes with
`LONG_EVIDENCE_COLLECTION_INSUFFICIENT` rather than claiming healthy
long-window continuation. No production data or backup was used. Do not run
additional batches or Day 2 until the checkpoint-artifact gap is resolved and
separately approved.

## Stage 4D-11O-R1 — Sanitized artifact recovery checkpoint

R1 started from refactor HEAD `c1f38fcdf417f7bc07f3c2f562d77df883780a79`;
the stable original repository remains at
`f515f7408cfe19da145f15a8ddffceae06e608d`. This was a read-only recovery and
protocol-hardening pass. No new browser session, scope, message, extraction
batch, suppression, control, or evidence record was created.

The closed browser page no longer exposed the exact serialized 11O export to
the review runtime. The prior R2 payload was already absent, so both records
are explicitly classified as `R2_EXPORT_UNRECOVERABLE` and
`11O_EXPORT_UNRECOVERABLE`. The summaries in this document and in
`docs/67-memory-admission-v2-long-evidence-window-running-checkpoint.md` are
historical, non-authoritative metadata only. No record was reconstructed, no
placeholder artifact directory was created, and no hand-added counters are
eligible for promotion.

R1 adds the offline reviewer
`scripts/reviewMemoryAdmissionLongEvidence.ts` and its tests. The reviewer
accepts only complete sanitized JSON exports with a non-empty `records` array,
delegates aggregation/deduplication to `combineLongEvidenceExports()`, rejects
wrong schema, malformed records, mixed windows, summary-only input, and
privacy-sensitive keys/values, and reports authoritative artifact counts
separately from rejected inputs. No raw window token is written to a file,
document, log, or Git history.

Because no exact export could be recovered, retained authoritative formal
artifact counts remain zero. R1 can only establish
`EVIDENCE_ARTIFACT_PROTOCOL_VALIDATED` after its tests and full repository
verification pass; it does not claim long-window evidence or authorize Phase
2. A future run must follow persist-first ordering: exact `exportJson()` output
to a durable file, read-back, machine review, privacy review, checkpoint, then
disable the collector/Canary.
