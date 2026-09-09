# Stage 4D-4 — Real Runtime Admission Evidence Coverage

Status: development-only, metadata-only evidence. No production Admission
cutover was performed.

## Run boundary

- Starting refactor HEAD: `b36ac143cc7c1539f4442c0ffca798bf695223bf`
- Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Runtime: refactor development server at localhost, normal one-to-one Direct Chat UI
- Provider path: real configured Provider through the existing runtime adapter
- Extraction path: real `extractNow()` → real Memory Extraction → real parser/source binding → Admission Shadow
- Persistence mode: `observation_only`
- Synthetic transcripts, fixtures, fake Provider responses, and manually edited evidence JSON: none
- Batch isolation: eight short, purpose-specific temporary Direct Chat conversations; Shadow was cleared before each batch
- New user messages in this stage: 11
- `extractNow()` calls in this stage: 8

The isolated conversations avoid treating the unchanged observation-only extraction
window as new evidence from a previous batch. No production cursor was advanced.

## Batch coverage

`messageCount` is the selected conversation-window count reported by the runtime;
it is not the number of new user messages. Every batch had `shadowBefore = 0`,
`persistenceMode = observation_only`, and an unchanged authority snapshot.

| Batch | Targeted semantic area | New user messages | messageCount | candidates | shadow after | comparable / incomparable | both accepted | P0/P1/P2/P3/P4 | Emitted taxonomy |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A | event | 1 | 2 | 3 | 3 | 0 / 3 | 0 | 0/0/0/3/0 | fact ×3 |
| B | belief / impression | 1 | 4 | 3 | 3 | 1 / 2 | 1 | 0/0/0/2/1 | fact ×2, belief ×1 |
| C | stable and temporary preference | 2 | 8 | 5 | 5 | 3 / 2 | 2 | 0/0/1/2/2 | fact ×4, belief ×1 |
| D | scene-only | 1 | 10 | 5 | 5 | 5 / 0 | 3 | 0/0/2/0/3 | fact ×4, belief ×1 |
| E | subjective reflection | 1 | 12 | 5 | 5 | 5 / 0 | 4 | 0/0/1/0/4 | fact ×3, belief ×2 |
| F | relationship signal | 1 | 14 | 5 | 5 | 5 / 0 | 4 | 0/0/1/0/4 | fact ×4, belief ×1 |
| G | episodic | 1 | 16 | 5 | 5 | 5 / 0 | 4 | 0/0/1/0/4 | fact ×3, belief ×2 |
| H | future / cancelled / uncertain plan temporal cases | 3 | 22 | 5 | 5 | 5 / 0 | 4 | 0/0/1/0/4 | fact ×3, plan ×1, belief ×1 |

All eight batches completed with `providerRequestObserved = true` and a real
Direct Chat response. The exported Shadow metadata for every batch had an empty
forbidden-field list.

## Stage 4D-4 aggregate

| Metric | Count |
| --- | ---: |
| total observations | 36 |
| comparable | 29 |
| incomparable | 7 |
| both accepted | 22 |
| both rejected | 0 |
| legacy accepted / V2 rejected | 0 |
| legacy rejected / V2 accepted | 0 |
| kind mismatch | 0 |
| scope mismatch | 0 |
| provenance mismatch | 0 |
| temporal mismatch | 0 |
| duplicate mismatch | 0 |
| failed-open | 0 |
| P0 / P1 / P2 / P3 / P4 | 0 / 0 / 7 / 7 / 22 |

## Cumulative Stage 4D-3 + Stage 4D-4 evidence

The Stage 4D-3 sample contributed 5 observations (fact ×4, plan ×1). The
following totals add those observations once to the eight isolated Stage 4D-4
batches; no source fingerprint was counted twice.

| Metric | Cumulative count |
| --- | ---: |
| total observations | 41 |
| comparable | 34 |
| incomparable | 7 |
| both accepted | 25 |
| both rejected | 0 |
| legacy accepted / V2 rejected | 0 |
| legacy rejected / V2 accepted | 0 |
| kind mismatch | 0 |
| scope mismatch | 0 |
| provenance mismatch | 0 |
| temporal mismatch | 0 |
| duplicate mismatch | 0 |
| failed-open | 0 |
| P0 | 0 |
| P1 | 0 |
| P2 | 9 |
| P3 | 7 |
| P4 | 25 |

The conservative disposition for all nine P2 observations is
`insufficient_evidence`, tracked as `mapping_debt`. Metadata-only evidence does
not justify classifying any of them as an expected V2 improvement, a legacy
limitation, or a V2 false negative. No P0 or P1 gate was opened.

## Taxonomy coverage and mapping review

Cumulative emitted candidate counts are fact ×30, belief ×9, and plan ×2.
The remaining targeted kinds were not emitted by the current extractor in the
targeted real samples:

- `event`: not emitted; the event-targeted sample produced fact candidates.
- `preference`: not emitted; stable preference and temporary desire could not be
  distinguished by the observed output.
- `scene_only`: not emitted; no scene candidate was promoted to a durable Truth.
- `subjective_reflection`: not emitted; the observed output remained fact/belief
  shaped and produced no objective-Truth P1 finding.
- `relationship_signal`: not emitted; no RelationshipState or Truth mutation
  occurred.
- `episodic`: not emitted; the sample produced fact/belief candidates only.
- `unknown`: not observed and was not manufactured for coverage.

These are recorded as `not_emitted_by_current_extractor`, not synthesized into
the evidence. The results are insufficient to implement a production mapping.

### Candidate-to-claim adapter readiness

The explicit adapter shape remains a design target only:

`MemoryCandidate → AdmissionDecision → CandidateToKnowledgeWriteCandidateAdapter → evaluateKnowledgeWrite → KnowledgeClaim`

Current readiness by kind:

| Kind | Current disposition |
| --- | --- |
| fact | `needs_review`; emitted, but not enough evidence for canonical write policy |
| belief | `needs_review`; must remain distinct from unsupported objective fact |
| plan | `deferred`; temporal state is not sufficiently observable in this export |
| event | `deferred`; not emitted by current extractor |
| preference | `deferred`; stable versus temporary durability is unresolved |
| episodic | `deferred`; no direct canonical KnowledgeKind mapping is approved |
| relationship_signal | `reject` for direct authority write / `needs_review` for a future boundary layer |
| scene_only | `reject` for historical Truth authority |
| subjective_reflection | `reject` for objective Truth authority |
| unknown | `needs_review`; no real sample was observed |

No production adapter or canonical write path was changed.

### Boundary conclusions

- Stable preference and temporary desire require separate durability semantics;
  the current evidence cannot define either canonical write rule.
- The plan batch emitted one plan candidate, but did not expose enough sanitized
  temporal detail to prove future, cancelled, and uncertain states separately.
  No temporal mismatch was observed; the OpenLoop boundary remains deferred.
- Episodic material needs either a dedicated non-authoritative layer or an
  explicitly reviewed event projection; neither is selected by this evidence.
- Relationship signals must remain `needs_review` and must not write
  `RelationshipState` directly.
- Scene-only material must remain outside historical Truth authority.
- Subjective reflection must not be upgraded to objective Truth.

## Privacy and authority invariants

Every exported batch reported `evidenceOrigin = real_runtime` and
`forbiddenFieldHits = []`. The metadata-only export contained no chat or reply
body, Prompt/system prompt, raw Provider response, API credential,
Authorization header, raw source/message/scope/identity IDs, exception text, or
stack trace.

Before/after opaque metadata summaries were equal for every batch:

- KnowledgeClaim storage: unchanged
- direct-chat cursor/relationship storage: unchanged
- Conversation Summary storage: unchanged
- Memory ProjectionJob IndexedDB store: unchanged
- MemoryItem storage: unchanged

No production authority was modified, and no production cutover occurred.

## Extraction model fallback debt

Each of the eight Stage 4D-4 extractions created two logical
`memory_extract` records: one primary failure using the default model name and
one successful fallback using the active configured model. Combined with the
two Stage 4D-3 records, the cumulative total is:

- memory_extract logical requests: 18
- primary default-model failures: 9
- fallback successes: 9
- provider attempts per logical record: 1
- retry/fallback counters on each record: 0

This is the existing `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK` debt. It adds an
extra failed request, latency, and provider/accounting cost per extraction. The
fallback was reliable for all nine runs, but the default-model configuration
remains unresolved and was not changed in this stage.

## Evidence sufficiency

Result: `NEED MORE REAL EVIDENCE`.

There are zero unresolved P0/P1 privacy, scope, provenance, authority, or
cross-character findings. However, targeted event, preference, scene-only,
subjective-reflection, relationship-signal, and episodic kinds were not emitted;
stable/temporary preference semantics and plan temporal semantics remain
unresolved; and the candidate-to-claim adapter is not yet sufficiently defined
for canary design. No canary or production Admission implementation should be
started from this evidence alone.

## Change boundary

- Production code changed: no
- Production authority changed: no
- Prompt/provider/retry behavior changed: no
- Production cutover: no
- New document: this metadata-only coverage report
