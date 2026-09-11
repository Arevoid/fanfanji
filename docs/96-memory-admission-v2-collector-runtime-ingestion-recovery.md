# Stage 4D-11O-R3A — Collector Runtime Ingestion Recovery

## Scope and preserved R3 evidence

This stage began at refactor HEAD `df4f050` (the R3 failure-audit commit),
whose parent is `ac5ca54c238abbd2821301e90a9535cd6f6380b1`. The stable original
repository remains at `f515f7408cfe19da145f15a8ddffceae06e608d`.

The R3 evidence is preserved unchanged: one real Direct Chat trigger was
already consumed, automatic extraction completed with one logical and two
physical `memory_extract` attempts, the cursor advanced from eligible 18 to
0, Memory vault remained 0, and Window `window-d3ece74319ea2f4d` closed with
`collector_gap`. No R3 message was replayed, no Provider was called in this
stage, no Window was opened, and `extractNow()` was not called.

## Root-cause classification

The primary root cause is **A — automatic extraction did not emit the
batch-level evidence event**. The exact missing boundary was in
`src/features/chat/hooks/useChatMemoryExtraction.ts`, inside
`useChatMemoryExtraction`:

1. The automatic extraction request completed through
   `MemoryService.extractMemories` and
   `apiExtractMemoriesWithModelFallback`.
2. The existing writer/cursor path completed.
3. `observeDirectChatMemoryLongEvidenceRuntime` was guarded by
   `longEvidenceEnabled && logicalActionId && longEvidenceBefore && shadowResult`.
4. `shadowResult` was only constructed under
   `admissionShadowEnabled || safetyShadowEnabled || canaryEnabled`.
5. A formal Collector Window can be active while those standalone Shadow and
   Canary toggles are off. In that valid configuration, `shadowResult` stayed
   `undefined`; the completed batch never reached the long-evidence observer.

The zero-candidate implementation in
`directChatMemoryLongEvidenceRuntime.ts` was not the failing component. Once
called with a successful extraction whose `shadowCandidatesV2` is an empty
array, it already creates one `recordKind=batch` /
`classification=ZERO_CANDIDATE_BATCH` record. Collector validation and export
also accept that shape in deterministic tests.

The remaining classifications are therefore negative findings:

- **B:** no subscription failure; the observer was not reached because the
  caller condition was false.
- **C:** Window state and token binding were valid; no binding rejection ran.
- **D:** Collector filtering did not drop a record; it received none.
- **E:** export did not lose a record; the in-memory buffer was empty.
- **F:** no completion timing race was required; the call was absent, not late.
- **G:** no additional runtime cause was found.

R3's missing `sessionFingerprint` was a consequence of the absent record, not
the identity generator. `startWindow()` creates the session identity before
any candidate exists. Promotion scope mapping likewise comes from the exact
runtime scope supplied to the observer and was never reached in R3.

## Runtime path audit

The audited automatic path is:

```text
trigger
→ Direct Reply completion
→ eligible batch selection
→ MemoryService.extractMemories
→ Provider fallback adapter
→ parser / legacy claims / optional V2 metadata
→ Admission / Bridge / Safety / Canary observations
→ canonical write and Summary/Projection handling
→ archive cursor advance
→ exact-scope readback
→ long-evidence observer
→ bounded Collector record
```

The former gap was between cursor/readback preparation and the observer:
the automatic caller did not request admission diagnostics or construct the
typed `shadowResult` when only the formal Collector was enabled. The existing
RG1-A zero-candidate fix therefore worked for direct observer/dev-trigger
paths, but did not make the automatic caller emit the required completion
event.

## Minimal fix

`useChatMemoryExtraction` now derives `longEvidenceEnabled` before the
automatic/group split and defines:

```text
admissionObservationEnabled =
  admissionShadowEnabled || safetyShadowEnabled || canaryEnabled || longEvidenceEnabled
```

That flag is used only to request the already-existing admission observation
metadata from the extraction result and to construct the existing
`shadowResult`. The final observer call remains after the existing writer and
cursor completion. When a formal Collector is enabled, an empty candidate
array now reaches the existing zero-batch classifier; when it contains
candidates, the existing candidate-level path is used.

This does not change Prompt text, Provider requests, retry/fallback policy,
Memory authority, canonical writes, Summary/Projection semantics, cursor
semantics, trigger thresholds, or user data. In production the Collector is
disabled, so the new branch is inactive. The observation remains dev-only,
bounded, metadata-only, and fail-open.

## Deterministic local coverage

`scripts/directChatMemoryLongEvidenceRuntime.test.ts` now verifies both the
automatic caller seam and the runtime result:

- Collector-enabled automatic completion enables the admission observation
  seam even when standalone Shadow/Canary telemetry is disabled;
- successful zero candidate extraction produces exactly one batch record;
- `recordKind=batch`, `ZERO_CANDIDATE_BATCH`, and `candidateCount=0` hold;
- no fake candidate, control, or suppression is created;
- session/window identity, exact scope, batch accounting, and metadata-only
  export remain valid;
- candidate-containing controls and suppressions, batch deduplication,
  malformed-zero rejection, old-artifact compatibility, and cross-scope
  isolation remain covered by the existing collector/runtime/reviewer tests.

The test harness runs with `NODE_ENV=test`; the previous direct invocation
failure was only a missing test-environment initialization.

## Validation and boundaries

No browser runtime turn, Provider request, accumulation, Window creation,
fixture reset, cursor change, or extraction replay was performed in R3A.
R3's closed collector-gap Window remains excluded from authoritative evidence.

Readiness after the complete local gates is:

`ZERO_CANDIDATE_RUNTIME_INGESTION_FIX_LOCAL_VALIDATED`

The next recommended stage is `Stage 4D-11O-R3B — Post-Fix Accumulation to
Next Governed Trigger`. It must start from the current fixture, use a fresh
approved Window, and perform a new bounded trigger; it is not started here.

