# Stage 4D-6 — Additive Metadata Contract & Policy Derivation Foundation

Status: additive shadow foundation. No production Admission cutover, canonical
Knowledge write cutover, storage migration, Prompt change, Provider change, or
production authority change was performed.

- Starting refactor HEAD: \`8b958f219fc5018945794aac5b316dc5684fbfad\`
- Original repository baseline: \`f515f7408cfe19da145f15a8ddffceae06e608d\`

## 1. Additive fields

The V2 Provider response metadata now accepts three additional optional fields:

- \`epistemicStatus\`: \`objective | subjective | uncertain | unknown\`
- \`planLifecycle\`: \`active | cancelled | uncertain | completed | unknown\`
- \`authorityRole\`: \`durable_candidate | scene_only | relationship_signal |\`
  \`non_objective | transient | unknown\`

These are additive to \`MemoryExtractionCandidateV2Metadata\`. The legacy
\`fact/preference/plan/belief/hypothesis\` payload shape remains unchanged.

The runtime candidate carries the corresponding explicit ownership fields:

- \`metadataSource = legacy | v2\`
- \`epistemicStatus\`
- \`planLifecycle\`
- \`proposedAuthorityRole\`
- \`resolvedAuthorityRole\`

No new KnowledgeClaim, Event, RelationshipState, MemoryItem, or IndexedDB field
was added.

## 2. Model-proposed vs runtime-owned vs policy-derived

### Model-proposed

The Provider may propose:

- semantic kind/facet;
- \`epistemicStatus\`;
- \`planLifecycle\`;
- \`durability\`;
- \`authorityRole\`;
- relationship signal subtype;
- actor/target roles;
- statement/evidence/source hints.

These values are untrusted metadata. The Provider cannot grant authority.

### Runtime-owned

The runtime continues to own:

- canonical character, relation, identity, and conversation scope;
- candidate ID and idempotency context;
- source-message binding and allowed source universe;
- authorship, actor/target canonical IDs, recorded timestamp;
- producer and lineage;
- \`metadataSource\`.

### Policy-derived

Pure runtime policy derives:

- \`resolvedAuthorityRole\`;
- metadata conflicts;
- accept/reject/needs-review state;
- destination and deterministic reason code.

A model-proposed \`durable_candidate\` never bypasses policy validation.

## 3. Normalization

\`normalizeMemoryExtractionCandidateV2\` accepts valid enum values and preserves
missing optional fields. Malformed enum values normalize to \`unknown\`, which
cannot silently become authority.

The adapter marks valid structured metadata as \`metadataSource = v2\` and fills
missing V2 epistemic/lifecycle/authority fields conservatively with
\`unknown\`. Legacy-derived shadow candidates are marked \`metadataSource =
legacy\` and continue through the pre-existing policy behavior; they do not gain
objective status from ordinary fact text.

The parser still accepts:

- embedded \`v2\` metadata alongside a legacy candidate;
- V2-only candidates;
- legacy-only candidates.

Unknown fields remain ignored, canonical IDs remain runtime-bound, and source
hints remain subject to the existing source-envelope binding.

## 4. Cross-field policy derivation

\`resolveMemoryCandidateAuthorityRole\` derives a role from semantic facets,
candidate kind, epistemic status, and the untrusted proposal:

- scene semantic role wins over a durable proposal;
- relationship signal semantic role resolves to relationship review;
- subjective epistemic status resolves to \`non_objective\`;
- temporary preference resolves to \`transient\`;
- objective content without a conflicting role may resolve to
  \`durable_candidate\`;
- missing/unknown safety metadata remains conservative.

Conflicting proposed and resolved combinations return
\`metadata_conflict\`. A model-provided \`resolvedAuthorityRole\` is not trusted
if it disagrees with the runtime recomputation.

## 5. Admission reason codes

The existing decision states and targets are retained. New deterministic reasons
are:

### Rejection

- \`subjective_not_objective_truth\`
- \`scene_only_not_truth\`
- \`cancelled_plan_not_active\`
- \`completed_plan_not_active\`
- \`unsafe_authority_role\`
- \`metadata_conflict\`

### Needs review

- \`uncertain_plan_requires_review\`
- \`active_plan_requires_review\`
- \`temporary_preference_not_durable\`
- \`stable_preference_requires_review\`
- \`missing_epistemic_status\`

Existing compatibility reasons, including
\`subjective_reflection_not_truth\`,
\`temporary_preference_requires_review\`, and \`scene_only\`, remain available
for legacy/non-V2 paths.

## 6. Policy outcomes

- Subjective belief/reflection: never objective Truth; V2 returns
  \`subjective_not_objective_truth\`.
- Scene-only: never Truth; V2 returns \`scene_only_not_truth\`.
- Relationship signal: \`needs_review\` with
  \`relationship_signal_requires_review\`; no RelationshipState write.
- Active plan: \`needs_review\` with \`active_plan_requires_review\`; no durable
  Truth or OpenLoop implementation.
- Cancelled plan: rejected as active with \`cancelled_plan_not_active\`.
- Uncertain/unknown plan: \`needs_review\` with
  \`uncertain_plan_requires_review\`.
- Completed plan: rejected as active with \`completed_plan_not_active\`.
- Stable preference: \`needs_review\` with
  \`stable_preference_requires_review\`.
- Temporary preference: \`needs_review\` with
  \`temporary_preference_not_durable\`.
- Unknown preference durability: \`needs_review\` with
  \`unknown_preference_durability\`.
- Missing epistemic metadata: \`needs_review\` with
  \`missing_epistemic_status\`.
- Unknown/malformed authority: \`needs_review\` or
  \`metadata_conflict\`, never automatic Truth.

No V2 policy outcome writes canonical storage in this stage.

## 7. Legacy compatibility

The legacy output kinds remain:

- fact;
- preference;
- plan;
- belief;
- hypothesis.

Legacy parsing, candidate count, and existing production write behavior remain
unchanged. Legacy \`hypothesis\` is only classified conservatively as uncertain
in the shadow projection; it is not upgraded to objective Truth. Existing legacy
policy tests continue to pass.

V2 metadata changes only additive candidate/admission/shadow behavior. It does
not change the extraction Prompt or the existing legacy claims.

## 8. Shadow telemetry

Metadata-only Shadow observations now carry, when available:

- \`metadataSource\`;
- \`epistemicStatus\`;
- \`planLifecycle\`;
- \`proposedAuthorityRole\`;
- \`resolvedAuthorityRole\`;
- existing policy decision, target, mismatch, scope, provenance, temporal and
  severity fields.

The sanitized producer version is \`admission-v2-shadow.v2\` and the export
schema version is 2. These fields are classifications only; they do not add a
network sink, persistence sink, Provider call, or canonical write.

## 9. Privacy

The sanitizer continues to exclude:

- statement, chat/reply bodies, Prompt and system Prompt;
- raw Provider response;
- raw message/source/scope/character/relation/identity IDs;
- API key and Authorization;
- exception bodies and stack traces;
- candidate IDs and idempotency keys.

Only bounded enum/boolean/count/fingerprint metadata is exported. Runtime source
binding and canonical scope remain internal to the process.

## 10. Tests

Added/updated coverage verifies:

- valid, invalid, and missing epistemic status;
- valid, invalid, and missing plan lifecycle;
- valid and invalid authority role;
- legacy payload compatibility;
- subjective, scene-only, relationship, plan lifecycle, preference durability,
  missing epistemic, and metadata conflict decisions;
- model-provided scope/authority/authorship cannot override runtime binding;
- new Shadow fields are metadata-only and the privacy sanitizer still excludes
  forbidden data.

The relevant existing extraction, adapter, Shadow privacy, accounting, and
dependency tests remain active.

## 11. Provider and request equivalence

No Prompt content changed. No Provider call was added.

The following remain unchanged by design:

- chat_reply Provider request count;
- memory_extract Provider request count;
- retry behavior;
- model fallback behavior;
- automatic extraction threshold;
- cursor and summary/projection behavior.

The default-model extraction fallback debt
\`MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK\` remains documented and unfixed.

## 12. Remaining gaps and recommended next stage

Remaining gaps:

- no explicit model Prompt instruction for the new fields;
- no production storage destination for episodic memory;
- no OpenLoop implementation;
- no relationship pipeline adapter;
- no dedicated Scene object in extraction candidates;
- no canonical plan cancellation record;
- no real-runtime evidence for the newly normalized metadata;
- provider default-model fallback remains an extra failed request.

Recommended next stage: contract review plus additive parser/policy characterization,
then a minimal compatibility smoke only if it can observe existing Provider output
without changing the Prompt or request count. Do not begin Canary implementation
or production cutover until the adapter and lifecycle metadata are separately
approved.

## 13. Change boundary

Production authority changed: no.
KnowledgeClaim schema changed: no.
Storage schema changed: no.
Prompt changed: no.
Provider request count changed: no.
Retry/fallback behavior changed: no.
Production cutover: no.

