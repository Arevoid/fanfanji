# Stage 4D-1 — Memory Admission V2 Production Readiness and Shadow Evidence Plan

Status: design and audit only; no production authority switch

Audited refactor baseline: `29c3e7397fee38f192affa0f76d728123057d45f`

Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`

Quality baseline at audit start: 569/569 tests, lint pass, build pass, dependency gate pass (105 allowlisted edges and 3 existing cycles), AI accounting pass, and `smoke:check` pass.

## 1. Executive decision

Memory Admission V2 is **not** the production authority. The current Direct Chat write authority remains the legacy extraction path: parser and source binding followed by `evaluateKnowledgeWrite`, then canonical `KnowledgeClaim` append through the existing write coordinator. V2 currently classifies candidates and is suitable for characterization/shadow work, but it does not decide persistence.

Stage 4D-1 therefore does not change runtime behavior, prompts, provider calls, storage, cursor semantics, or user data. It records the evidence and cutover gates needed before a future, narrowly scoped canary. It does not create Stage 4C-18 and does not authorize a production cutover.

The absence of a real Admission shadow report is primarily a product-wiring/evidence problem, not only a browser-CUA problem: the normal automatic Direct Chat hook does not call the Admission adapter or shadow evaluator, and there is no production report sink or export. A browser run cannot produce a report that the application never creates.

## 2. Contracts that remain locked

The following ownership is unchanged:

| Contract | Authority/role |
| --- | --- |
| `KnowledgeClaim` | Canonical Truth authority |
| `ConversationSummary` | Rebuildable derived projection |
| `ProjectionJob` | Durable projection intent |
| Cursor | Canonical intake processing progress |
| `MemoryItem` | Legacy compatibility surface |

Normal automatic Direct Chat remains:

```text
canonical KnowledgeClaim commit
  -> final canonical snapshot
  -> durable ConversationSummary enqueue

inserted / exists -> no synchronous Summary write
unavailable      -> synchronous canonical Summary fallback
```

Summary is not an authority and this stage does not change that ordering.

## 3. Lifecycle and current authority audit

The actual current lifecycle is:

```text
provider extraction
  -> legacy/V2-additive parser
  -> runtime source-envelope binding
  -> legacy KnowledgeWriteCandidate construction
  -> evaluateKnowledgeWrite
  -> acceptedClaims: KnowledgeClaim[]
  -> commitMemoryWriteBundle
  -> appendKnowledgeClaims (canonical write)
  -> final canonical snapshot / ProjectionJob
  -> compatibility projections and post-reply work
```

The four concepts are intentionally separate:

1. **Extraction** — the model proposes possible memory candidates. It is untrusted input.
2. **Candidate** — runtime code binds scope, provenance, evidence and lineage to a `MemoryCandidate`. Model text cannot choose the runtime identity scope.
3. **Admission** — `evaluateMemoryCandidate` validates/classifies a candidate as accepted, rejected, duplicate, or needs review. It is pure and has no storage authority.
4. **Canonical write** — `evaluateKnowledgeWrite` and the repository/coordinator decide whether a `KnowledgeClaim` is appended. This is the current production authority.

`structuredCandidatesV2` is additive metadata. `MemoryExtractor` still derives `acceptedClaims` from the legacy path and the write coordinator receives those claims. V2 classifications currently do not change persistence.

### Current Direct Chat call chain

`useChatMemoryExtraction` calls `MemoryService.extractMemories`. `MemoryExtractor` builds a runtime source envelope, parses the response, validates source quotes against recent messages, builds complete `KnowledgeWriteCandidate` objects, runs `evaluateKnowledgeWrite`, and returns accepted claims. The caller passes those claims to `commitMemoryWriteBundle`; `appendKnowledgeClaims` is the canonical persistence boundary. Existing automatic Direct Chat projection enqueue happens after the canonical write.

Group, Offline, Manual, Reading, Diary and other feature paths retain their existing policies. They are not implicitly part of a future Direct Chat Admission cutover.

## 4. Admission V2 implementation audit

`evaluateMemoryCandidate` is a pure evaluator. It validates schema, id, statement, provenance/evidence, scope, temporal shape, confidence and importance; detects an injected known idempotency key; applies producer permissions; and classifies scene-only, subjective, relationship-signal, preference/temporary and hypothesis cases. It returns a decision and reason code, not a write operation.

Current accepted targets are `truth`, `event`, `episodic` and `belief`; ordinary accepted candidates have `authority: candidate_only`. Explicit trusted manual sources can be `manual_trusted`. Review states include relationship signals, temporary/unknown preference durability and hypotheses missing actor/target. Rejection states include invalid candidate, insufficient/mismatched scope, missing provenance, invalid temporal data, unsupported kind, producer not permitted, scene-only and subjective reflection.

The evaluator does not currently:

- append a `KnowledgeClaim`;
- create or update RelationshipState;
- resolve semantic contradictions or supersede claims;
- maintain a durable duplicate index;
- provide a canonical `KnowledgeKind` mapping for every accepted candidate;
- enforce a required `conversationId` at the candidate type boundary;
- produce a per-candidate explanation for legacy candidates that were rejected before shadow comparison.

Those are explicit future design items, not hidden Admission behavior.

## 5. `MemoryCandidate` contract and ownership

The current schema (`schemaVersion: 1`) contains:

- `candidateId` and `candidateKind` (`fact`, `event`, `plan`, `belief`, `episodic`, `relationship_signal`, `scene_only`, `subjective_reflection`, `unknown`);
- optional semantic facet, durability, relationship-signal kind, statement, subject;
- scope: `characterId`, `relationId`, `userIdentityId`, optional `conversationId`;
- provenance: producer, source type, authorship, actor/target, app, conversation and source message/event/record references;
- evidence source references and an evidence key;
- temporal status and optional occurred/recorded/valid-from/valid-to timestamps;
- optional confidence and importance;
- lineage (`parentActionId`, `producerActionId`, `sourceRequestId`).

Runtime-owned fields are: character, relationship, user identity, conversation, producer, source envelope, source IDs, authorship binding, actor/target IDs, evidence binding and lineage. The adapter intentionally ignores claim-provided scope in favor of the runtime scope and validates source references against one trusted envelope. Model-supplied fields are limited to the semantic proposal: kind/facet/durability/signal type, statement, temporal hints, confidence/importance, role hints and quoted source-message hints. A model cannot mint canonical IDs or authority fields.

The optional `conversationId` in the reusable type is acceptable for compatibility but is a blocker for Direct Chat authority: a future Direct Chat cutover must require all four exact scope IDs before admission.

Candidate IDs use governed `createId("memory-candidate")` in production and an explicit test factory only in tests. The deterministic idempotency key is source/scope based and deliberately excludes the statement and candidate ID.

## 6. Taxonomy and boundary audit

| Kind | Current Admission result | Canonical route today | Future boundary |
| --- | --- | --- | --- |
| `fact` | Can be accepted | Still requires `evaluateKnowledgeWrite` | Map explicitly to a canonical kind; no silent relabeling |
| `event` | Can be accepted | Existing Truth write policy | Validate past/recorded temporal semantics; no Scene mutation |
| `plan` | Can be accepted | No open-loop runtime is created | Future OpenLoop/Task service; enforce future temporal consistency |
| `belief` | Can be accepted | Existing Truth policy when compatible | Keep subject/truth semantics explicit |
| `episodic` | Can be accepted | No direct `KnowledgeKind` counterpart is defined | Requires an explicit mapping or separate episodic store |
| `relationship_signal` | `needs_review` | No RelationshipState mutation | Independent Relationship coordinator; never direct Truth write |
| `scene_only` | Rejected | None | Scene/context system only, if one is later approved |
| `subjective_reflection` | Rejected as Truth | Diary/subjective domain, not canonical Truth | Diary-specific route, with separate consent/retention |
| `unknown` | Rejected/unsupported | None | Safe rejection; never infer a type |

`Memory` is not `Scene`: scene-only context must not become durable Truth. `Memory` is not `RelationshipState`: relationship signals are review input, not a relationship mutation. `Event` is not a Scene update. Diary reflection is not an objective Truth claim. These boundaries are tested and remain unchanged in this stage.

Known mapping gaps are blockers to authority: `fact + preference` can currently be accepted without emitting a canonical kind mapping; `episodic` has no direct canonical counterpart; plan temporal semantics are not fully enforced in Admission; and old extraction has no scene classification, so the shadow cannot prove scene equivalence.

## 7. Risk audit

The relevant failure classes are:

- **False positive** — an unsupported or hallucinated model proposal becomes durable Truth. Mitigation: runtime provenance, exact scope, source quote validation, producer permissions, `evaluateKnowledgeWrite`, and no V2 direct write.
- **False negative** — a valid user fact is rejected. Mitigation: per-candidate reason codes, review queue design, and severity-weighted sample review; do not hide rejection behind aggregate counts.
- **Wrong type** — a scene, reflection, plan, episode or signal is mapped to a fact. Mitigation: explicit taxonomy mapping and reject-unmapped behavior.
- **Wrong scope** — cross-character, cross-relationship, cross-user or cross-conversation leakage. Mitigation: runtime-owned exact scope and fail-closed on mismatch.
- **Wrong temporal status** — a future plan is recorded as a past event, or an expiry is lost. Mitigation: temporal validation before any future write adapter.
- **Duplicate** — repeated extraction produces multiple claims. Mitigation: deterministic source idempotency, repository dedupe and future durable duplicate lookup; Admission alone is not consolidation.
- **Contradiction** — a new claim silently coexists with an incompatible claim. Mitigation: explicit conflict/supersede service; never add semantic consolidation to Admission.
- **Hallucinated source** — a quote/source ID is not in the runtime message envelope. Mitigation: trusted source binding and rejection of untraceable evidence.

## 8. Shadow wiring audit and why the real report is zero

The available files are the V2 extraction schema/parser, `directChatMemoryCandidateAdapter`, `directChatMemoryAdmissionShadow`, the producer-shadow characterization tests, and the existing read-shadow telemetry collector. The Admission shadow function is pure and fail-open for diagnostics, but it is not imported by the normal automatic Direct Chat memory hook.

`enableMemoryExtractionV2Shadow` is only set by the manual-message override path; automatic Direct Chat intentionally leaves it off. `AppChat` currently wires read-shadow diagnostics only, which are disabled unless an explicit debug/development configuration enables them. There is no Admission report persistence, network telemetry, local export, or UI report panel. Therefore:

```text
normal app Direct Chat -> no Admission shadow invocation -> no report
```

The current shadow comparison also only sees legacy `acceptedClaims`. The old-rejected side is represented as an aggregate count and `incomparable`, not as per-candidate old rejection decisions. Consequently current tests cannot measure a valid old-reject/V2-accept rate. This is an evidence-shape blocker, not a metric to paper over.

## 9. Definition of a real shadow report

`REAL_MEMORY_SHADOW_REPORT` means: metadata produced by a real local application Direct Chat run after the actual extraction response has returned, with runtime-bound scope and source envelope, and exported by an explicit developer action. It is not a fixture replay, a unit test, a synthetic parser input, or a browser screenshot.

The future evidence seam must capture a per-candidate old-policy classification (including explicit rejection reason) and V2 classification before either is discarded. It must correlate each candidate with a stable opaque observation ID. Until that seam exists, no agreement percentage is production evidence.

### Privacy-safe evidence schema

The proposed report is metadata-only:

```text
reportId
observedAt
sessionScopeHash (opaque, per-session)
producerVersion
candidateKind
legacyDecision: accepted | rejected | incomparable
legacyReasonCode
v2State: accepted | rejected | duplicate | needs_review | deferred | failed_open
v2ReasonCode
v2TargetKind (if any)
provenancePresent / evidenceTraceable / scopeExact
temporalStatus
duplicateDetected
sourceCount / sourceFingerprint
lineagePresent
```

It must not contain statements, prompt text, response text, quotes, raw message/source IDs, diary text, API keys, Authorization headers, or exception messages. Source fingerprints must be one-way and session-scoped, not user identifiers.

Default storage should be an in-memory bounded buffer (for example 100 observations per session), cleared on reload or explicit clear. Export must be user/developer initiated as a local JSON file. No automatic network upload and no localStorage retention are proposed for this stage.

### Metrics and severity

Report counts are descriptive, not a cutover threshold. Required dimensions are:

- legacy accepted / V2 rejected;
- legacy rejected / V2 accepted;
- both accepted / both rejected / incomparable;
- kind, scope, provenance, temporal and duplicate mismatches;
- failed-open and evaluator-exception counts.

Severity is:

| Severity | Meaning | Cutover treatment |
| --- | --- | --- |
| P0 | scope/provenance/privacy or authority violation | zero allowed |
| P1 | likely semantic corruption or durable false positive | zero unresolved |
| P2 | important valid-memory loss or unresolved mapping | each sample reviewed |
| P3 | taxonomy/diagnostic gap without write risk | documented disposition |
| P4 | benign presentation/metadata difference | monitor |

No arbitrary “95% agreement” rule replaces review. Every P0/P1 must be explained and fixed or excluded by an explicit scope decision; every P2 must have a disposition.

## 10. Browser-independent evidence acquisition

Browser CUA smoke is useful for UI confidence but cannot be the only evidence source. The browser-independent plan is:

1. Add a dev-only, explicit opt-in observation seam in the normal application memory-extraction runtime, after source binding and before canonical write.
2. Keep a bounded in-memory metadata buffer; expose a developer-only local JSON export and clear action.
3. Add deterministic local replay fixtures for parser/adapter/evaluator characterization, clearly labelled `synthetic`, never mixed with real-run counts.
4. Run a local built app or development server with real test conversations and collect an exported `REAL_MEMORY_SHADOW_REPORT` without uploading content.
5. Treat browser smoke as a separate UI regression gate. Repairing CUA is not a prerequisite for the non-UI evidence seam, and CUA success is not sufficient for Admission authority.

This plan needs a per-candidate legacy rejection shape first. The current aggregate `rejectedCandidateCount` cannot produce valid old-reject/V2-accept evidence.

## 11. Future narrow cutover seam (not executed here)

The narrowest safe first cutover is automatic one-to-one Direct Chat only:

```text
real extraction
  -> runtime source/scope binding (all four IDs required)
  -> MemoryCandidate
  -> Admission V2
  -> explicit candidate-to-KnowledgeWriteCandidate adapter
  -> evaluateKnowledgeWrite (canonical safety policy)
  -> existing commitMemoryWriteBundle / appendKnowledgeClaims
  -> existing ProjectionJob/Summary flow
```

Admission V2 would become the sole candidate admission decision for that seam. The old path could remain as a comparison-only diagnostic during a flagged canary, but it must not dual-write or independently decide persistence. The existing canonical policy and repository remain the final schema/write guard until a separately approved design proves an equivalent replacement.

The cutover must not change Prompt blocks, provider transport, retry/fallback, context assembly, summary projection, or UI delivery. The V2 metadata must not add an LLM request. Current and future provider/token/prompt delta must be exactly zero for this change; any delta is a blocker.

### Decision/cursor matrix

| Situation | Admission/write result | Cursor and request behavior |
| --- | --- | --- |
| No model candidates | No claims | Advance after intake; no Summary job; no provider retry |
| All candidates deterministically rejected | No claims | Advance; record metadata only; no Summary job; provider count unchanged |
| Some accepted, some rejected | Write accepted claims through existing coordinator | Advance only after canonical write; unchanged projection contract |
| Runtime scope/source envelope invalid | No write | Hold cursor; fail closed; no retry caused by Admission |
| Admission exception (final authority mode) | No write | Hold cursor and report; do not silently invent a claim |
| Admission exception (temporary canary fallback only) | Old authority may run only behind an explicit rollback flag | Report fallback; never dual-write |
| Canonical write failure | No derived write | Hold/retry through existing write semantics |

`unknown`, unsupported or unmapped kinds must reject or require review; they must never be guessed into a canonical kind.

## 12. Duplicate, consolidation, relationship and plan boundaries

Admission owns structural eligibility, source/scope binding, producer/type/temporal checks, and candidate idempotency classification. Canonical repository/write policy owns append, repository dedupe, retract and supersede. A future consolidation service owns semantic merge, corroboration and contradiction resolution. It is not part of Admission.

Relationship signals route to a review/relationship coordinator and cannot mutate RelationshipState directly. Plans and promises need an OpenLoop/Task boundary; a plan being admitted is not a scheduled job. No automatic event-to-Scene mutation is allowed. No Diary reflection becomes Truth through this seam.

## 13. Scope and feature isolation

Direct Chat cutover requires exact `characterId + relationId + userIdentityId + conversationId`; missing conversation is not a wildcard. Repository retrieval and supersede/retract already use exact scope for canonical Truth. Character names, avatars or persona similarity cannot merge scopes. Cross-conversation merge is not automatic; provenance retains the original conversation.

The first cutover excludes Manual, Group Chat, Offline, Reading, Diary, Moments, Forum, Character Phone, proactive jobs, voice and image generation. Their current policies and compatibility surfaces remain untouched. A shared default flag must not accidentally enable V2 for those paths.

Manual extraction is intentionally excluded even though it can opt into additive V2 metadata: its user-intent and immediate-summary paths are not one uniform runtime seam. Group and Offline retain their existing current-policy writes. Legacy `MemoryItem` remains readable and writable where existing compatibility requires it.

## 14. Rollback and migration

There is no destructive migration in Stage 4D-1. Existing `KnowledgeClaim`, Summary, ProjectionJob, Cursor and `MemoryItem` records are not rewritten. A future adapter must produce the existing compatible `KnowledgeWriteCandidate`/`KnowledgeClaim` schema before it can write.

Rollback is a feature-flag/policy switch to the current `evaluateKnowledgeWrite` authority. The old path must remain available until the canary has passed all gates. Previously written V2 claims are not automatically retracted during rollback; any correction requires the existing explicit retract/supersede/review operation. Read behavior and user data therefore remain stable during a code rollback.

## 15. Required cutover gates

Before any production authority switch, all of the following are required:

1. A real, browser-independent per-candidate shadow report exists from the normal Direct Chat runtime.
2. The report includes explicit legacy rejection reasons; aggregate counts are insufficient.
3. Zero unresolved P0 and P1 findings; every P2 has an owner and disposition.
4. Character, relationship, user and conversation isolation tests pass, including same-name/same-avatar cases.
5. Candidate-to-claim mapping is explicit for every accepted kind, including preference, episodic and plan temporal semantics.
6. Source provenance and evidence binding are proven against the real runtime envelope.
7. Duplicate/idempotency, contradiction and supersede boundaries are tested without semantic consolidation in Admission.
8. Zero provider-request, prompt, token, retry and fallback deltas.
9. Cursor behavior is proven for zero candidates, all rejected, partial acceptance, invalid scope, evaluator exception and canonical-write failure.
10. Manual, Group and Offline isolation is proven; no shared flag enables them accidentally.
11. Canary rollback is tested and does not delete or rewrite user data.
12. Existing full tests, lint, build, dependency gate, AI accounting and smoke checks remain green.

There is no safe “directly enter production cutover after Stage 4D-1” path. The evidence seam, mapping gaps, rejection visibility, and canary/rollback proof are still missing.

## 16. Current test/evidence inventory and gaps

Existing tests cover candidate schema/admission contracts, exact scope behavior, provenance and temporal validation, producer permissions, taxonomy boundaries, deterministic idempotency, privacy, Direct Chat adapter runtime-scope precedence, lineage, V2 parser normalization, additive prompt/provider invariants, source provenance, canonical writes, cursor/cutover characterization and feature isolation.

They do not yet provide real runtime evidence, per-candidate legacy rejection decisions, a complete candidate-to-claim mapping, contradiction/supersede Admission semantics, explicit all-rejected cursor integration, or an end-to-end privacy export (there is no export yet). The known `incomparable` result for old-rejected candidates is correctly treated as an evidence limitation, not a passing agreement.

## 17. Answers to the Stage 4D-1 decision questions

**A. Is Admission V2 the production authority?** No. `evaluateKnowledgeWrite` plus canonical claim append remains the authority.

**B. Why is the real shadow report zero?** Normal automatic Direct Chat does not invoke the Admission adapter/shadow evaluator, V2 extraction is off for that path, and there is no report sink/export. CUA unavailability is a separate UI verification debt.

**C. Is there a browser-CUA-independent real-runtime plan?** Yes: a future explicit dev-only metadata-only observation seam in the real extraction runtime, bounded in-memory buffer and user-triggered local JSON export, supplemented by clearly labelled synthetic replay tests.

**D. What is the narrowest safe cutover seam?** Automatic one-to-one Direct Chat only, after runtime binding and explicit candidate-to-claim mapping, with V2 as the sole admission classifier and the existing canonical write policy/repository retained as the final write guard.

**E. Can we enter production cutover directly after Stage 4D-1?** No. Real per-candidate evidence, mapping/temporal gaps, contradiction/duplicate policy boundaries, isolation/rollback proof and the complete cutover gates above remain outstanding.

## 18. Recommended next stage

Stage 4D-2 should implement only the dev-only metadata observation seam and per-candidate legacy rejection diagnostics characterization, then collect real local reports. It should not switch authority, alter prompts/providers, add extra model calls, migrate storage, or include Offline/Group/Manual/Diary/Scene/Relationship systems. Production cutover should be a later, separately approved stage after the gates in this document are met.

