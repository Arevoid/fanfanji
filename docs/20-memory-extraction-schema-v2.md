# Memory Extraction Schema V2 — compatibility foundation

Status: Stage 4C-4 design and additive compatibility baseline. Stage 4C-5 adds
an opt-in shadow producer for automatic normal Direct Chat only; see
`docs/21-memory-extraction-v2-producer-shadow.md`. Neither stage authorizes a
production Admission switch or a Memory write/read migration.

## 1. Current contract audit

The current extraction Prompt and `normalizeExtractedKnowledgeCandidate` accept
only `fact`, `preference`, `plan`, `belief`, and `hypothesis`, plus a subject,
temporal status, source message IDs, and an evidence quote. `MemoryExtractor`
then verifies the quote, applies the existing `evaluateKnowledgeWrite` gate,
and returns `acceptedClaims` (and the compatibility `extractedMemories` view).
The old result does not carry extraction metadata beyond the accepted claim.

| Meaning needed by Memory V2 | Old schema | Gap and V2 decision |
| --- | --- | --- |
| fact | `kind=fact` | Expressible; preserve. |
| preference | `kind=preference` | Expressible as a legacy kind, but the candidate adapter cannot distinguish stable from temporary. V2 uses `kind=fact` plus `semanticFacet=preference` and `durability`. |
| plan | `kind=plan` | Expressible; preserve. |
| belief | `kind=belief` | Expressible; preserve. |
| hypothesis | `kind=hypothesis` | Old kind is not an admissible `MemoryCandidateKind`. V2 uses `kind=belief` plus `semanticFacet=hypothesis`; it remains a belief candidate, never authoritative Truth. |
| event | absent | V2 `kind=event`. |
| episodic experience | absent | V2 `kind=episodic`. |
| relationship signal | absent | V2 `kind=relationship_signal`, optional controlled subtype. Admission remains `needs_review`. |
| scene-only material | absent | V2 `kind=scene_only` or `semanticFacet=scene_only`; Admission rejects canonical Truth. |
| subjective reflection | absent | V2 `kind=subjective_reflection`; Admission rejects canonical Truth. |
| temporal status | `temporalStatus` | Preserve; V2 also permits optional occurred/valid bounds. |
| source ownership | message IDs and evidence quote | Preserve message references. Canonical scope and provenance remain runtime-owned. |
| actor/target roles | absent | V2 descriptive roles only; adapter resolves them to canonical runtime IDs. |
| confidence/importance | absent from parser | V2 optional bounded values; invalid values are dropped. |
| durability | absent | V2 `stable`, `temporary`, or `unknown`; temporary/unknown preferences require review. |

Therefore the old extraction schema is **not sufficient to express the full
Memory V2 semantic set without ambiguity**. It remains sufficient for the
legacy Knowledge path and is retained unchanged.

## 2. Additive V2 contract

`src/domain/memory/memoryExtractionSchema.ts` defines
`MemoryExtractionCandidateV2`. It is deliberately an AI-facing extraction
shape, not a `MemoryCandidate` replacement. It contains source message IDs and
an evidence quote so the existing evidence gate can still inspect the source;
the runtime adapter supplies canonical scope, provenance, lineage, and the
recording timestamp.

Required fields are `schemaVersion=2`, `kind`, `statement`,
`temporalStatus`, non-empty allowed `sourceMessageIds`, and `evidenceQuote`.
Optional fields are controlled semantic facets, durability, relationship signal
subtype, bounded confidence/importance, actor/target roles, and temporal
bounds. Unknown fields are ignored. Unknown facets make the candidate
`unknown`; malformed optional numbers/roles are omitted or downgraded. Source
IDs outside the current extraction history are rejected.

The parser accepts the same JSON/JSONL framing as the old parser through
`parseMemoryExtractionCandidateV2Output`. The old parser remains the default
and continues to produce the old payload shape.

## 3. Semantic decisions

* A stable preference is represented as a fact candidate with
  `semanticFacet=preference`, `durability=stable`. The existing Admission
  target is Truth, but authority is still `candidate_only`.
* A temporary or durability-unknown preference is not silently made timeless;
  the additive Admission foundation returns `needs_review` with a dedicated
  reason.
* A hypothesis is a belief candidate with `semanticFacet=hypothesis`. It can
  target the belief channel, never authoritative Truth. If neither canonical
  actor nor target can be resolved, it returns `needs_review`.
* Events and episodic experiences are separate candidate kinds and retain their
  own Admission targets.
* A relationship signal may include `promise`, `trust`, `conflict`,
  `affection`, `boundary`, or `commitment`. It describes a signal only; it
  does not mutate RelationshipState.
* `scene_only` and `subjective_reflection` are expressible for diagnostics and
  future review, but remain rejected by the current canonical Truth Admission.
* Temporal status and bounds are descriptive. Existing temporal validation and
  status vocabulary remain authoritative.

## 4. Adapter and compatibility behavior

`MemoryExtractionResult` retains `acceptedClaims` and
`rejectedCandidateCount`, and now has optional `structuredCandidatesV2` plus
classification-only `rejectedCandidates` diagnostics. `MemoryExtractor` only
passes V2 metadata through; it does not write it, switch legacy reads, or
replace `evaluateKnowledgeWrite`.

When `structuredCandidatesV2` is present, the Direct Chat candidate adapter
uses it in preference to the old claim projection. If it is absent, the exact
Stage 4C-3 `acceptedClaims` fallback remains. The adapter resolves actor and
target *roles* from the supplied canonical runtime scope; it never derives IDs
from names or model text. AI metadata receives `authorship=unknown`. Evidence
quotes are used only during extraction validation and are not copied into a
`MemoryCandidate`.

The backend API helper accepts an additive `structuredCandidatesV2` response
field and validates its source IDs before passing it through. The browser
fallback uses the same additive Prompt only when the automatic Direct Chat flag
is present; all other callers retain the legacy Prompt and parser. There are no
extra Provider calls: normal extraction remains one request, and the existing
repair behavior is unchanged.

## 5. Rejection and privacy contract

Parser rejection, the existing Knowledge gate, and future Memory Admission are
separate layers. Optional `rejectedCandidates` diagnostics use only a stage,
controlled reason text, candidate kind, and source-message count. They must
not contain statements, evidence quotes, prompt text, response bodies, API
keys, Authorization headers, or exception messages. The current foundation
does not persist those diagnostics.

## 6. Backward compatibility and rollout boundary

Old responses continue to parse. Missing V2 metadata is safe and selects the
legacy path. Unknown optional fields are ignored, while malformed optional
values fail safe. Existing Prompt wording, block order, WorldBook/Truth/
Memory selection, Provider transport, retry/fallback policy, storage schema,
and user data are unchanged. At the Stage 4C-4 baseline the production Prompt
did not request V2. Stage 4C-5 adds an explicit automatic-Direct-Chat-only
flag; other callers and the legacy production write path remain unchanged.

No candidate persistence, queue, worker, semantic deduplication, embedding,
Offline V2 cutover, Relationship/Scene mutation, or dashboard/telemetry path is
introduced in this stage. Direct Chat is **not** approved to switch to the new
Admission path; that requires separate evidence and an explicit later stage.

## 7. Verification contract

Focused tests cover legacy parsing, V2 normalization, source-ID boundaries,
unknown-field/unknown-facet handling, adapter mapping, controlled reason
semantics, and evidence-body non-retention. The full repository suite, lint,
build, AI accounting, extraction fallback tests, and dependency gate remain
required for Stage 4C-4 and Stage 4C-5 acceptance.
