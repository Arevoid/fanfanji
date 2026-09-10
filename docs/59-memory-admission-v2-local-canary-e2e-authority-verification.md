# Stage 4D-11H — Local Canary End-to-End Authority Verification

Status: `LOCAL_CANARY_E2E_VALIDATED` for the bounded developer/local Canary
only. This is not a Phase 2 or production-cohort approval.

- Starting refactor HEAD: `dc5b4dbe70743d5a7c2c8b1aeee622d3a8643d0b`
- Implementation/test commit: `4e3af0238a96877af0f6935e8eeb3b8eeff4962d`
- Stable original-repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Scope: automatic one-to-one Direct Chat, isolated `Stage4D3` synthetic fixture
- Canary reason: `SAFETY_VETO_CANCELLED_PLAN` only
- Persistence: existing canonical writer; Canary telemetry remains in-memory
  and metadata-only

## 1. Activation-surface audit

The audited symbols were searched across `src/`, `scripts/`, and `docs/`:
`configureDirectChatMemorySafetyVetoCanary`,
`DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY`,
`__fanfanjiMemorySafetyVetoCanary`, and `explicitDebug`.

- No production caller invokes `configureDirectChatMemorySafetyVetoCanary`.
  `AppChat` only reads the enabled state; configuration calls are confined to
  the developer global and tests/debug seams.
- No cohort, rollout, production-enable, or persistent preference mechanism
  was found.
- `explicitDebug: true` appears only in tests and explicit debug-controlled
  paths.
- The global API installation is guarded by `isDevBuild()`; the production
  bundle does not install it.
- The default module state is disabled. Missing, malformed, or disabled
  configuration normalizes to OFF and clears records.

The synthetic writer probe is additionally gated by the exact non-secret token
`stage4d11h-synthetic-write`, a character name beginning with `Stage4D3`, and
the enabled local Canary. Invalid guards return without a Provider request.

## 2. Runtime environment and scenarios

The refactor dev server ran at `http://localhost:3000/` from the
`refactor/v2-architecture` worktree. No backup, production account, group,
manual, offline, Diary, Moments, Character Phone, or other feature path was
used. The existing temporary fixture was retained as requested.

### Scenario J — cancelled plan (real Provider)

The fixture contained a future plan followed by an explicit cancellation. One
real automatic extraction produced one legacy accepted plan candidate. The
default extraction model failed and the existing active-chat-model fallback
succeeded; no Canary retry or extra Prompt was introduced.

Observed chain:

```text
legacy accepted
  -> V2 plan / cancelled
  -> Bridge safety_veto / cancelled_plan_not_active
  -> validator allow_veto / SAFETY_VETO_CANCELLED_PLAN
  -> Canary suppressed=true
  -> filteredAcceptedClaims=[]
  -> existing ZERO_CANDIDATES writer/cursor path
```

The Canary record was `evaluated=true`, `canaryEligible=true`,
`acceptedBeforeCount=1`, `acceptedAfterCount=0`, and `failOpen=false`.
Bridge metrics reported one unique shared-lineage conflict and one safety veto.

### Scenario K — control (real Provider)

In the same isolated character, a separate safe preference fact was sent
without requesting a chat reply. One real extraction produced a legacy
accepted control candidate. The Bridge classified it as an exact/review case
(`unknown_semantics`), so the validator denied a veto and the Canary recorded
`suppressed=false`.

The control candidate was committed through `commitMemoryWriteBundle`, with one
active canonical preference claim, one Summary, one Projection job, and normal
cursor advancement. No V2-only write occurred.

## 3. Canonical authority evidence

Before J, exact-scope reads showed one pre-existing retracted manual claim,
zero active summaries, zero projection jobs, and no active MemoryItem payload.
After J, those values were unchanged for the cancelled-plan candidate: no new
KnowledgeClaim, Summary, Projection-derived output, or Legacy MemoryItem was
present. The event store was not written by the extraction path. The only
relationship write in the extraction path is the existing processed-input
cursor marker (`lastImmediateSummaryMsgId`); it advanced from absent to the
synthetic batch boundary as required. No separate relationship or scene
mutation writer is called by the Canary path.

J had exactly one accepted candidate and therefore exercised
`filteredAcceptedClaims.length === 0` and the existing `ZERO_CANDIDATES`
semantics: no claim append, no fake Summary, no Projection enqueue, and cursor
progress without replay. J was not invoked a second time.

After K, the canonical store contained the surviving active preference claim,
one Summary, and one Projection job. This establishes the paired proof:

```text
J: legacy would write -> valid safety veto -> canonical absent
K: legacy would write -> no veto -> canonical present
```

## 4. Accounting, Prompt, and latency

There were two real Provider extraction operations (J and K). Each exercised
the existing default-model failure plus active-chat-model fallback: four
physical Provider attempts in total (two primary failures and two fallback
successes). The browser ledger currently materializes these fallback calls as
four `memory_extract` records with `providerRequestCount=1` each; this is the
pre-existing `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK` accounting shape and
was not changed in this stage.

Bridge, Safety-veto validator, and Canary Provider deltas were all zero.
Prompt text/order and Canary token deltas were zero. The coarse extraction
durations were approximately 21.1 seconds for J (including its fallback) and
8.5 seconds for K; candidate-local filtering itself performed no blocking I/O
and showed no material latency regression.

## 5. Failure policy and privacy

The Canary remains fail-open for missing/partial/ambiguous/duplicate lineage,
scope or provenance uncertainty, validator exceptions, structural fallback,
and non-safety Bridge states. The unit and writer-seam tests cover these
cases, input immutability, all-veto cursor semantics, and the control commit.

Canary telemetry is capped at 100 in-memory metadata records. J and K each
exported one bounded row after an explicit clear; the API was disabled after
verification and its final export was empty. No exported or persisted value
contained Prompt text, message text, candidate statements, source IDs, raw
lineage, complete responses, API keys, Authorization headers, or raw Provider
errors. The Ledger and Bridge exports were inspected using the same safe-field
rule.

## 6. Cleanup and readiness

The `Stage4D3` fixture and its small synthetic message set were retained and
remain clearly marked, following the prior instruction not to delete the
temporary sample. No user data or backup was used. The Canary is OFF after the
run. Phase 2, cohort rollout, positive V2 authority, reason expansion,
temporary-preference veto, and legacy retirement were not entered. The
five-session/ten-suppression/three-relationship and seven-day/20-batch
evidence window remains pending.

Readiness is therefore limited to `LOCAL_CANARY_E2E_VALIDATED`: the local
cancelled-plan brake and normal control writer path are proven, while the
long-window evidence and any production decision remain separate work.

## 7. Rollback and next recommendation

Turning the Canary OFF restores the exact legacy write path. Reverting the
Stage 4D-11H code/test/document commits removes the dev-only writer probe;
there is no schema migration, replay, backfill, or user-data repair. The
original repository remains the clean insurance copy at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

Recommendation: stop and review this bounded evidence. If another stage is
approved, first design the independent long evidence window and accounting
clarification; do not enable a cohort or positive V2 writes automatically.
