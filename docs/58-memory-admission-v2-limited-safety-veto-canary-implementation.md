# Stage 4D-11G — Limited Safety-veto Canary Implementation

Status: implemented as a developer/local, default-off, candidate-local Canary.
This stage stops before Phase 2 or full Admission authority cutover.

- Starting refactor HEAD: `a04c5957db2f5c2d01d1caaf03eea87cc8323ff9`
- Stable original-repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Scope: automatic one-to-one Direct Chat memory extraction only
- Enabled reason: `SAFETY_VETO_CANCELLED_PLAN`
- Temporary preference: shadow-only; not enabled by this Canary
- Persistence mode: existing production path; the Canary itself stores only
  bounded in-memory metadata telemetry

## 1. Implementation seam and authority

The only production integration is the automatic Direct Chat branch of
`useChatMemoryExtraction.handleExtractMemories()`:

```text
MemoryService.extractMemories()
  -> legacy result.acceptedClaims
  -> Direct Chat Bridge shadow observation
  -> existing Safety-veto shadow evaluation
  -> candidate-local Canary adapter
  -> filteredAcceptedClaims
  -> existing commitMemoryWriteBundle()
```

The adapter runs after legacy acceptance and before the existing writer. It
never changes `result.acceptedClaims`, never writes V2-only candidates, and
never changes the global writer, Prompt, Provider, retry/fallback, storage
schema, cursor implementation, or UI state. The writer receives the derived
`filteredAcceptedClaims` array only when the explicit local Canary is enabled.
With the flag off, the exact legacy array is passed through.

The module is
`src/features/chat/services/directChatMemorySafetyVetoCanary.ts`. It has no
React, Provider, Prompt, fetch, repository, or `commitMemoryWriteBundle`
dependency. The hook remains the orchestration seam; no DirectReplyUseCase or
other feature was created.

## 2. Kill switch and rollout policy

The hard kill-switch name is:

```text
DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY
```

The switch is not enabled by default. The only activation API is the
developer/local debug seam (`globalThis.__fanfanjiMemorySafetyVetoCanary` in a
Vite dev build) or an explicit test/debug configuration. A missing, malformed,
production, or disabled configuration fails closed to legacy behavior. The
debug API supports `enable`, `disable`, `clear`, `count`, and `exportJson`.

Reason gating is independent of the validator. The implementation accepts no
reason other than the explicit first-wave set:

```text
SAFETY_VETO_CANCELLED_PLAN
```

`SAFETY_VETO_TEMPORARY_PREFERENCE` remains shadow-only even though it is an
approved validator reason. Unknown future reasons are disabled and cannot be
inferred from Bridge state.

## 3. Suppression contract

A claim is suppressible only when every gate below is true:

- automatic one-to-one Direct Chat with an active exact relation scope;
- legacy claim was already accepted and `canonical_write` eligible;
- Bridge state is `safety_veto` with reason
  `cancelled_plan_not_active`;
- Safety shadow result is `allow_veto` with the enabled reason;
- legacy and V2 semantic kinds are both `plan`;
- V2 metadata source is `v2_model_native`;
- legacy and V2 provenance are trusted;
- correlation is a unique `conflict` pair from the same extraction lineage;
- both identity diagnostics are exact in character, relation, user identity,
  conversation, source set, and temporal status;
- exactly one accepted legacy claim matches the observed source set and scope.

Every uncertainty is fail-open. Structural fallback, missing/partial/mismatched
lineage, ambiguous or duplicate pairs, cross-scope identity, untrusted
provenance, legacy rejection, V2-only candidates, review/route/passthrough,
non-plan semantics, and validator failure preserve the legacy claim. The
adapter uses a `Set<KnowledgeClaim>` for candidate-local suppression so a
duplicate claim identifier cannot cause an unrelated object to be removed.

The input claim collection is never mutated. A partial batch suppresses only
the eligible claim A and commits B/C through the unchanged writer. If all
accepted claims are vetoed, the existing `ZERO_CANDIDATES` summary cutover is
used: no synchronous Summary/Projection append is manufactured, the existing
archive-progress path may advance the cursor, and the extraction loop does not
repeat the same batch. Summary and Projection inputs are derived from the
remaining final canonical snapshot. The automatic path does not persist a
legacy `MemoryItem` payload; any future compatibility payload must exclude a
vetoed candidate as well.

No event, relationship, scene, payment, proactive, Group, Offline, Diary,
Moments, Character Phone, Reading, Cinema, Inner Voice, Forum, migration,
backfill, image, or voice behavior is routed through this Canary. Manual
archive extraction is explicitly excluded.

## 4. Failure and side-effect policy

The adapter is a brake only: it can prevent a proven unsafe legacy write and
cannot create a write. Exceptions in shadow evaluation or Canary matching are
caught by the existing fail-open boundary; the original extraction result and
normal AI request remain usable. No retry, fallback, Provider attempt, Prompt,
token, or API accounting path is added. The existing independent extraction
fallback debt (`MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK`) remains unchanged.

The Canary does not schedule or own `memory_extract`, `diary_generate`,
relationship updates, scheduler/proactive jobs, or other after-reply effects.
Those existing side effects remain outside this stage.

## 5. Telemetry and privacy

Canary telemetry is bounded to at most 100 in-memory records (configurable only
within that cap). `exportJson()` reports `persistenceMode: "in_memory_only"`
and metadata fields only: evaluation/eligibility, controlled validator reason,
suppression/fail-open state, feature scope, safe correlation/metadata classes,
and batch before/after counts. Reason, correlation, and metadata values are
allowlisted; unknown values are normalized to safe categories. No Prompt,
candidate statement, message text, complete response, source IDs, lineage
tokens, API key, Authorization header, or raw Provider error is stored or
exported. No localStorage, IndexedDB, network, cross-tab writer, or background
runtime was introduced.

## 6. Tests and runtime validation

`scripts/directChatMemorySafetyVetoCanary.test.ts` covers the requested
contract: default/malformed/off flags, cancelled-plan suppression, reason and
temporary-preference gating, missing/partial/structural/ambiguous/duplicate
lineage, cross-scope and source-identity mismatch, provenance and authority
gates, validator failure, partial and all-veto batches, existing zero-candidate
cursor semantics, canonical Summary/Projection inputs, compatibility payload
absence, excluded paths, no Prompt/Provider/writer dependency, bounded
telemetry, privacy, input immutability, and kill-switch rollback behavior.

Two isolated browser-runtime scenarios were executed against the refactor dev
application without Provider calls or durable writes:

1. Synthetic automatic Direct Chat cancelled-plan pair: `suppressed=1`,
   `filteredCount=0`, `inputCount=1`, `canaryEligible=1`, `failOpen=0`, one
   metadata telemetry row.
2. Synthetic automatic Direct Chat control pair (non-safety passthrough):
   `suppressed=0`, `filteredCount=1`, `inputCount=1`, `canaryEligible=0`,
   `failOpen=0`, one metadata telemetry row.

The runtime probe returned no IDs, text, Prompt, Provider body, or secret. It
was disabled immediately after the probe. These are local adapter/runtime
checks, not natural-user evidence and not permission for a cohort rollout.

The current baseline verification is required before stage completion:
`npm run lint`, the dependency gate, `npm test`, and `npm run build`. Existing
tests are retained; the Canary test is additive. Provider request count,
Prompt content/order, token behavior, and retry/fallback behavior remain
unchanged by construction and existing accounting/smoke tests.

## 7. Readiness, rollback, and next stage

Readiness: `CANARY_IMPLEMENTED_LOCAL_VALIDATED` for the narrowly gated local
adapter, with runtime hit/control validated. This does **not** mean full
Admission cutover, positive V2 writes, reason expansion, cohort rollout, or
Phase 2 approval. The design minimum of five sessions/ten suppressions across
three relationships and a seven-day/20-batch window is still outstanding;
therefore the feature must remain default-off and developer/local only.

Turning the kill switch off immediately restores the exact legacy authority.
There is no schema rollback, migration, replay, backfill, cursor rewind, or
user-data repair. A future suppression was not durable until the existing
writer accepted the filtered list. A single revert of the implementation and
test/docs commits removes this stage; the original repository remains a clean
insurance copy at `f515f7408cfe19da145f15a8ddffceae06e608d`.

Recommendation: stop here. Only after review of the bounded local telemetry,
the evidence window, and an explicitly approved next stage should a tiny
reviewed cohort or later Direct Chat authority decision be designed. Do not
start Phase 2 in this stage.

