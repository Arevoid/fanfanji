# Stage 4D-11F — Limited Safety-veto Canary Activation Design

Status: design-only. This document defines the smallest safe activation
contract after the Stage 4D-11E-R1 real-runtime evidence. It does not implement
suppression, add a runtime flag, change production authority, or alter user
data.

- R1 starting refactor HEAD: `d89aa2887690cc6e5a455137ba7fef19a8e66171`
- Stable original-repository baseline:
  `f515f7408cfe19da145f15a8ddffceae06e608d`
- R1 real evidence: 2 targeted `extractNow()` runs, 4 Safety observations,
  `allow_veto=3`, `deny_veto=1`, `insufficient=0`, `wouldVeto=3`,
  `actualSuppression=0`
- Production code changed in this stage: no
- Canary enabled in this stage: no

## 1. Governing principle

The first Canary is a brake, never an accelerator:

```text
V2 may veto a proven-unsafe legacy write.
V2 may never create a new write.
```

Legacy rejection, V2-only candidates, asserted-to-objective upgrades, review,
route, and all non-objective semantic changes remain non-writable. The
validator contract, matcher, comparator, Bridge policy, Prompt, Provider,
retry/fallback, schema, storage, migration, and authority remain unchanged.

## 2. R1 policy decision and scope

The first limited Canary is restricted to **automatic one-to-one Direct Chat
memory extraction** with an exact character/relation/user/conversation scope.
Manual extraction, Group, Offline, Diary, Moments, Character Phone, Reading,
Cinema, Inner Voice, Proactive, Forum, migration, and backfill are excluded.

R1 produced real cancelled-plan `allow_veto` evidence. It did not produce a
temporary-preference allow-veto: the Bridge reason was
`temporary_preference_not_durable`, but the model-native semantic was `fact`,
so the validator correctly returned `deny_veto` /
`temporary_preference_semantic_mismatch`. This is not a validator defect.

**Decision:** Canary V1 enables only:

```text
SAFETY_VETO_CANCELLED_PLAN
```

`SAFETY_VETO_TEMPORARY_PREFERENCE` remains shadow-only. It may be considered
only after separate real validator `allow_veto` evidence and a new approval;
the semantic predicate must not be relaxed and the Bridge reason alone is
never sufficient.

## 3. Hard kill switch and reason gating

The proposed hard kill switch is:

```text
DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY
```

It defaults to **OFF** and must fail closed when missing, malformed, or
unavailable. OFF means 100% of the existing legacy production behavior:
`result.acceptedClaims` is passed through unchanged and no partial V2 policy
can affect a write.

The rollout policy is separate from the pure validator contract. A future
candidate can be suppressed only when all three are true:

```text
canaryEnabled
AND reasonEnabled(SAFETY_VETO_CANCELLED_PLAN)
AND validatorResult === allow_veto
```

The reason set is an explicit configuration allowlist. Unknown reasons and
future reasons are disabled, not inferred from `bridgeState`.

## 4. Activation seam and candidate-local flow

The smallest real seam is the automatic Direct Chat branch of
`useChatMemoryExtraction.handleExtractMemories()`:

```text
MemoryExtractor result
  -> legacy result.acceptedClaims
  -> current-operation Bridge observations
  -> pure validateDirectChatSafetyVeto
  -> reason-level Canary policy
  -> derived filteredAcceptedClaims
  -> existing commitMemoryWriteBundle
```

The future adapter must run after legacy acceptance and before
`commitMemoryWriteBundle()`. It must derive a new
`filteredAcceptedClaims` array rather than mutate the extraction result or
move veto logic into a global writer. The adapter is candidate-local and must
continue processing the rest of a batch after one candidate is vetoed.

No veto belongs in the global repository, `MemoryWriteCoordinator`,
`evaluateKnowledgeWrite`, Group/Offline common writers, Prompt construction,
Provider transport, or UI/controller state.

## 5. Authority matrix

| Legacy candidate | V2/Bridge state | Canary result |
| --- | --- | --- |
| accepted | no V2 / missing Bridge | preserve legacy |
| rejected | V2 accepted | preserve rejection; never upgrade |
| accepted | review or route | preserve legacy; telemetry only |
| accepted | safety veto, flag OFF | preserve legacy |
| accepted | safety veto, reason OFF | preserve legacy |
| accepted | cancelled-plan safety veto, validator `allow_veto`, flag/reason ON | suppress that candidate only |
| no legacy candidate | V2 candidate | no write |
| ambiguous/duplicate/partial/stale identity | any | fail-open; preserve legacy |
| asserted/non-objective legacy | V2 objective/durable | no authority upgrade |

The only fail-closed outcome is the explicit, approved, candidate-local
cancelled-plan semantic conflict with all identity gates satisfied.

## 6. Identity and provenance gates

Every real suppression must satisfy all of the following:

- automatic one-to-one Direct Chat scope;
- legacy candidate was already accepted and write-eligible;
- shared runtime lineage from the same extraction operation;
- unique legacy/V2 pair with no duplicate or ambiguity;
- exact character, relation, user-identity, and conversation scope;
- trusted runtime/model provenance and source evidence;
- no stale, partial, cross-scope, structural-fallback, or untrusted match;
- approved reason `SAFETY_VETO_CANCELLED_PLAN`;
- legacy and V2 effective semantic kind `plan`;
- V2 `planLifecycle === "cancelled"`.

Structural fallback, array position, statement similarity, model-authored IDs,
or Bridge state alone cannot qualify a veto. Missing lineage/provenance or a
validator exception is infrastructure uncertainty and therefore fail-open.

## 7. Partial-batch semantics

For a batch containing three legacy-accepted candidates A/B/C where only A is
an eligible cancelled plan:

1. record A as `suppressed: true` in metadata-only telemetry;
2. derive `filteredAcceptedClaims = [B, C]`;
3. commit B and C through the unchanged canonical coordinator;
4. derive Summary/Projection from the resulting canonical repository state;
5. advance the existing archive marker only under existing write/cutover rules.

The batch is not aborted, re-extracted, retried, or regenerated merely because
A was vetoed. No extra Provider call, Prompt, Event, RelationshipState, Scene,
or compatibility write is created.

## 8. Zero-remaining-batch semantics

The current Direct Chat code already defines the required behavior. When a
normal automatic batch has zero accepted candidates, the
`resolveDirectChatSummaryCutover({ zeroCandidates: true })` decision is
`ZERO_CANDIDATES`, with `writeSynchronousSummary: false` and
`canAdvanceCursor: true`. `commitMemoryWriteBundle()` receives an empty claims
array, performs no canonical claim append, skips `afterCanonicalWrite`, and
has no Summary/Projection payload to write. `markArchiveProgress()` then
advances the existing relationship marker after the batch succeeds.

Therefore a future all-vetoed batch must be treated as the same zero-candidate
case **after** candidate-local filtering:

- canonical claim append: none;
- Summary: none for that zero-candidate batch;
- Projection: none for that zero-candidate batch;
- cursor: advance with the existing zero-candidate semantics;
- extraction loop: prevented because the processed input marker advances;
- special Canary cursor shortcut: forbidden.

This does not create a second fact source. If any implementation instead
re-runs an all-vetoed batch or writes a Summary containing vetoed content, the
Canary must remain OFF and the implementation must stop.

## 9. Cursor, Summary, and Projection rules

The vetoed candidate is processed input, not a new cursor state. For a partial
batch, the existing canonical write and Summary/Projection cutover rules are
used unchanged. `afterCanonicalWrite` reloads canonical claims and derives the
rebuildable Summary projection from the final canonical snapshot; a vetoed
candidate is absent from that state. If durable projection is unavailable,
the existing synchronous fallback policy decides whether the marker may
advance. No Canary-specific cursor or summary shortcut is permitted.

## 10. Legacy MemoryItem compatibility audit

The automatic Direct Chat path currently calls `commitMemoryWriteBundle()` with
canonical `claims` and its existing Summary/projection callbacks only. It does
not pass `result.extractedMemories`, `memories`, or `saveMemories`; the
`onSaveMemories` prop is not used by this extraction path. The compatibility
`MemoryItem` produced transiently by `MemoryExtractor` is therefore not
persisted by automatic Direct Chat.

The future adapter must preserve that property and must assert that a vetoed
candidate is absent from every compatibility payload if a later implementation
adds one. Other MemoryItem writers (Offline, Manual/UI, cleanup, migration)
remain out of scope and cannot be silently routed through this Canary.

## 11. No side effects

Suppression is a local array decision. It must not add Provider/model calls,
retry or fallback attempts, Prompt blocks, token work, Event mutations,
RelationshipState changes, Scene changes, UI blocking, or background jobs.

## 12. Failure policy and validator exceptions

Infrastructure uncertainty is fail-open: missing flag/config, missing Bridge,
missing/partial lineage, unknown reason, malformed DTO, validator unavailable,
telemetry failure, or stale/ambiguous identity preserves the legacy candidate
and lets the remaining batch continue.

For a validator throw, the candidate adapter must catch at the candidate
boundary, emit `validator_error_fail_open`, retain that candidate, and process
the rest of the batch. It must never convert an exception into suppression.

An explicit cancelled-plan conflict that passes every gate is the sole
candidate-local fail-closed outcome, and only when the total and reason flags
are ON.

## 13. Telemetry and privacy

Future Canary telemetry is bounded, metadata-only, and in-memory or otherwise
covered by the existing safe monitoring contract. Required fields are:

- `evaluated`, `canaryEligible`, `reasonEnabled`, `validatorResult`,
  `validatorReason`, `suppressed`, `failOpen`;
- `featureScope`, correlation class, metadata source class;
- batch candidate count, before/after accepted count, and bounded status/count
  metadata already approved by the AI Ledger.

It must never include statements, evidence quotes, transcript, Prompt,
complete response, source text, raw provider body, API key, Authorization,
stack, raw IDs, or raw lineage. A suppression is explainable from metadata as
“legacy accepted → same-lineage V2 → approved reason → validator allow-veto →
flag/reason enabled → candidate suppressed” without persisting the statement.

## 14. Rollout

The rollout is deliberately small:

1. **Phase 0 — OFF everywhere:** retain the current observation-only shadows.
2. **Phase 1 — developer/local opt-in:** cancelled-plan reason only, explicit
   session opt-in, no production default, immediate hard-kill access.
3. **Phase 2 — reviewed tiny cohort:** only exact-eligibility sessions, with
   metadata review and no historical replay.
4. **Phase 3 — post-Canary review:** decide whether to continue brake-only
   operation; do not infer full Admission cutover.

There is no direct full-rollout or automatic production ON phase in this
design.

## 15. First eligibility contract

An event is eligible only if all of these hold: explicit developer/local
opt-in; total flag ON; reason flag ON for cancelled plan; automatic Direct Chat;
exact scope; model-native V2 metadata; shared same-operation lineage; unique
pair; trusted provenance; legacy accepted plan; V2 cancelled lifecycle. Group,
Offline, Manual, historical/backfill, and all other features are ineligible.

## 16. Abort criteria and thresholds

The hard flag must be turned OFF immediately on any of the following:

- wrong, cross-character, cross-relation, or cross-conversation suppression;
- non-shared, duplicate, stale, partial, or untrusted pair being suppressed;
- non-allowlisted reason or Bridge-state-only suppression;
- V2-only write, legacy reject→accept, asserted→objective, review/route→write;
- vetoed content in Summary, Projection, Legacy MemoryItem, Event,
  RelationshipState, or Scene;
- cursor loop, duplicate extraction loop, canonical corruption, or chat block;
- any extra Provider request, Prompt/token delta, privacy leak, or raw secret;
- any user-visible regression or material latency regression.

Promotion thresholds are strict: wrong suppression, cross-scope suppression,
unauthorized write, cursor loop, privacy violation, and Provider/Prompt delta
must each be **0**. A user-visible blocking regression is **0**. A p95
extraction latency increase greater than 10% over the matched baseline is an
abort signal; because this is pre-write local filtering, the expected delta is
zero.

## 17. Evidence window and minimum sample

For a developer/local Canary review, collect at least **5 sessions and 10
eligible cancelled-plan suppression events** across at least **3 distinct
Direct Chat relationships/conversations**, with all abort metrics above at
zero. The window should span at least 7 days or 20 automatic extraction
batches, whichever is longer. Every suppression must have a complete
metadata-only audit row; no synthetic Prompt engineering may be used to force
additional hits.

If natural evidence is insufficient, keep the feature in shadow/local canary
and do not broaden authority. Ten events is a review minimum, not permission
for full rollout.

## 18. Rollback and no historical replay

Turning `DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY` OFF immediately
restores 100% legacy authority. No schema rollback, database migration, or
user-data repair is needed because suppression occurs before the existing
write and never creates V2 data.

An already suppressed candidate was never durable. Turning the flag OFF does
not backfill it, replay old extraction, regenerate old Truth, rescan history,
or alter the cursor backward. Any future backfill or replay requires a separate
migration approval and is explicitly prohibited in this Canary.

## 19. Canary success boundary

A successful limited Safety-veto Canary proves only that a narrowly gated V2
predicate can safely prevent a subset of unsafe legacy writes. It does not
prove that Admission V2 is a complete write authority, justify positive V2
writes, retire the legacy gate, expand reasons, or perform production cutover.

## 20. Tracked independent debt

R1 reconfirmed `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK`: the default
extraction model can fail with `provider_unavailable`, after which the active
chat model succeeds. This is independent Provider fallback debt. It is not
changed, hidden, or combined with Canary policy in this stage.

## 21. Readiness decision

`LIMITED_CANARY_DESIGN_READY_FOR_IMPLEMENTATION`

The cancelled-plan-only policy, strict flag/reason gates, activation seam,
partial/zero-batch semantics, identity gates, failure behavior, telemetry,
rollback, evidence window, and abort thresholds are defined. This readiness
does **not** authorize implementation in this stage; a separate approval is
required before adding a suppression adapter or runtime flag. Temporary
preference remains shadow-only.

## 22. Stage 4D-11F acceptance checklist

1. First Canary scope: automatic one-to-one Direct Chat extraction only.
2. First enabled reason: `SAFETY_VETO_CANCELLED_PLAN`.
3. Temporary preference enabled: no; shadow-only.
4. Reason: R1 had no temporary-preference validator allow-veto; semantic was `fact`.
5. Total kill switch: `DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY`.
6. Default: OFF; malformed/missing reads fail closed.
7. Reason-level gating: required in addition to the total flag.
8. Validator contract changed: no.
9. Matcher changed: no.
10. Prompt changed: no.
11. Provider changed: no.
12. Activation seam: automatic Direct Chat `handleExtractMemories`, after legacy acceptance and before commit.
13. Candidate-local: yes; derive a filtered list, do not mutate global state.
14. Global writer changed: no.
15. Legacy reject→accept possible: no.
16. V2-only write possible: no.
17. Asserted→objective possible: no.
18. Shared lineage required: yes.
19. Structural fallback allowed: no.
20. Exact scope required: yes.
21. Trusted provenance required: yes.
22. Unique pair required: yes.
23. Partial batch: suppress only eligible A; commit B/C normally.
24. Zero remaining: use existing `ZERO_CANDIDATES` semantics.
25. Cursor: advance through existing `markArchiveProgress` rules after processed batch success.
26. Extraction loop prevented: yes; processed input marker advances.
27. Summary: final canonical state only; no vetoed candidate.
28. Projection: existing final-snapshot enqueue/cutover only.
29. MemoryItem compatibility: current automatic path does not persist it; future payloads must exclude vetoed candidate.
30. Event mutation: none.
31. RelationshipState mutation: none.
32. Scene mutation: none.
33. Provider delta: zero; abort on any increase.
34. Prompt delta: zero.
35. Token delta: zero.
36. Infrastructure failure: fail-open, preserve legacy.
37. Semantic conflict: fail-closed only for approved cancelled-plan allow-veto with both flags ON.
38. Validator exception: candidate-local catch, `validator_error_fail_open`, preserve legacy.
39. Telemetry fields: bounded evaluation, eligibility, reason, suppression, fail-open, scope/correlation, batch counts.
40. Telemetry privacy: no text, Prompt, response, secrets, raw IDs, or lineage.
41. Rollout phases: OFF, developer/local opt-in, tiny reviewed cohort, post-review.
42. First eligibility: exact cancelled-plan contract in section 15.
43. Abort criteria: section 16; hard flag OFF immediately.
44. Rollback: flag OFF restores legacy authority without migration.
45. Old suppressed candidates replayed: no.
46. Backfill: no.
47. Minimum evidence window: 7 days or 20 extraction batches, plus the sample gate.
48. Minimum sample: 5 sessions, 10 eligible suppressions, 3 relationships/conversations.
49. Wrong suppression threshold: 0.
50. Cross-scope threshold: 0.
51. Cursor-loop threshold: 0.
52. Provider delta threshold: 0.
53. User regression threshold: 0 blocking/material regressions.
54. Canary success means full Admission cutover: no.
55. Fallback debt tracked: yes, `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK`.
56. Production code changed: no.
57. Suppression implemented: no.
58. Canary enabled: no.
59. Production authority changed: no.
60. User data used: no production data; only prior R1 synthetic fixture evidence is referenced.
61. Backup used: no.
62. Readiness: `LIMITED_CANARY_DESIGN_READY_FOR_IMPLEMENTATION`.
63. Implementation allowed next: only after separate explicit approval.
64. Implementation performed: no.
65. Starting HEAD: `d89aa2887690cc6e5a455137ba7fef19a8e66171`.
66. Final HEAD: documentation commit reported after verification.
67. Commit: one docs-only commit, `docs: define limited memory safety-veto canary`.
68. Tests: latest validated baseline 579/579; no tests removed or weakened.
69. Lint: latest validated baseline passed; no code changed.
70. Build: latest validated baseline passed; no code changed.
71. Dependency gate: latest baseline 105 allowlisted edges / 3 cycles.
72. AI accounting: R1 observed the existing primary-failure/fallback-success pair; Canary adds zero requests.
73. Smoke: Stage 4D-11D smoke remained passing; no runtime behavior changed in 11F.
74. Worktree: refactor and original repositories must both be clean after the documentation commit.

## 23. Rollback of this stage

This stage changes documentation only. A single `git revert` of the stage
commit removes the design document; no migration or production-data rollback
is required.
