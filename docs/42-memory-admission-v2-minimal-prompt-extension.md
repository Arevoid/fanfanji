# Stage 4D-8 — Minimal Prompt/Schema Extension

Status: **BLOCKED by a real-runtime P1 legacy/V2 mismatch**. The minimal
metadata Prompt extension is present and produced model-native V2 metadata in
Batch A, but the required P1=0 condition was not met. Batches B and C were not
run after the blocker appeared.

- Starting refactor HEAD: `225dcfa4ade34b88f5a7af56ccf91fbdc79a9eb0`
- Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Persistence mode: `observation_only`
- Production authority/canonical writes: unchanged

## 1. Measured Stage 4D-7 gap

Stage 4D-7 produced seven observations, all `metadataSource=legacy`, with no
model-native `epistemicStatus`, `planLifecycle`, `durability`, or authority
metadata. The current Prompt therefore needed a narrow additive extension.

## 2. Exact Prompt/schema change

The existing V2 shadow instruction was retained. Only these additive pieces
were added or clarified:

- `epistemicStatus`: `objective | subjective | uncertain | unknown`;
- `planLifecycle`: `active | cancelled | uncertain | completed | unknown`;
- explicit durability meanings for `stable | temporary | unknown`;
- the existing optional `authorityRole` proposal was shown in the JSON shape
  and explicitly marked as semantic metadata, never write authority.

The rules are intentionally short: no reasoning/explanation field, no
few-shot test transcript, no Prompt rewrite, and no new taxonomy kind.
Preference remains `semanticFacet=preference` plus `durability`.
Subjective reflection may remain `belief`/`hypothesis` or the existing
`subjective_reflection` V2 representation.

The dev-only `extractNow()` path received an explicit
`enableV2Metadata: true` option. This opt-in is observation-only and does not
change normal automatic Direct Chat, which still keeps the prior
`enableAdmissionShadowObservation` path without the V2 Prompt.

## 3. Prompt size

For the same characterization input used in Stage 4D-7:

- previous V2 Prompt: 2,136 characters;
- extended V2 Prompt: 2,939 characters;
- incremental extension: **803 characters**, approximately **201 tokens**;
- total V2-over-legacy overhead: 2,114 characters, approximately 529 tokens.

The extension contains only enum definitions and safety boundaries; it does
not add verbose policy prose.

## 4. Parser and compatibility

The existing V2 parser already accepts all added fields. Tests cover:

- objective, subjective, uncertain, unknown;
- active, cancelled, uncertain, completed, unknown;
- stable, temporary, unknown;
- valid and malformed metadata (malformed values normalize to `unknown`);
- V2 absent/legacy-only, mixed legacy+V2, and V2-only output;
- one extraction response and one Provider call for additive V2 metadata;
- unchanged retry/fallback behavior.

No storage, KnowledgeClaim, Event, RelationshipState, cursor, Summary, or
ProjectionJob schema changed.

## 5. Batch A real-runtime result

One fresh epistemic batch was run in the existing isolated temporary
conversation. It used three new synthetic messages covering objective,
subjective, and uncertain semantics. The dev-only extraction completed with:

- `extractNow()` completed: 1;
- `memory_extract` logical records: 2;
- default-model failures: 1;
- active-model fallback successes: 1;
- observations: 3;
- model-native V2 observations: 3;
- legacy-fallback observations: 0;
- `epistemicStatus`: present 3/3 — objective 1, subjective 1, uncertain 1;
- `planLifecycle`: missing 3/3 (not a plan batch);
- `durability`: missing 3/3 (not a preference batch);
- proposed/resolved authority roles were present for all 3 observations;
- exact scope/provenance/traceability: 3/3.

The model-native V2 fields are therefore observable after the extension.

## 6. Blocking safety finding

The subjective candidate produced this sanitized comparison:

- legacy projection: `accepted`;
- V2 policy: `rejected` with `subjective_not_objective_truth`;
- `metadataSource`: `v2`;
- scope/provenance: exact;
- Shadow severity: **P1**.

This is conservatively rejected by V2 and did not write canonical authority in
observation-only mode. However, the legacy projection still accepts the same
semantic candidate. It is therefore an unresolved legacy/V2 authority
mismatch, not evidence that the safety boundary is complete. The remaining two
observations were P4; P0=0, P1=1, P2=0, P3=0, P4=2.

The run was stopped immediately. No plan or preference batches were executed,
and no attempt was made to change Shadow severity, legacy admission, or Prompt
semantics to hide the mismatch.

## 7. Privacy and authority invariants

The real export remained schema version 2 / producer version
`admission-v2-shadow.v2` and metadata-only. It contained no statement/chat
body, Prompt, raw response, evidence quote, raw IDs, candidate ID,
idempotency key, API key, Authorization, exception body, or stack trace.

The observation-only branch did not write KnowledgeClaim, cursor, Summary,
ProjectionJob, MemoryItem, Event, or RelationshipState, and production
authority/cutover remained unchanged.

## 8. Readiness and next step

Prompt extension effective: **partially** — epistemic metadata is now
observable, but plan and preference batches were not run because of the P1.

Metadata sufficient for Canary: **no**.

Readiness: **BLOCKED**.

Next recommended step: separately audit and resolve the legacy projection
acceptance of model-native subjective candidates, with a focused policy/legacy
compatibility change approved before any further real metadata batches. Do not
start Canary or production cutover.
