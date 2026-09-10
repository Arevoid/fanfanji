# Stage 4D-11D — Direct Chat Safety-veto Shadow Implementation

## Scope and status

This stage implements the first, observation-only layer described by the Stage
4D-11C canary contract. It is limited to automatic one-to-one Direct Chat. The
rule remains **V2 may veto a proven-unsafe legacy write; V2 may never create a
new write**. The implementation does not activate a Canary, suppress a
canonical write, or change production authority.

Starting refactor HEAD: `97c72438e683502c7412c24a1211376adabb2e6e`.
Stable original-repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`.

Readiness for this implementation stage is
`SHADOW_VALIDATOR_IMPLEMENTED_NEEDS_REAL_EVIDENCE` until one isolated real
runtime shadow extraction is deliberately run and reviewed. No `extractNow()`
run or real-runtime evidence was performed by this implementation change.

## Validator contract

`src/features/chat/services/directChatMemorySafetyVetoValidator.ts` exports the
pure total function `validateDirectChatSafetyVeto(input)`. It has no React,
storage, Prompt, Provider, cursor, or canonical-writer dependency and returns
exactly one of:

* `allow_veto` with an approved reason;
* `deny_veto` when the candidate is known not to qualify; or
* `insufficient` when identity/provenance/correlation is not reliable.

The only approved reasons are:

* `SAFETY_VETO_CANCELLED_PLAN` ← `cancelled_plan_not_active`;
* `SAFETY_VETO_TEMPORARY_PREFERENCE` ← `temporary_preference_not_durable`.

Both an allowlisted Bridge reason and its reason-specific predicate are
required. `bridgeState === "safety_veto"` alone is never authority.

Cancelled-plan eligibility requires an accepted legacy plan, V2 effective
semantic `plan`, model-native V2 metadata, `planLifecycle === "cancelled"`, a
reliable same-lineage unique pair, exact scope, and trusted provenance.
Temporary-preference eligibility requires an accepted durable legacy
preference/fact-like candidate, V2 effective semantic `preference`, model-native
metadata, `durability === "temporary"`, and the same identity gates.

Active, uncertain, or stable/unknown preferences are denied. Completed plans
are explicitly disabled with `predicate_disabled`. Scene-only, relationship,
subjective/non-objective, event, and episodic candidates are denied. V2-only,
legacy-rejected, asserted-to-objective upgrades, non-Direct-Chat scopes, and a
non-safety Bridge state cannot become a veto. Any missing/partial/mismatched
lineage, ambiguous or duplicate pair, stale operation, scope mismatch, or
untrusted provenance returns `insufficient`. A malformed/throwing validator
input is converted to `validator_error_fail_open`.

The first validator accepts only `lineageStatus === "shared"`, an exact unique
pair from the same extraction operation, and no structural fallback. The
Bridge's structural matcher remains unchanged; its new metadata-only
`lineageStatus`, pair cardinality, and provenance flags are observations only.

## Shadow adapter and wiring

`src/features/chat/services/directChatMemorySafetyVetoShadow.ts` consumes the
current extraction operation's Bridge Shadow observations and calls the pure
validator. It owns the try/catch boundary, fail-open conversion, metadata
sanitization, and an in-memory bounded buffer (maximum 100 records per page
session). The development-only global
`globalThis.__fanfanjiMemorySafetyVetoShadow` exposes `enable`, `disable`,
`clear`, `count`, and `exportJson`; `exportJson()` declares
`persistenceMode: "in_memory_only"`. There is no localStorage, IndexedDB,
network telemetry, leader election, or durable migration.

The only production wiring is the Direct Chat branch of
`useChatMemoryExtraction.handleExtractMemories()`. It evaluates the current
Bridge result when the shadow flag is enabled, then ignores the validator
result. `result.acceptedClaims` and the exact `commitMemoryWriteBundle()` input
remain unchanged. The canonical writer and knowledge repository do not import
the validator; the shadow adapter is the only importer. The existing Admission
Shadow flag still controls whether V2 observation data is produced, so enabling
this new safety shadow alone cannot change the Prompt or Provider path.

Telemetry is metadata-only: evaluated/result/reason, proposed reason,
eligible/wouldVeto/skipped/failOpen, feature scope, correlation state, Bridge
state, and metadata-source class. It never stores statements, message text,
Prompt, evidence quotes, source references, scope IDs, candidate IDs, lineage
tokens, Provider responses, secrets, or stacks.

## Canonical and runtime invariants

`deny_veto` and `insufficient` mean that a future runtime must preserve the
legacy accepted write. In this stage the result is only observed. No
`acceptedClaims`, commit payload, `KnowledgeClaim`, archive cursor, Summary,
ProjectionJob, MemoryItem, Event, RelationshipState, or Scene is filtered or
rewritten. The adapter adds no Provider request, retry, fallback, Prompt block,
or token work. Group Chat, Offline, and Manual extraction are outside the
Direct Chat guard and do not invoke this validator.

## Contract tests

`scripts/memorySafetyVetoShadow.test.ts` contains the 20 required cases and
additional regressions for partial/stale lineage, operation mismatch,
allowlisted-reason predicate failure, unknown reasons, non-safety Bridge state,
stable/uncertain policies, and disabled semantic kinds. It also covers:

* shadow enabled/disabled behavior and the 100-record bound;
* metadata-only export and malformed-observation fail-open behavior;
* a partial batch where one candidate would veto but all three original claims
  and the commit payload remain unchanged;
* a synthetic validator throw;
* source scans proving canonical writer/repository independence and the
  Direct-Chat-only wiring guard.

## Real-runtime evidence

No real extraction was run in this code-only stage. Consequently there is no
real `wouldVeto` count, no `memory_extract` evidence to export, and no claim of
actual suppression. A later, explicitly approved isolated run may enable the
shadow, clear it, use the existing temporary conversation, call `extractNow()`,
and export sanitized `real_runtime` evidence. It must still demonstrate zero
canonical suppression and zero Provider/Prompt deltas.

## 81-point acceptance checklist

1. Validator file: `directChatMemorySafetyVetoValidator.ts`.
2. Shadow file: `directChatMemorySafetyVetoShadow.ts`.
3. Validator purity: yes; it is total and side-effect free.
4. Outputs: `allow_veto`, `deny_veto`, `insufficient`.
5. Approved reasons: cancelled plan and temporary preference only.
6. Cancelled predicate: accepted legacy plan + model-native cancelled V2 plan + identity gates.
7. Temporary preference predicate: accepted legacy preference + model-native temporary V2 preference + identity gates.
8. Completed plan: disabled (`predicate_disabled`).
9. Stable preference: denied.
10. Unknown preference: denied.
11. Scene: disabled/denied.
12. Relationship: disabled/denied.
13. Subjective: disabled/denied.
14. Event: disabled/denied.
15. Episodic: disabled/denied.
16. Same-lineage: required (`shared`).
17. Structural fallback: not accepted by this validator.
18. Same extraction operation: required; represented by the shared runtime lineage contract.
19. Exact scope: character, relation, user identity, and conversation diagnostics must be exact.
20. Provenance: trusted legacy and V2 provenance required.
21. Unique pair: required.
22. Ambiguity: `insufficient`, fail-open.
23. Duplicate conflict: `insufficient`, fail-open.
24. Stale operation: `insufficient`, fail-open.
25. Partial lineage: `insufficient`, fail-open.
26. V2-only: `deny_veto`; no write authority.
27. Legacy rejected: `deny_veto`; no upgrade authority.
28. Asserted → objective: denied; no write upgrade.
29. Validator error: `validator_error_fail_open`.
30. Fail-open: shadow catches and records without entering canonical write handling.
31. Wiring: Direct Chat branch of `useChatMemoryExtraction.handleExtractMemories()`.
32. Canonical writer imports validator: no.
33. `acceptedClaims` changed: no.
34. Commit payload changed: no.
35. `KnowledgeClaim` changed: no.
36. Cursor changed: no.
37. Summary changed: no.
38. ProjectionJob changed: no.
39. MemoryItem changed: no.
40. Event changed: no.
41. RelationshipState changed: no.
42. Scene changed: no.
43. Group invokes validator: no.
44. Offline invokes validator: no.
45. Manual invokes validator: no.
46. Provider delta: zero by construction; no Provider code changed.
47. Prompt delta: zero by construction; no Prompt code changed.
48. Token delta: zero by construction.
49. Telemetry buffer: bounded in-memory, maximum 100 records/session.
50. Buffer persistent: no.
51. Privacy: sanitized metadata only.
52. Raw lineage stored: no.
53. Raw IDs stored: no in the new safety telemetry/export.
54. Tests added: `memorySafetyVetoShadow.test.ts`.
55. 20-case matrix: implemented; targeted test passes.
56. Extra regressions: implemented for correlation, reason, scope, semantics, and disabled paths.
57. Partial batch test: implemented; three original claims/commit payload remain intact.
58. Validator throw test: implemented; fail-open result asserted.
59. Production dependency scan: implemented in the targeted test.
60. Real runtime shadow run: not run in this stage.
61. `extractNow()`: not invoked in this stage.
62. Real `wouldVeto` observed: not claimed; no runtime extraction run.
63. Actual suppression: zero; suppression path does not exist in this change.
64. Provider attempts: unchanged.
65. Fallback: unchanged.
66. Canonical stores: unchanged.
67. User data: no production user data read or changed by tests.
68. Readiness: `SHADOW_VALIDATOR_IMPLEMENTED_NEEDS_REAL_EVIDENCE`.
69. Limited Canary design: allowed for a future approved stage only.
70. Limited Canary implemented: no.
71. Production authority changed: no.
72. Starting HEAD: `97c72438e683502c7412c24a1211376adabb2e6e`.
73. Final HEAD: recorded in the stage commit/report after validation.
74. Commit: one single-purpose safety-veto shadow implementation commit.
75. Tests: full-suite result recorded in the stage report.
76. Lint: recorded in the stage report.
77. Build: recorded in the stage report.
78. Dependency gate: 105 allowlisted edges and 3 cycle baseline, rechecked.
79. AI accounting: no request-count path changed.
80. Smoke: no application smoke run was required for this code-only shadow stage.
81. Worktree: must be clean after the single-purpose commit.

## Next recommendation

Keep canonical behavior unchanged and perform one explicitly approved,
isolated real-runtime shadow extraction with sanitized export. Review lineage,
scope, provenance, reason, and zero-suppression evidence before designing (but
not silently activating) any limited Canary policy.
