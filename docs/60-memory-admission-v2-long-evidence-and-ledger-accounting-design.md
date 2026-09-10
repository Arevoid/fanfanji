# Stage 4D-11I — Long Evidence Window & Ledger Accounting Design

Historical Stage 4D-11I status: `LONG_EVIDENCE_ACCOUNTING_UNCLEAR`.
After the Stage 4D-11J lineage fix and verification, the accounting dependency
is `ACCOUNTING_LINEAGE_FIXED_VALIDATED`; the long evidence window itself remains
uncollected and Phase 2 remains unauthorized.

This document is a design and audit artifact only. It does not authorize a
long-window collection run, a cohort, positive V2 write authority, a Provider
fallback change, or a persistent telemetry implementation.

- Starting refactor HEAD: `e576365932d13de754aee727a25896fd3d226692`
- Stable original-repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Scope: cancelled-plan local Canary evidence and `memory_extract` accounting
- Current Canary readiness: `LOCAL_CANARY_E2E_VALIDATED` for the bounded local
  11H J/K run only
- Production default: OFF

## 1. Purpose

Stage 4D-11I defines the smallest evidence contract that could later support a
long local/developer observation window. It also makes the difference between
one logical memory-extraction action and its physical Provider attempts
explicit. The goal is to prevent a future sample count or latency report from
silently treating fallback rows as independent business actions.

The design is intentionally metadata-only, bounded, local, and reviewable. It
does not change Prompt text or order, context selection, memory authority,
Provider selection, retry/fallback behavior, storage schema, or user data.

## 2. Current evidence baseline

Stage 4D-11H established a bounded local proof with two real extraction
operations:

- J: a cancelled plan. Legacy accepted one candidate; the V2 Bridge and
  safety-veto validator suppressed it; canonical readback showed no claim,
  Summary, Projection, or Legacy MemoryItem write; the cursor advanced.
- K: a normal preference control. The validator did not veto; the legacy
  candidate was committed with one active claim, one Summary, one Projection
  job, and normal cursor advancement.

Both operations used the existing default-model failure and active-chat-model
fallback. Four physical Provider attempts were observed: two primary failures
and two fallback successes. The existing browser Ledger contained four
`memory_extract` rows, each with `providerRequestCount=1`. This is not a
long-window result and does not satisfy the Stage 11F minimum.

The synthetic `Stage4D3` fixture and its small message set remain in place as
previously instructed. The Canary was disabled after the run. No user backup,
production cohort, or network telemetry was used.

## 3. Long-window minimum (unchanged)

The minimum is not relaxed:

1. At least **5 distinct evidence sessions**.
2. At least **10 valid eligible cancelled-plan suppressions**.
3. At least **3 distinct exact relationships/conversations**.
4. At least **7 calendar days or 20 automatic extraction batches, whichever
   takes longer**.

The window is complete only when all four conditions hold and every zero-error
threshold in section 9 remains zero. A shorter run can be useful for debugging,
but it is `LONG_EVIDENCE_COLLECTION_INSUFFICIENT` and cannot support a
promotion discussion.

## 4. Evidence record schema

The future evidence artifact is a bounded, metadata-only record. It may use
the following fields (all values are enums, booleans, bounded integers, or
coarse buckets):

```ts
type LongEvidenceRecord = {
  schemaVersion: "memory-admission-v2-long-evidence-1";
  timeBucket: string; // coarse UTC bucket, not an exact event timestamp
  featureScope: "direct_chat_memory_extraction";
  sessionOrdinal: number; // opaque ordinal within the exported review set
  scopeFingerprint: string; // non-reversible, reviewer-safe scope token
  canaryReason: "SAFETY_VETO_CANCELLED_PLAN";
  validatorResult: "allow_veto" | "deny_veto" | "not_evaluated";
  validatorReason: string; // allowlisted reason code
  bridgeState: string; // allowlisted bridge state
  bridgeReason: string; // allowlisted bridge reason
  correlationClass: "shared_unique" | "shared_non_unique" | "cross_scope" | "unknown";
  lineageStatus: "shared" | "missing" | "conflict" | "unknown";
  pairUnique: boolean;
  exactScope: boolean;
  provenanceTrusted: boolean;
  metadataSource: "v2_model_native" | "legacy_derived" | "mixed" | "unknown";
  semanticKind: "plan" | "preference" | "fact" | "unknown";
  planLifecycle: "cancelled" | "active" | "not_applicable" | "unknown";
  legacyAccepted: boolean;
  legacyWriteEligible: boolean;
  candidateSuppressed: boolean;
  /** Batch-level counts; they must not be mistaken for candidate-local state. */
  batchAcceptedBefore: number;
  batchAcceptedAfter: number;
  batchZeroCandidates: boolean;
  vetoedCandidateCanonicalAbsent: boolean;
  survivingCanonicalWritesExpected: boolean;
  survivingCanonicalWritesObserved: boolean;
  cursorAdvanced: boolean;
  canonicalWriteCountDelta: number;
  summaryDelta: number;
  projectionDelta: number;
  failOpen: boolean;
  providerLogicalRequestCount: number;
  providerPhysicalAttemptCount: number;
  accountingShape: "single_row" | "fallback_split_rows" | "unknown";
  promptDelta: number;
  canaryProviderDelta: number;
  extractionLatencyBucket: "0_5s" | "5_15s" | "15_30s" | "30_60s" | "60s_plus" | "unknown";
  canaryFilteringLatencyBucket: "0_10ms" | "10_50ms" | "50_250ms" | "250ms_plus" | "unknown";
  privacyStatus: "metadata_only" | "violation";
};
```

`scopeFingerprint` is a review token, not an application identifier. The
collection design must generate it from a local, non-exported salt and a
canonical exact-scope tuple, or replace it with a reviewer-assigned opaque
ordinal during manual export. It must not be reversible or joined with raw
application data from the artifact.

The record must never contain statements, message text, Prompt text, response
bodies, raw source/scope/lineage/candidate IDs, API keys, Authorization
headers, user-visible secrets, or raw Provider errors. Values are capped to
small enums and integer ranges before export.

## 5. Validity rules

### 5.1 `VALID_ELIGIBLE_SUPPRESSION`

Suppression validity is candidate-local. It must not require the entire batch to
become empty. One record counts toward the ten only when all of the following
candidate and lineage predicates are true:

```text
legacyAccepted = true
legacyWriteEligible = true
batchAcceptedBefore >= 1
correlationClass = shared_unique
lineageStatus = shared
pairUnique = true
exactScope = true
provenanceTrusted = true
metadataSource = v2_model_native
semanticKind = plan
planLifecycle = cancelled
validatorResult = allow_veto
canaryReason = SAFETY_VETO_CANCELLED_PLAN
candidateSuppressed = true
vetoedCandidateCanonicalAbsent = true
failOpen = false
privacyStatus = metadata_only
```

The canonical readback must be exact-scope and occur after the write boundary;
it must show no canonical claim, Summary, Projection job, or Legacy MemoryItem
for the vetoed candidate. The evidence review may display `v2_model_native` as
the normalized `model_native` category, but only the runtime
`v2_model_native` gate qualifies. `legacy_derived` and `mixed` metadata may be retained
as observation, control, or invalid records, but cannot contribute to the ten
production-shaped suppressions. A missing plan/cancelled marker, an ambiguous
Bridge, a duplicate pair, untrusted source, or unverified readback is not
eligible.

The batch-level state is then classified without changing the candidate-local
predicate.

#### Partial suppression

```text
batchAcceptedBefore > batchAcceptedAfter
batchAcceptedAfter > 0
batchZeroCandidates = false
survivingCanonicalWritesExpected = true
survivingCanonicalWritesObserved = true
cursorAdvanced = true
```

The vetoed candidate is absent while surviving candidates are written exactly as
the established canonical path requires. Summary and Projection deltas are
validated against the surviving canonical state; they do not have to be zero.

#### All-veto suppression

```text
batchAcceptedBefore > 0
batchAcceptedAfter = 0
batchZeroCandidates = true
survivingCanonicalWritesExpected = false
survivingCanonicalWritesObserved = true
cursorAdvanced = true
canonicalWriteCountDelta = 0
summaryDelta = 0
projectionDelta = 0
```

This is the existing `ZERO_CANDIDATES` path. Both partial and all-veto records
may contribute one suppression count per valid vetoed candidate. The cursor must
advance in either case.

A Provider failure followed by a successful fallback may still be an eligible
extraction if the safety chain is otherwise complete, but the record must set
`accountingShape = "fallback_split_rows"` (or another explicitly reviewed
non-single-row code). It is never silently counted as one physical attempt.

### 5.2 Controls

A valid control is a normal, non-veto candidate from the same approved scope
whose chain proves `legacyAccepted=true`, `validatorResult=deny_veto`,
`candidateSuppressed=false`, a positive canonical write delta, normal Summary/Projection
behavior, and cursor advancement. The control must not be a V2-only write.

For every session containing an eligible suppression, collect at least one
normal control in that session. If a session has no safe control opportunity,
the review set must contain at least five controls across at least three
sessions before it can be accepted. Controls are evidence of non-interference,
not a quota to generate artificial traffic.

### 5.3 Other states

- `FAIL_OPEN_OBSERVATION`: incomplete, missing, ambiguous, duplicate, or
  exception path that leaves the legacy result untouched. It is retained for
  audit but does not count as suppression.
- `INVALID_SAMPLE`: malformed schema, missing exact readback, untrusted
  provenance, scope mismatch, or incomplete lineage.
- `SAFETY_INCIDENT`: a vetoed candidate was written, a cross-scope candidate was
  suppressed, a cursor/replay loop occurred, privacy was violated, or another
  zero-error invariant failed. The window is aborted.

## 6. Session and relationship/conversation counting

The safest first collection mechanism is manual export and review. A session is
one explicit developer/local evidence run with a fresh in-memory session ordinal,
a clear boundary, and a recorded start/end coarse time bucket. Reloading or
clearing the page starts a new ordinal; the ordinal is not an application ID and
is not persisted as user data.

Three distinct relationships/conversations means three distinct canonical exact
scope tuples (character, identity/relationship, and conversation) that each
produce at least one valid record. Raw tuple members never leave the runtime.
For a manual export, the reviewer can assign `scopeFingerprint` values from a
local salted hash or assign opaque ordinals while inspecting the isolated
fixture. Two records with unknown or conflicting scope cannot be treated as
distinct.

Because the current Canary telemetry is page-memory only, it cannot itself
prove five sessions or three scopes across reloads. The reviewer must combine
the bounded, sanitized exports offline and record only the resulting ordinals
and counts. No automatic cross-session analytics is authorized in this stage.

If a future team needs automatic multi-day counting, the smallest safe design
is a separate developer-only store with an independent versioned schema, a
local installation salt, only the record fields above, per-session cap 100,
window cap 500 records, 30-day retention, no network path, explicit clear, and
production default OFF. That store is a proposal only and is not implemented
here.

## 7. Persistence and export strategy

### Current recommendation: A — manual export + review

Keep Canary telemetry in memory, as in 11H. At an explicit end-of-session action,
export a sanitized JSON artifact capped at 100 records. Reviewers combine files
offline on a trusted workstation; no automatic upload, sync, or background
analytics is permitted. If an export is lost or a session was not explicitly
closed, the window is incomplete rather than inferred.

The future optional store described in section 6 is not needed to decide whether
the design is safe and would create additional retention and deletion surface.
It must be approved separately before implementation.

Retention for a future combined review set is at most 30 days and 500 metadata
records, with the existing per-session 100-record cap. The 30-day bound is long
enough to cover the seven-day minimum while remaining bounded. Explicit clear
must delete in-memory records and any future local evidence artifact; it must
not delete chat, memory, or user data.

## 8. Privacy and authority controls

The evidence path is local-only, developer/local-only, and default OFF. It has
no network upload, no Prompt or response capture, no raw IDs, no secrets, and no
effect on canonical memory authority. Missing, malformed, or partial metadata
must fail open to the legacy writer and be classified as observation/invalid;
it must never grant V2 authority.

The existing 11H safety-veto Canary remains limited to
`SAFETY_VETO_CANCELLED_PLAN`. This document does not add reasons, enable a
cohort, or allow positive V2 writes. Turning it OFF is the abort and rollback
control.

## 9. Zero-error thresholds

All of these must remain exactly zero throughout the window:

| Invariant | Threshold |
| --- | ---: |
| wrong suppression | 0 |
| cross-scope suppression | 0 |
| unauthorized write | 0 |
| V2-only write | 0 |
| cursor loop | 0 |
| replay loop | 0 |
| privacy violation | 0 |
| Canary Provider delta | 0 |
| Prompt delta | 0 |
| blocking/material user regression | 0 |

Any non-zero value invalidates promotion eligibility, requires the Canary to be
OFF, and enters audit. There is no statistical tolerance for a safety or
privacy error.

## 10. Latency and request accounting in evidence

Every future record separates total extraction duration from local Canary
filtering duration. A coarse bucket is sufficient. The approximately 21.1s J
and 8.5s K durations in 11H include the existing Provider fallback; the Canary
performed candidate-local synchronous filtering and no blocking I/O. Those
durations must not be attributed to the Canary.

`providerLogicalRequestCount` is the number of business AI actions represented
by the evidence record after review. `providerPhysicalAttemptCount` is the
number of actual Provider executions, including primary and fallback. The
Canary's own provider and Prompt deltas must remain zero.

## 11. Logical versus physical AI requests

The reviewed accounting model is:

```text
Logical AI action:       memory_extract = 1
Primary Provider attempt:                         1
Fallback Provider attempt:                        1
Total physical attempts:                          2
```

From the user's perspective this is one memory extraction operation. From a
cost, quota, and transport perspective it is two Provider executions. A
format, alias, or context retry is a new logical record linked to the same
`parentActionId`; a backend-to-browser fallback within one shared Ledger
session should be attempts of that logical record.

## 12. Current Ledger shape and observed limitation

The current browser Ledger uses key `fanfan_ai_request_ledger_v1`, bounded
localStorage persistence, deferred in-memory buffering, pagehide best-effort
flush, and merge-before-write behavior. A row is intended to be one logical AI
request; `providerRequestCount` counts attempts within that row. No attempt-level
rows or event table exists, and provider/model/transport describe the last
attempt represented by the row.

However, `apiExtractMemoriesWithModelFallback` currently calls the wrapped
`apiExtractMemories` function once for the primary model and again for the
fallback model. Each wrapper creates its own Ledger session. Consequently, one
business extraction can currently materialize as two rows, each with
`providerRequestCount=1`, rather than one row with a count of two. This is a
known accounting-shape limitation, not a change made by 11I.

Therefore:

- Raw `memory_extract` row count can make business call count look doubled.
- Physical Provider-attempt totals from the two rows can still be summed for
  cost/quota review when the pair is independently correlated.
- Logical extraction count must come from the business operation/correlation,
  not raw row count.
- The derived extra-attempt/fallback-rate metric is authoritative only for
  explicitly reviewed linked shapes; it must not guess fallback versus retry
  from timestamps, models, or reason text.
- Existing 11H J/K evidence is four Ledger rows for two logical operations and
  four physical attempts; it must be reported in that form.
- The current rows do not reliably carry one shared logical ID across the
  split fallback calls. This is accounting debt and blocks authoritative
  long-window aggregation.

The fallback is therefore more than a display issue: it adds latency, may add
Provider cost and rate-limit consumption, and can complicate failure/duplicate
interpretation. It should be understood and, if product policy requires exact
accounting, fixed before any Admission cutover or tiny cohort. It may be
scheduled as a separate accounting task before Memory V2 closeout, but is not
fixed in this stage.

## 13. Collection protocol (future; not run here)

1. Confirm Canary is explicitly enabled only in a developer/local build and
   clear its in-memory records.
2. Start a fresh session ordinal and use only isolated synthetic or approved
   local fixtures.
3. Run small automatic extraction batches; do not manufacture messages solely
   to hit a number.
4. For each candidate, capture only the bounded fields in section 4 and perform
   exact-scope canonical readback.
5. Include a normal control in each suppression-bearing session.
6. At session end, export the sanitized artifact and clear runtime telemetry.
7. Repeat until the four minimums are met or the abort protocol fires.
8. Keep the Canary OFF after collection. Do not enable a cohort automatically.

No long-window collection, Provider experiment, or user-backup operation was
performed in Stage 4D-11I.

## 14. Review protocol

Reviewers first validate schema, privacy, scope fingerprints, session ordinals,
lineage pairing, and accounting shape. They then independently count only
`VALID_ELIGIBLE_SUPPRESSION` records, verify the control ratio, confirm all
zero-error counters are zero, and reconcile logical operations with physical
attempts. Any uncertain row is excluded, not upgraded by inference.

The review result must be one of the states below and include the sanitized
artifacts and a reproducible count sheet. Raw application storage is not part
of the evidence artifact.

## 15. Abort protocol

Immediately disable the Canary and stop collection on any wrong or
cross-scope suppression, unauthorized/V2-only write, cursor/replay loop,
privacy violation, non-zero Provider or Prompt delta, or blocking/material user
regression. Preserve only the bounded sanitized audit artifact; do not copy raw
messages or Provider responses. Investigate with the existing legacy path and
roll back the dev-only Canary if needed.

## 16. Readiness states

- `LONG_EVIDENCE_DESIGN_BLOCKED`: schema, scope, privacy, or control contract
  cannot be reviewed safely.
- `LONG_EVIDENCE_DESIGN_READY`: this design is approved for a separately
  authorized collection implementation, but no collection has completed.
- `LONG_EVIDENCE_ACCOUNTING_UNCLEAR`: the design is documented, but current
  Ledger rows cannot unambiguously aggregate fallback-split logical requests.
  This is the Stage 4D-11I outcome.
- `LONG_EVIDENCE_COLLECTION_INSUFFICIENT`: a future run lacks any minimum,
  including the 7-day/20-batch longer-duration rule.
- `LONG_EVIDENCE_SAFETY_FAILURE`: a future run violates any zero-error
  invariant.
- `LONG_EVIDENCE_VALIDATED`: only after the complete minimum, healthy controls,
  zero errors, understood accounting, privacy review, Canary OFF, and rollback
  verification are all documented.

## 17. Phase 2 gate

Only `LONG_EVIDENCE_VALIDATED` permits designing a tiny reviewed cohort. The
gate additionally requires every zero-error threshold to remain zero, minimum
samples/window and controls to be satisfied, logical/physical accounting to be
understood, Canary default OFF, and rollback verified. This stage does not pass
that gate and does not authorize Phase 2, positive V2 authority, or production
cutover.

## 18. Answers to the Stage 4D-11I checklist

1. Minimum: 5 sessions, 10 valid suppressions, 3 exact scopes, and at least 7 days or 20 batches, whichever is longer.
2. A session is one explicit fresh developer/local run with a new in-memory ordinal and clear boundary.
3. Three scopes are three distinct canonical character/identity-relationship/conversation tuples, represented only by opaque fingerprints/ordinals.
4. Ten suppressions are ten candidate-local records satisfying every `VALID_ELIGIBLE_SUPPRESSION` predicate and exact canonical readback; partial and all-veto batches both count.
5. Count elapsed calendar days from the first to last session; also count completed automatic extraction batches; use the longer requirement.
6. Validity requires legacy eligibility, shared unique lineage, exact scope, trusted provenance, runtime `metadataSource=v2_model_native` (optionally displayed as normalized `model_native`), cancelled plan, validator `allow_veto`, enabled reason, candidate suppression, vetoed-candidate absence, cursor progress, no fail-open, and privacy-safe metadata. Batch deltas must reconcile surviving candidates; zero deltas are required only for all-veto batches.
7. At least one normal non-veto control per suppression-bearing session, or five controls across at least three sessions when a session has no safe control opportunity.
8. Wrong suppression threshold: 0.
9. Cross-scope threshold: 0.
10. Unauthorized write threshold: 0.
11. Cursor-loop threshold: 0.
12. Replay-loop threshold: 0.
13. Privacy threshold: 0 violations.
14. Canary Provider delta threshold: 0.
15. Prompt delta threshold: 0.
16. Blocking/material user regression threshold: 0.
17. Current telemetry remains in memory with manual sanitized export; no durable store is implemented.
18. Long-evidence records do not persist/export raw IDs; the existing AI Ledger scope-ID fields remain unchanged and are not used as long-evidence artifacts.
19. Raw text is not persisted or exported.
20. Secrets, keys, Authorization, and raw error bodies are not persisted or exported.
21. Future optional store/review cap: 30 days, 500 records total, 100 per session.
22. Yes. Each session must be explicitly exported for cross-session review.
23. Automatic network upload: no.
24. Clear/reset: explicit clear at session start/end; it clears evidence telemetry only, never chat or memory data.
25. Production default: OFF; developer/local only.
26. Canary authority: unchanged; still only the existing cancelled-plan safety-veto observation and no positive V2 authority.
27. One logical extraction is one user/business memory-extraction operation.
28. One physical attempt is one actual Provider execution, primary or fallback.
29. Primary fail plus fallback success: one logical request.
30. The same case: two physical attempts.
31. Current Ledger shows two rows because each fallback invocation creates a separate `apiExtractMemories` Ledger session.
32. Yes. Raw row count can overstate business call count.
33. Cost accounting should use physical Provider attempts and verified Provider usage, while separately reporting logical actions.
34. Latency should report total extraction duration and local Canary filtering duration separately, with fallback marked.
35. Yes. A fallback executes another Provider request and may increase cost.
36. Yes. 11H observed fallback-inclusive J/K durations of approximately 21.1s and 8.5s.
37. Yes. The extra attempt can consume quota/rate limits.
38. Severity: medium/high operational debt; it affects cost, latency, quota, and evidence interpretation, not just display.
39. Yes, it must be understood and, if exact accounting is required, resolved before Admission cutover or a tiny cohort.
40. Yes, it should be resolved before Memory V2 closeout even if it is scheduled separately.
41. No Ledger write-schema change is made in 11I; a future minimal aggregation/lineage improvement is needed before authoritative long-window counting.
42. Yes, the fallback pair needs a shared parent/logical action lineage for reliable aggregation.
43. Provider code changed: no.
44. Ledger write implementation changed: no.
45. Persistent evidence implementation: no.
46. Long evidence completed: no; only its design was documented.
47. Phase 2 allowed: no.
48. Readiness: `LONG_EVIDENCE_ACCOUNTING_UNCLEAR`.
49. Next recommendation: a separately scoped accounting-lineage clarification/fix and tests, followed by an explicitly approved bounded collection; do not start a cohort yet.
50. Starting refactor HEAD: `e576365932d13de754aee727a25896fd3d226692`.
51. Final HEAD: the docs-only commit created for this stage (reported with its full hash after commit).
52. Commit: `docs: design long evidence window and clarify ledger accounting`.
53. Tests: existing baseline remains 581/581; full verification is rerun after this docs-only change.
54. Lint: rerun and must remain passing.
55. Build: rerun and must remain passing.
56. Dependency gate: rerun against 105 allowlisted concrete edges and 3 cycle baselines.
57. AI accounting checks: `scripts/aiRequestAccounting.test.ts` and the Ledger persistence suite are rerun; no accounting implementation is changed.
58. Smoke: `npm run smoke:check` is rerun; no production/provider evidence collection is performed.
59. Worktree status: must be clean after the documentation commit and verification.

## 19. Recommendation and stop condition

The design is sufficiently explicit to review, but the current fallback-split
Ledger shape keeps readiness at `LONG_EVIDENCE_ACCOUNTING_UNCLEAR`. Approve a
separate, minimal accounting-lineage task before relying on raw Ledger data for
long-window counts. After that task, a new approval may authorize a bounded
manual-export collection. Do not enter Phase 2 or positive V2 authority from
this document.
