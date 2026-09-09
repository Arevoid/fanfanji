# Stage 4D-5 — Extractor Taxonomy Contract & Candidate Mapping Design

Status: design-only. This document does not change the extractor Prompt, the
Provider, canonical Memory authority, storage schemas, or production cutover.

- Starting refactor HEAD: \`a1f81936b698b6bc7e2ec6db35ed3238c64367b3\`
- Original repository baseline: \`f515f7408cfe19da145f15a8ddffceae06e608d\`
- Stage 4D-4 evidence: 41 cumulative observations, P0/P1 = 0, readiness
  \`NEED MORE REAL EVIDENCE\`

## 1. Current Extractor Contract

### 1.1 Request and runtime-owned source boundary

Automatic Direct Chat calls \`MemoryService.extractMemories\`, which builds a
runtime-owned \`MemoryExtractionSourceEnvelope\` before calling the existing
\`apiExtractMemoriesWithModelFallback\` path. The envelope owns:

- canonical \`characterId\`, \`relationId\`, \`userIdentityId\`, and optional
  \`conversationId\`;
- the in-window message IDs, sender roles, actor IDs, and timestamps;
- the allowed source-message universe;
- optional \`parentActionId\` and extraction action lineage.

The Provider receives history plus source references, but it does not receive
authority, canonical IDs, or permission to write. Source hints are resolved
against this envelope by \`bindDirectChatMemorySourceHints\`; invalid, duplicate,
partial, or out-of-scope hints are not guessed or repaired to another message.

### 1.2 Legacy model-native output

The existing ordinary extraction JSON candidate is
\`ExtractedKnowledgeCandidatePayload\`:

\`\`\`
statement
memoryText (optional display-only text)
kind = fact | preference | plan | belief | hypothesis
subject = user | character | relationship | other
temporalStatus = past | present | future | timeless | unknown
sourceMessageIds[]
evidenceQuote
\`\`\`

The legacy parser requires all evidence fields, validates source IDs against the
current request, and drops malformed candidates. It has no native fields for
event, episodic, scene-only, relationship signal, subjective reflection,
cancellation, epistemic certainty, or preference durability.

### 1.3 Additive V2 model-native metadata

When the Direct Chat shadow flag is enabled, one response line may carry an
additive \`v2\` object. The normalized
\`MemoryExtractionCandidateV2\` contract currently accepts:

\`\`\`
schemaVersion = 2
kind = fact | event | plan | belief | episodic
        | relationship_signal | scene_only | subjective_reflection | unknown
semanticFacet = preference | hypothesis | relationship_signal
                | scene_only | subjective_reflection (optional)
durability = stable | temporary | unknown (optional)
relationshipSignalKind = promise | trust | conflict | affection
                          | boundary | commitment (optional)
occurredAt / validFrom / validTo (optional non-negative numbers)
confidence / importance (optional bounded numbers)
actorRole / targetRole = user | character | relationship | other (optional)
statement, temporalStatus, sourceMessageIds[], evidenceQuote
\`\`\`

The V2 parser accepts embedded metadata and V2-only candidates from the same
JSON/JSONL response. Unknown optional fields are ignored. An unknown semantic
facet, or a facet/kind conflict, fails safe to \`kind = unknown\`. Invalid source
hints are rejected unless the explicit shadow parser is retaining them for
diagnostic binding.

The Provider does not supply trusted scope, actor IDs, target IDs, candidate
IDs, authority, or canonical write status. The runtime derives those after
parsing.

### 1.4 Parser and normalization projections

The parser creates two projections from one response:

1. legacy \`candidates\`, which enter the existing \`KnowledgeWriteCandidate\`
   path and can affect compatibility extraction behavior;
2. additive \`structuredCandidatesV2\`, which is classification metadata only.

If V2 metadata is absent, the observation path creates
\`shadowCandidatesV2\` from the already accepted/rejected legacy payloads. This
fallback maps legacy \`preference\` to \`kind = fact\` plus
\`semanticFacet = preference\`, maps legacy \`hypothesis\` to
\`kind = belief\` plus \`semanticFacet = hypothesis\`, and maps the remaining
legacy kinds directly. It cannot recover scene, episodic, event, or relationship
semantics that were not present in the response.

If valid structured V2 candidates exist, the Direct Chat candidate adapter uses
them instead of the legacy projection. It binds source hints, derives
authorship and actor/target IDs from the source envelope, adds runtime scope,
recorded time, lineage, and a governed candidate ID, and does not persist the
evidence quote as a candidate body.

### 1.5 Admission and Shadow behavior

\`evaluateMemoryCandidate\` is a pure intake policy. It validates exact scope,
traceable provenance, temporal values, duplicate keys, producer permissions,
and candidate kind. Current destinations are \`truth\`, \`event\`,
\`episodic\`, and \`belief\`.

Current policy outcomes include:

- \`fact\` → accepted truth candidate;
- \`plan\` → accepted truth candidate today, although temporal/open-loop policy
  is not yet explicit;
- \`event\` → accepted event candidate;
- \`episodic\` → accepted episodic candidate;
- \`belief\` → accepted belief candidate;
- \`scene_only\` → rejected;
- \`relationship_signal\` → \`needs_review\`;
- temporary/unknown preference durability → \`needs_review\`;
- unknown kind → rejected;
- direct-chat \`subjective_reflection\` currently fails the producer-kind
  permission check before the more specific non-objective reason can run.

The Shadow adapter compares this V2 intake result with legacy diagnostics. It
records scope/provenance/temporal/mismatch/severity metadata only and never
writes canonical Memory or Relationship state.

## 2. Stage 4D-4 Gap Explanation

The targeted real-runtime samples produced fact, belief, and plan candidates;
they did not prove that the semantic content was absent. The current sanitized
evidence cannot distinguish all of these cases:

- the model omitted optional V2 metadata;
- V2 metadata was malformed and the legacy projection remained valid;
- the model used a legacy kind whose richer distinction is not representable;
- the parser deliberately failed safe and discarded unsupported metadata.

The code explains the observed gaps as follows:

| Target | Code-grounded explanation |
| --- | --- |
| \`event\` | Only additive V2 \`kind = event\` represents it. Legacy output has no event kind, so a legacy response can only remain fact/plan/belief. The parser and adapter can preserve V2 event, but no event can be derived from text after the fact. |
| \`preference\` | Legacy \`kind = preference\` is accepted by the parser but is mapped to an unsupported legacy candidate kind unless V2 supplies \`semanticFacet = preference\`. V2 represents it as \`kind = fact\` plus the facet/durability. A fact-only response loses preference semantics. |
| \`scene_only\` | It exists only in V2 kind/facet. The legacy adapter explicitly reports scene classification unavailable and refuses to infer it from statement text. A fact/belief response has no scene boundary field. |
| \`subjective_reflection\` | It exists only in V2 kind/facet. Legacy \`hypothesis\` is normalized as belief/hypothesis, so a response without V2 collapses reflection into belief. Direct-chat admission currently rejects the V2 kind through producer permission rather than a dedicated non-objective reason. |
| \`relationship_signal\` | It exists only in V2, with an optional signal subtype. Legacy KnowledgeKind has no relationship-signal value. The adapter can preserve the V2 signal, while Admission deliberately stops at \`needs_review\` and never writes RelationshipState. |
| \`episodic\` | It exists only in V2. Legacy KnowledgeKind has no episodic value, so an episodic experience can only arrive as fact/belief unless the model emits valid V2 metadata. |

These six missing targeted kinds are therefore primarily a contract/representation
gap, with some policy layering mixed in; they are not a reason to manufacture
more chat samples or rewrite the Prompt immediately.

## 3. Taxonomy Layering

The current \`kind\` vocabulary mixes three layers:

1. **Semantic content**: fact, event, plan, belief, and episodic.
2. **Authority/policy boundary**: scene-only, relationship signal, and
   subjective reflection.
3. **Durability/detail facet**: preference, hypothesis, and temporary/stable
   durability.

The current implementation partly recognizes this through \`semanticFacet\` and
\`durability\`, but \`MemoryCandidateKind\` still carries both content kinds and
policy roles. \`MemoryAdmissionTarget\` then maps some content kinds to storage
destinations while treating other kinds as policy decisions. A single enum
should not simultaneously select semantic meaning, temporal state, authority,
and storage destination.

Recommended future separation:

\`\`\`
semanticKind    = fact | event | plan | belief | episodic | unknown
temporalStatus  = past | present | future | timeless | unknown
epistemicStatus = objective | subjective | uncertain
durability      = stable | temporary | unknown
authorityRole   = durable_candidate | scene_only | relationship_signal | non_objective
scope           = runtime-bound canonical scope
provenance      = runtime-bound source/authorship/evidence
\`\`\`

Recommendations:

- separate \`semanticKind\`: yes;
- separate \`temporalStatus\`: yes, retaining the existing field and adding an
  explicit cancellation/uncertainty representation only after design review;
- separate \`epistemicStatus\`: yes; belief/hypothesis naming is not a
  sufficient objective/subjective contract;
- separate \`durability\`: yes; the existing field is useful and should remain
  orthogonal to content kind;
- separate \`authorityRole\`: yes; scene and relationship boundaries are policy
  roles, not storage kinds;
- do not require every role to be a model-native kind. Admission can derive or
  validate policy roles from metadata and runtime context.

## 4. Proposed Minimal \`MemoryCandidateV2\`

This is a design contract, not a production type change in Stage 4D-5. Model
output may propose semantic metadata, but runtime owns IDs, scope, provenance,
lineage, and authority.

\`\`\`
MemoryCandidateV2 {
  schemaVersion: 2
  candidateId: runtime-governed opaque ID
  statement: string
  semanticKind: fact | event | plan | belief | episodic | unknown
  temporal: {
    status: past | present | future | timeless | unknown
    occurredAt?: number
    validFrom?: number
    validTo?: number
    lifecycle?: active | cancelled | uncertain
  }
  epistemicStatus: objective | subjective | uncertain
  durability: stable | temporary | unknown
  authorityRole: durable_candidate | scene_only | relationship_signal | non_objective
  subject?: user | character | relationship | other
  relationshipSignalKind?: promise | trust | conflict | affection | boundary | commitment
  scope: { characterId, relationId, userIdentityId, conversationId }
  provenance: runtime-bound producer/source/authorship/actor/target
  evidence: runtime-bound source refs and opaque evidence key
  lineage?: parentActionId / producerActionId / sourceRequestId
}
\`\`\`

\`lifecycle = cancelled\` and \`epistemicStatus\` are proposed gaps, not claims
that the current schema already supports them. If a future producer cannot
populate a required safety field, the candidate must become \`needs_review\` or
be rejected; it must not be upgraded from text heuristics.

## 5. Canonical Mapping Matrix

| Candidate meaning | Admission disposition | Canonical destination |
| --- | --- | --- |
| objective stable fact | accept only with exact scope, evidence, provenance, and non-scene authority | candidate for \`KnowledgeClaim\` via the existing write policy |
| past event | accept as event candidate only; do not treat as current fact | Event/dedicated event layer, or reviewed KnowledgeClaim if a future policy explicitly allows it |
| future plan | defer until plan lifecycle is explicit | plan/OpenLoop boundary; never completed-event Truth |
| cancelled plan | reject as active plan; preserve cancellation only in a reviewed lifecycle layer | no active plan destination |
| uncertain intention | \`needs_review\` or reject as durable write | no active plan until uncertainty is resolved |
| belief / impression | accept only as belief/impression candidate | belief/private reflection layer, never objective Truth |
| stable preference | \`needs_review\` until stable durability and subject are explicit | reviewed durable preference/KnowledgeClaim |
| temporary desire | \`needs_review\` or reject durable write | transient conversation state, not durable Memory |
| scene-only | reject for historical Truth | current Scene/context only |
| subjective reflection | reject for objective Truth; optionally review as private belief | belief/private reflection, not KnowledgeClaim Truth |
| relationship signal | \`needs_review\` | relationship pipeline only; never direct RelationshipState write |
| episodic experience | defer until the destination is explicit | non-authoritative episodic layer or reviewed event projection |

No row above authorizes storage writes in this stage.

## 6. Candidate-to-Claim Adapter Contract

The future explicit path is:

\`\`\`
MemoryCandidateV2
  → AdmissionDecision
  → CandidateToKnowledgeWriteCandidateAdapter
  → evaluateKnowledgeWrite
  → canonical KnowledgeClaim
\`\`\`

### Input

- normalized candidate semantics;
- runtime-owned exact scope and source envelope;
- trusted source-message binding and authorship result;
- producer and scenario policy;
- parent/producer/source request lineage;
- existing idempotency keys supplied by the caller, never read by the pure
  adapter itself.

### Output

An explicit \`AdmissionDecision\` with state, reason, candidate ID, idempotency
key, optional destination, and authority level. Only an accepted durable fact
candidate may be converted into a \`KnowledgeWriteCandidate\`; scene, subjective,
relationship, cancelled-plan, and unresolved episodic cases cannot silently
become claims.

### Reject reasons

\`candidate_invalid\`, \`insufficient_scope\`, \`scope_mismatch\`,
\`missing_provenance\`, \`invalid_temporal\`, \`unsupported_kind\`,
\`producer_not_permitted\`, \`scene_only\`, \`subjective_reflection_not_truth\`,
\`cancelled_plan\`, and \`unsafe_authority_role\`.

### Needs-review reasons

\`duplicate_source\`, \`relationship_signal_requires_review\`,
\`temporary_preference_requires_review\`, \`unknown_preference_durability\`,
\`ambiguous_plan_lifecycle\`, \`episodic_destination_unresolved\`, and
\`subjective_belief_requires_review\`.

### Mapping and safety rules

- Past/future/current status is retained; it is never inferred from storage
  destination alone.
- A cancelled plan cannot be emitted as an active future intent.
- Exact \`characterId\`, \`relationId\`, \`userIdentityId\`, and conversation scope
  are required for Direct Chat.
- Provenance must contain trusted in-window source references or an explicitly
  approved deterministic/manual source.
- Idempotency includes exact scope, source references, semantic dimensions,
  temporal lifecycle, and relevant durability; statement text is not the sole
  deduplication key.
- The adapter never accepts canonical IDs, authority, or authorship asserted by
  the model.

## 7. Missing Metadata Gap Audit

| Decision dimension | Current status | Gap |
| --- | --- | --- |
| objective fact vs past event | Partial: kind and temporalStatus exist | Event is only optional V2; no enforced cross-field destination rule |
| future plan | Partial: kind = plan, temporalStatus = future | No lifecycle or OpenLoop state |
| cancelled plan | Missing | No cancellation/lifecycle field |
| uncertain intent | Partial: legacy hypothesis/V2 facet | No explicit epistemic uncertainty contract |
| subjective belief | Partial: belief/hypothesis | No explicit epistemic status; reflection can collapse into belief |
| stable preference | Partial: V2 preference facet + durability | Legacy preference cannot reach a typed candidate without V2; no canonical preference policy |
| temporary desire | Partial: V2 durability | Admission review exists, but model cannot reliably classify it without metadata |
| current scene | Partial: V2 scene-only facet | No scene boundary object or runtime scene assertion in the extraction candidate |
| episodic memory | Partial: V2 kind | No canonical episodic destination or lifecycle |
| relationship signal | Partial: V2 kind/subtype | No signal strength/status and no relationship pipeline adapter |
| ownership/actor | Available at runtime | Model roles are hints; runtime source binding remains authoritative |
| source/provenance | Available at runtime | Evidence quote is model-provided and remains non-authoritative |

Current metadata is not sufficient for safe durable mapping of all targeted
semantics. It is sufficient to preserve a bounded shadow proposal and
reject/defer unsafe cases.

## 8. Canary Gates (future design, not implementation)

A future canary must not require every enum to be emitted by the model. It must
require:

1. **Contract gate** — every legacy and V2 output field is parsed deterministically;
   malformed/unknown metadata fails safe.
2. **Disposition gate** — every legacy kind/facet has an explicit accept, reject,
   or needs-review decision and test.
3. **Safety gate** — zero unresolved P0/P1 for privacy, exact scope,
   provenance, scene→Truth, subjective→objective Truth, relationship mutation,
   plan temporal corruption, and cross-character leakage.
4. **Metadata gate** — temporal, epistemic, durability, and authority decisions
   have sufficient fields; missing fields cannot be inferred from statement text.
5. **Adapter gate** — the candidate-to-claim adapter is explicit, pure,
   idempotent, and tested for rejection/review reasons.
6. **Equivalence gate** — shadow/canary does not change existing Prompt,
   Provider request count, retry/fallback behavior, or legacy authority.
7. **Provenance gate** — every accepted candidate binds to the exact canonical
   character/relation/identity/conversation scope and an in-window source.
8. **Privacy gate** — evidence exports contain metadata only; no body, Prompt,
   raw response, key, Authorization header, or raw source IDs.
9. **Rollback gate** — legacy authority remains the fallback, the canary is
   feature-flagged, and disabling it cannot delete or rewrite existing data.
10. **Real-evidence gate** — targeted semantic boundaries have real runtime
    evidence where available; un-emitted kinds are documented as unobserved,
    not manufactured to make coverage green.

## 9. Provider Fallback Debt

The current path starts extraction with the default \`gemini-3.5-flash\`, receives
\`503 model_not_found/provider_unavailable\` on the configured endpoint, then
retries with the active chat model. The smallest future fix belongs in model
resolution before the first extraction request: resolve the effective
extraction model from the active configured model (or an explicitly configured
extraction override), and only use the fallback wrapper for genuine transport
or model failures.

This should be a separate Provider/runtime configuration change. It must not be
combined with Admission cutover or candidate mapping.

## 10. Recommended Next Stage

Recommendation: **B + D**.

- **B — additive metadata extension:** first specify and test the smallest
  missing fields (\`epistemicStatus\`, explicit plan lifecycle/cancellation, and
  authority role) without changing canonical storage or Prompt behavior.
- **D — Admission/policy derivation:** treat scene-only, relationship signal,
  and non-objective reflection primarily as policy roles, validated or derived
  from metadata and runtime context rather than requiring a large enum of
  storage kinds.
- **A is insufficient:** the current contract is understood, but it cannot
  safely distinguish all requested durability, epistemic, and lifecycle cases.
- **C is not yet recommended:** the current Prompt already advertises optional
  V2 kinds. Do not expand it again until the additive fields and parser/admission
  tests define exactly what must be emitted.

The next stage should be a contract-only/additive metadata characterization with
parser and policy tests, followed by a small real-runtime sample only if those
fields are proven necessary. It must not implement a canary or write canonical
Memory.

## 11. Invariants and Change Boundary

The following remain mandatory:

- Memory is not Scene;
- Event is not Current Scene;
- Relationship is not Memory;
- Memory cannot rewrite Relationship;
- Memory cannot imply co-location;
- canonical \`characterId\` scope is exact;
- cross-character leakage is forbidden;
- Diary/private reflection is not Truth.

Production code changed: no. Production authority changed: no. Production
cutover: no. This document is the only intended Stage 4D-5 artifact.

