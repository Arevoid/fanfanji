# Stage 4D-11C — Safety-veto Canary Design Contract

Status: design-only / contract-only. This document defines the first bounded
Safety-veto Canary; it does not implement or enable it.

- Starting refactor HEAD: `04ccbeb20fc52c7f8790b6a59d6000033c4caa33`
- Original repository stable baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Scope: automatic one-to-one Direct Chat memory admission only
- Production code changes: none
- Runtime Canary: not implemented and not enabled
- Production import of a veto validator: 0

## 1. Non-negotiable safety principle

The first Canary is a brake, never an accelerator:

```text
V2 may veto a proven-unsafe legacy write.
V2 may never create a new write.
```

The legacy parser, `evaluateKnowledgeWrite`, canonical repository semantics,
Prompt, Provider, retry/fallback, matcher, comparator, bridge policy, schemas,
storage, migrations, backups, and user data remain unchanged. A V2 confidence
or authority upgrade is never sufficient to write. A legacy rejection remains a
rejection, and a V2-only candidate has no write authority.

## 2. Scope and exclusions

The only eligible production scope is an automatic, one-to-one Direct Chat
extraction for an exact character/relation/identity/conversation scope. The
following are explicitly out of scope: Manual Memory, Group Chat, Offline,
Diary, Moments, Character Phone, Reading, Cinema, Inner Voice, Proactive,
Forum, and every migration/backfill path. No future implementation may infer
eligibility merely from a generic `safety_veto` state.

## 3. Audited current call chain

The current normal Direct Chat lifecycle is:

```text
user send / reply controller
  -> AppChat.executeDirectReplyPipeline
  -> prepareDirectReplyContext / prepareDirectReplyTurn
  -> requestDirectChatTurn
  -> apiChat / AI accounting (chat_reply)
  -> delivery
  -> createPostReplyCoordinator.schedule
  -> chatSideEffectController.afterReplySuccess
  -> delayed automatic memory extraction (threshold and cooldown guarded)
  -> useChatMemoryExtraction.handleExtractMemories
  -> MemoryService.extractMemories
  -> MemoryExtractor.extractMemories
  -> provider extraction adapter / model fallback
  -> legacy candidate normalization/parser diagnostics
  -> evaluateKnowledgeWrite
  -> result.acceptedClaims (legacy-accepted KnowledgeClaims)
  -> commitMemoryWriteBundle
  -> appendKnowledgeClaims (canonical repository)
  -> canonical snapshot / Summary projection / archive cursor
```

`chatSideEffectController.afterReplySuccess` schedules automatic extraction
only for a non-group relationship scope once the configured message threshold is
reached. Its 200 ms scheduled task and in-flight/cooldown guards are existing
background behavior; a failed extraction does not block the delivered reply.

The current provider/parser/policy boundary is in
`src/domain/memory/MemoryExtractor.ts`, `extractMemories()`: it constructs the
`KnowledgeWriteCandidate`, records diagnostics when enabled, calls
`evaluateKnowledgeWrite`, and returns `acceptedClaims`. The current canonical
write boundary is in
`src/features/chat/hooks/useChatMemoryExtraction.ts`,
`handleExtractMemories()`, Direct Chat branch, immediately before the
`commitMemoryWriteBundle({ claims: result.acceptedClaims, ... })` call. This is
the proposed future candidate-level veto seam. It is intentionally not wired
in this stage. Wiring at the global coordinator would incorrectly broaden the
scope to Manual, Group, and Offline writers.

The existing `observeDirectChatMemoryAdmissionShadow()` call is observation
only. Its decision/observation data is not an authority input to the canonical
commit, and this document does not change that fact.

## 4. Future veto contract

The conceptual flow is:

```text
legacy accepted candidate
  + reliable same-lineage V2 bridge decision
  -> validateDirectChatSafetyVeto(...)
  -> allow_veto | deny_veto | insufficient
  -> filter only explicitly allowed legacy claim(s)
  -> commit remaining legacy claims through existing coordinator
```

The validator is a pure function. A proposed shape is:

```ts
validateDirectChatSafetyVeto(input):
  | { result: "allow_veto"; reason: ApprovedCanaryVetoReason }
  | { result: "deny_veto"; reason: string }
  | { result: "insufficient"; reason: string }
```

It receives the legacy decision/claim, V2 bridge result, correlation and
lineage metadata, exact scope, provenance, feature scope, and the proposed
reason. It performs no storage, cursor, Summary, Event, RelationshipState,
Scene, Provider, retry, or UI operation.

### 4.1 Infrastructure failure is fail-open

No V2 candidate, parser failure, missing or partial lineage, bridge unavailable,
shadow exception, unknown/unsupported metadata, duplicate/ambiguous transport,
stale operation, or transient transport error leaves the legacy result
unchanged. Telemetry may record `fail_open`, but the validator must not block
chat or canonical writes for those conditions.

### 4.2 Explicit semantic conflict is candidate-local fail-closed

Only an allowlisted, same-lineage, scope-exact, provenance-trusted semantic
conflict may suppress one already accepted legacy claim. The initial approved
reason allowlist is:

| Bridge evidence reason | Canary reason | Initial state |
| --- | --- | --- |
| `cancelled_plan_not_active` | `SAFETY_VETO_CANCELLED_PLAN` | evidence-backed, eligible for a future first Canary |
| `temporary_preference_not_durable` | `SAFETY_VETO_TEMPORARY_PREFERENCE` | evidence-backed, eligible for a future first Canary |

The following are designed but disabled until further real evidence and policy
review: `completed_plan_not_active`, `scene_only_not_truth`,
`relationship_signal_not_truth`, and `subjective_not_objective_truth`.
The bridge's event/episodic routes remain review/route only. Unknown preference
durability is review/telemetry only.

### 4.3 Reason-specific predicates

`SAFETY_VETO_CANCELLED_PLAN` requires all of: a legacy-accepted plan that would
otherwise be durable, same extraction operation and runtime lineage, exact
Direct Chat scope, trusted runtime/model metadata, semantic plan, and
`planLifecycle=cancelled`. A reason string alone is insufficient.

`SAFETY_VETO_TEMPORARY_PREFERENCE` requires a legacy-accepted durable
preference/fact-like candidate, same operation and exact scope, trusted
provenance, effective semantic preference, and `durability=temporary`.

`planLifecycle=completed` is not enabled in the first Canary. Stage 4D-11B
observed completed-plan wording as `event`, not model-native completed plan
metadata; it is recorded as
`COMPLETED_PLAN_NOT_MODEL_NATIVE_IN_CURRENT_CONTRACT`. An event fallback must
not automatically veto a legacy plan.

## 5. Correlation and identity gate

The validator may return `allow_veto` only when all of the following are true:

- automatic one-to-one Direct Chat scope;
- a legacy-accepted candidate exists;
- same runtime lineage, or a separately approved formally reliable correlation;
- same extraction operation (not merely the same conversation);
- exact character, relation, user identity, and conversation scope;
- trusted, runtime-bound provenance and source references;
- one unique legacy/V2 pair;
- no ambiguity, duplicate conflict, cross-scope match, or stale operation;
- no partial/unknown identity dimension;
- reason is in the explicit allowlist and its semantic predicate passes.

Any uncertainty is `insufficient`/fail-open: preserve the legacy result and
record metadata-only telemetry. Correlation must never be recovered by array
position, statement text, or an untrusted model-authored ID.

## 6. Authority matrix

| Legacy state | V2 state | Result |
| --- | --- | --- |
| accept | no V2 | legacy unchanged |
| reject | accept | legacy rejection preserved |
| accept | review | legacy unchanged + review telemetry |
| accept | route | legacy unchanged unless a separately approved safety predicate exists |
| accept | safety_veto | suppress only when reason allowlist and validator pass |
| no legacy | accept | no write (V2-only has no authority) |
| ambiguous correlation | any | legacy unchanged |
| scope/provenance failure | any | legacy unchanged |
| duplicate/conflicting identity | any | legacy unchanged |
| legacy asserted/non-objective, V2 objective/durable | any | no authority upgrade and no new write |

The implementation must require both `bridgeState === "safety_veto"` and
`reason ∈ approvedCanaryVetoReasons`, followed by the pure validator. It must
not suppress on bridge state alone.

## 7. Cursor, Summary, and partial-batch contract

The current cursor is not a separate intake ledger. `selectUnarchivedChatMessages`
reads after `lastImmediateSummaryMsgId`. In automatic Direct Chat, the marker is
advanced by `markArchiveProgress()` only after canonical write and Summary/
projection cutover succeeds; durable projection is best-effort but its cutover
decision controls whether the marker may advance. `commitMemoryWriteBundle`
commits canonical claims first, then calls `afterCanonicalWrite` to derive the
final canonical snapshot and enqueue a rebuildable Summary projection, and
finally handles synchronous Summary fallback when required.

The future candidate-level veto is therefore processed input, not a new cursor
state: a vetoed candidate is considered extracted and must not cause the same
messages to be re-extracted forever. The marker may advance using the existing
zero-candidate/final-canonical-state semantics, subject to the same Summary and
projection cutover checks. A veto must not create a special cursor shortcut.

For a three-candidate batch with one veto and two accepted claims, only the one
claim is filtered. The other two go through the existing canonical commit; the
batch does not fail, the cursor follows existing success semantics, and
Summary/projection is derived from the final canonical repository snapshot.
No Summary, MemoryItem compatibility record, Event, RelationshipState, Scene,
retry, or extra AI call is created as a side effect of veto. Canonical accepted
claims continue to be projected normally.

If the validator throws, catch it at the candidate boundary, emit
`validator_error_fail_open`, retain that candidate's legacy write, and let the
chat/reply path continue.

## 8. Telemetry, privacy, kill switch, and rollback

Future Canary telemetry is metadata-only: `evaluated`, `eligible`, `vetoed`,
`skipped`, `fail_open`, allowlisted reason, `featureScope`, correlation state,
validation result, provider/model/status/count metadata already allowed by the
AI Ledger. It must not contain statement text, evidence quote, Prompt, complete
response, transcript, API key, Authorization, raw provider body, or stack.

Proposed hard kill switch:

```text
DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY
```

Default is OFF. OFF means 100% of legacy authority behavior, not a partial
suppression mode. Rollback is the flag-off operation; it requires no migration,
database rewrite, or user-data repair because the design only suppresses a
pre-write candidate and never creates V2 data.

Each future veto must be explainable from metadata as “legacy accepted would
write; same-lineage V2 reported; allowlisted reason; validator passed;
candidate suppressed”, without persisting the statement itself.

## 9. Rollout and abort criteria (design only)

1. Phase 0: flag OFF everywhere; retain current shadow evidence only.
2. Phase 1: dev-only synthetic shadow/validator tests, no canonical suppression.
3. Phase 2: developer opt-in/local canary with metadata review and immediate
   flag-off capability.
4. Phase 3: only after review, a very small production eligibility cohort.

Success metrics: eligible/evaluated/veto counts, fail-open counts, validator
errors, false-veto review rate, wrong/cross-scope correlation, provenance
failures, duplicate/loop rate, user-visible memory regressions, provider
request/token delta, and chat latency. Abort immediately on any wrong or
cross-character/cross-conversation pair, untrusted provenance veto,
non-allowlisted veto, V2-only or old-reject/new-accept write, cursor loop,
chat blocking, canonical corruption, or user-visible regression.

No synthetic validator test file was added in this design-only stage because no
runtime validator exists and production import count must remain zero. The next
approved shadow-implementation stage should add pure tests for: cancelled-plan
eligibility, temporary-preference eligibility, unknown/active/completed-disabled
denials, V2-only and legacy-rejected preservation, ambiguity/provenance/scope/
duplicate/non-Direct-Chat/Group/Offline/Manual denials, asserted-to-objective
non-escalation, relationship/scene no-side-effect guarantees, partial-batch
filtering, and validator-error fail-open. These are test obligations, not
runtime behavior in this commit.

## 10. Evidence and policy boundaries carried forward

Stage 4D-11A/11B real evidence supports cancelled-plan and temporary-preference
conflicts as bounded safety-veto candidates. Unknown preference was observed
and remains review-only. Stable preference remains review-only and does not
create new authority. Completed-plan wording was emitted as event, so native
completed-plan veto remains disabled. Ordinary Direct Chat extraction creates
`source.kind=user_message`; `evaluateKnowledgeWrite` resolves user-authored
claims to asserted unless an explicit trusted confirmation source exists. Thus
automatic Direct Chat cannot originate confirmed objective authority and must
not use the Canary to manufacture it.

## 11. 76-item completion checklist

1. **Principle:** V2 can veto a proven-unsafe legacy write only; it can never create a write.
2. **Scope:** automatic one-to-one Direct Chat memory extraction.
3. **Exclusions:** Manual, Group, Offline, Diary, Moments, Character Phone, Reading, Cinema, Inner Voice, Proactive, Forum, and migration/backfill.
4. **Insertion seam:** after legacy-accepted claims and validated bridge data, immediately before the Direct Chat canonical commit.
5. **Exact file/function:** `src/features/chat/hooks/useChatMemoryExtraction.ts`, `handleExtractMemories()`, Direct Chat branch before `commitMemoryWriteBundle` at the `result.acceptedClaims` call site.
6. **Legacy input:** `MemoryExtractionResult.acceptedClaims` plus legacy parser/knowledge-gate diagnostics and scope.
7. **Bridge input:** the existing Direct Chat bridge/shadow decision, candidate metadata, runtime scope, provenance, source references, and lineage.
8. **Validator shape:** pure `validateDirectChatSafetyVeto(input)` returning `allow_veto`, `deny_veto`, or `insufficient`.
9. **Outputs:** candidate-local allow/deny/insufficient; only allow may filter an already accepted legacy claim.
10. **Fail-open:** missing V2, parser/bridge/runtime/lineage/transport/metadata infrastructure failures preserve legacy.
11. **Fail-closed:** only an explicit, allowlisted, semantic safety conflict for that candidate.
12. **Allowlist:** explicit reason-to-predicate map, never bridge state alone.
13. **Cancelled plan:** enabled for future Canary design as `SAFETY_VETO_CANCELLED_PLAN`.
14. **Temporary preference:** enabled for future Canary design as `SAFETY_VETO_TEMPORARY_PREFERENCE`.
15. **Completed plan:** designed but disabled until model-native evidence; event fallback cannot veto.
16. **Scene-only:** designed but disabled pending evidence and objective-write audit.
17. **Relationship signal:** designed but disabled; it cannot mutate RelationshipState.
18. **Subjective/non-objective:** designed but disabled; it cannot remove legitimate belief/hypothesis storage.
19. **Event/episodic:** route/review only; no automatic veto in the first Canary.
20. **V2-only:** no correlated legacy accepted claim means no write.
21. **Old reject to new accept:** legacy rejection is preserved.
22. **Asserted to objective:** no escalation and no new write.
23. **Confirmed authority:** automatic Direct Chat cannot manufacture confirmed objective authority.
24. **Exact scope:** character, relation, user identity, and conversation must all match.
25. **Provenance:** runtime-trusted producer/source/evidence references are required.
26. **Unique lineage:** same extraction operation and unique runtime lineage/reliable pair are required.
27. **Ambiguity:** any ambiguous or partial identity is insufficient and fail-open.
28. **Duplicate:** duplicate/conflicting identity is insufficient and fail-open.
29. **Partial lineage:** no veto; preserve legacy and record metadata-only fail-open.
30. **Validator error:** catch and emit `validator_error_fail_open`; preserve the legacy candidate.
31. **Provider delta:** zero; no provider call is added.
32. **Token delta:** zero; no Prompt is changed.
33. **Prompt changed:** no.
34. **Provider changed:** no.
35. **Matcher changed:** no.
36. **Comparator changed:** no.
37. **Bridge policy changed:** no; the contract consumes only existing shadow decisions and an explicit future allowlist.
38. **KnowledgeClaim schema:** unchanged.
39. **Storage:** unchanged; canonical repository and projection semantics remain authoritative.
40. **Production import:** zero validator imports in production; no runtime wiring in this stage.
41. **Cursor semantics:** current marker advances only after existing canonical/Summary/projection cutover rules.
42. **Vetoed cursor:** candidate is processed; no extraction loop; no special cursor shortcut.
43. **Partial batch:** suppress one eligible candidate and commit the other accepted candidates normally.
44. **Summary:** derive from final canonical state after accepted claims are committed.
45. **Projection:** enqueue/rebuild from the final canonical snapshot using existing best-effort behavior.
46. **Event mutation:** none caused by veto.
47. **RelationshipState:** none caused by veto.
48. **Scene:** none caused by veto.
49. **Telemetry:** metadata-only evaluated/eligible/vetoed/skipped/fail-open/reason/scope/correlation/validation fields.
50. **Privacy:** no statement, quote, Prompt, response, transcript, secret, Authorization, or raw provider body.
51. **Kill switch:** `DIRECT_CHAT_MEMORY_ADMISSION_SAFETY_VETO_CANARY`, default OFF.
52. **Rollback:** switch OFF; legacy authority returns immediately without migration or rewrite.
53. **Rollout:** OFF baseline, dev shadow tests, developer opt-in, then only a reviewed small cohort.
54. **Success metrics:** safety, correlation, privacy, loop, user-visible, provider-count, token, and latency metrics listed above.
55. **Abort:** any wrong pair, scope/provenance breach, unauthorized write, loop, block, corruption, or regression turns the flag OFF.
56. **Evidence-backed reasons:** cancelled plan and temporary preference.
57. **Deferred reasons:** completed plan, scene-only, relationship signal, subjective/non-objective, and event/episodic automatic veto.
58. **Completed-plan contract:** current evidence is event fallback; native completed metadata is deferred and disabled.
59. **Confirmed-fact contract:** automatic Direct Chat cannot produce confirmed objective Truth authority.
60. **Preference contract:** stable is review-only, temporary is veto-eligible, unknown is review-only; none escalates to stable through V2.
61. **Synthetic tests:** 20-case pure contract matrix is specified for the next shadow stage; no validator/runtime test was added here.
62. **Production behavior changed:** no.
63. **User data:** no user data, schema, backup, or storage was changed.
64. **Implementation started:** no; design and contract only.
65. **Starting HEAD:** `04ccbeb20fc52c7f8790b6a59d6000033c4caa33`.
66. **Final HEAD:** the documentation commit produced for this stage (reported after verification).
67. **Commit:** one documentation-only commit, `docs: define memory safety-veto canary contract`.
68. **Tests:** existing baseline remains 578/578; no tests were removed or weakened.
69. **Lint:** must remain passing; verified after the documentation commit.
70. **Build:** must remain passing; verified after the documentation commit.
71. **Dependency gate:** must remain passing with the existing 105 allowlisted edges / 3 cycle baseline.
72. **AI accounting:** no runtime requests or accounting semantics changed; provider/token delta is zero by design.
73. **Smoke:** no browser/runtime behavior was changed; existing smoke check remains the verification reference.
74. **Worktree:** refactor worktree and original repository must both be clean after commit.
75. **Readiness:** `CANARY_DESIGN_READY_FOR_SHADOW_IMPLEMENTATION`; not ready for limited implementation or production cutover.
76. **Recommended next stage:** obtain separate approval for a pure shadow validator implementation and the 20-case contract tests, still with the kill switch OFF and no canonical suppression.

## Readiness decision

`CANARY_DESIGN_READY_FOR_SHADOW_IMPLEMENTATION` is the highest safe state for
this stage. The seam is clear enough to design, the two enabled predicates have
real evidence, and all other semantics remain explicitly disabled. This does
not authorize a production feature flag, canonical suppression, or authority
cutover. The next stage should implement only the pure shadow validator and
contract tests, then collect evidence before any limited Canary decision.

## Rollback of this stage

This stage changes documentation only. Rollback is a single `git revert` of its
documentation commit; there is no migration and no production-data rollback.
