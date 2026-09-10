# Stage 4D-11A — Bounded Real Policy Evidence Coverage

Status: complete as a bounded, development-only evidence run. No Canary, no
production authority change, and no canonical Memory write were performed.

- Starting refactor HEAD: `23e1274b4f885832f7ead7e86e6ce4ab23e7fd02`
- Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Runtime: isolated headless Edge profile, refactor Vite development server,
  normal one-to-one Direct Chat scope
- Extraction path: real `extractNow()` → real Provider/model fallback → real
  Memory Extraction/parser/source binding → Admission Shadow and Bridge Shadow
- Persistence mode: `observation_only`
- Evidence privacy: enum/boolean/count metadata only; no text, quote, source
  reference, scope/candidate/lineage identifier, Prompt, response, or secret

## Run boundary and operation audit

Four bounded logical evidence scenarios completed, one extraction per scenario.
The isolated profile contained the existing Stage 4D synthetic relation. The
temporary `phone_messages` fixture was replaced with a short synthetic
transcript for each scenario and restored to the Stage 4D sample afterward;
this was not a user profile and did not use a backup. No production/user data
was read or changed.

There were two preflight trigger probes before the four evidence runs: one
timed out before producing a Ledger or Shadow record, and one returned
`ACTIVE_DIRECT_SCOPE_UNAVAILABLE`. They are recorded as non-evidence probes;
no additional extraction was attempted after the four bounded evidence calls.

| Scenario | Target | Messages in selected window | Extraction result | Candidates | Shadow observations |
| --- | --- | ---: | --- | ---: | ---: |
| A | Existing mixed assertion/objective boundary sample | 18 | completed; Provider observed | 5 | 5 |
| B | Plan lifecycle plus event boundary | 8 | completed; Provider observed | 3 | 4 bridge-side rows (2 reliable, 1 ambiguous, 1 unmatched diagnostic) |
| C | Stable/temporary/unknown preference wording | 6 | completed; Provider observed | 3 | 3 |
| D | Episodic, relationship signal, and scene-only wording | 6 | completed; Provider observed | 3 | 3 |

The B ambiguous/unmatched rows were not scope or provenance mismatches. The
unmatched legacy diagnostic had no source-window metadata and no paired V2
candidate; it is reported as missing diagnostic metadata, not as a transport
corruption. No paired record had wrong-character, wrong-conversation,
wrong-relation, untrusted-provenance, or shared-lineage mismatch.

## Provider and accounting

The four completed extractions added eight logical `memory_extract` Ledger
records: four primary default-model failures and four successful active-model
fallbacks. Each Ledger record reported `providerRequestCount=1`, so the batch
used eight Provider attempts. The isolated profile contained twelve
`memory_extract` records after the run, including four records from the prior
Stage 4D evidence baseline.

This remains the known `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK` debt. The
Bridge Shadow added no Provider request (`request delta = 0`); it only consumed
the already returned extraction result. No Provider, retry, fallback, Prompt,
or accounting implementation was changed.

## Scenario A — assertion/objective boundary

The existing synthetic transcript yielded five model-native V2 rows: two
fact-shaped rows, one plan, one relationship signal, and one episodic row.
All five had present V2 epistemic metadata and objective status. The Bridge
Shadow produced three reviews and two routes; `wouldWriteProposal=0` and
`wouldSafetyVeto=0`.

One row exhibited the evidence concern
`asserted_to_objective_escalation`: the legacy side remained an asserted,
non-objective user assertion while the V2 side carried objective metadata.
The Bridge stayed in review and did not propose a write. The run therefore
showed no unsafe authority escalation. A trusted confirmed fact is not
representable through this Direct Chat seam, so
`CONFIRMED_FACT_NOT_REPRESENTABLE_IN_CURRENT_TEST_SEAM` remains open.

## Scenario B — plan lifecycle and event

Observed V2 policy metadata included:

- one `cancelled` plan with `cancelled_plan_not_active`; Bridge state
  `safety_veto`, `wouldSafetyVeto=1`, `wouldWriteProposal=0`;
- one `uncertain` plan with `uncertain_plan_requires_review`; Bridge state
  `review`;
- one `event` with `accepted_event`; Bridge state `route`.

The existing Stage 4D sample supplied one `active` plan (reviewed). No
`completed` plan was emitted in this bounded batch. No cancelled, completed, or
uncertain plan became an active write. The safety-veto row is a shadow
observation only; no real veto or authority mutation occurred.

## Scenario C — preference durability

Two preference rows were observed across scenarios A and C. Both exposed
model-native `stable` durability and were reviewed; neither produced a write
proposal. No model-native `temporary` or `unknown` preference durability was
emitted by this batch. Consequently stable-versus-temporary durability remains
insufficient for a Canary design, and no Prompt change was made to force it.

## Scenario D — taxonomy routing

The real Provider output distinguished the requested taxonomy boundaries:

| Candidate kind | Count | Bridge outcome | Canonical side effect |
| --- | ---: | --- | --- |
| `event` | 1 | `route` (`event_route`) | none |
| `episodic` | 2 | `route` (`episodic_review_or_route`) | none |
| `relationship_signal` | 2 | `route`/review (`relationship_signal_review`) | no direct RelationshipState mutation |
| `scene_only` | 1 | `reject` (`scene_only_not_truth`) | no Scene mutation |

The event row came from scenario B; the other rows came from A and D. No
taxonomy row produced `wouldWriteProposal`.

## Aggregate metadata-only metrics

Primary comparator observations across the four completed scenarios: 14. The
Bridge-side candidate rows are legacy 15 and V2 14; the extra legacy row is the
B unmatched diagnostic. Bridge-side rows total 15 after candidate-side pairing
is materialized.

| Metric | Count |
| --- | ---: |
| exact Bridge pairs | 1 |
| same-lineage semantic/policy conflicts | 12 |
| safe duplicates | 0 |
| reliable pairs | 13 |
| bridge-side expected pair slots | 15 |
| `reliablePairRate` | 13/15 = 86.7% |
| `exactRate` | 1/15 = 6.7% |
| wrong pair | 0 |
| unmatched due transport | 0 |
| ambiguous due transport | 0 |
| scope failures | 0 |
| provenance failures | 0 |
| temporal mismatch | 0 |
| `wouldWriteProposal` | 0 |
| `wouldSafetyVeto` | 1 |
| `wouldReview` | 7 |
| `wouldRoute` | 5 |
| `wouldPassthrough` | 1 |
| unsafe authority escalations | 0 |
| asserted → objective escalation concerns | 3 |

The 13 reliable pairs satisfy shared runtime lineage, exact scope, trusted
provenance, and unique pairing. The B ambiguous/unmatched diagnostic is kept
outside the reliable-pair numerator and is a metadata-contract gap, not
silently counted as exact.

Model-native epistemic metadata was present on all 14 primary observations:
objective 10, subjective 2, uncertain 2. Plan candidates totalled four:
active 2, cancelled 1, uncertain 1, completed 0, unknown lifecycle 0.
Preference candidates totalled two: stable 2, temporary 0, unknown 0.

## Safety and storage invariants

- `wouldWriteProposal` was zero for every row, so no proposal validator needed
  to be accepted as safe.
- V2-only write: 0.
- Old-reject/new-accept write: 0.
- Uncertain objective write: 0.
- Cancelled active write: 0.
- Completed active write: 0 (no completed candidate observed).
- Temporary durable preference write: 0.
- Direct `RelationshipState` mutation: 0.
- Direct Scene mutation: 0.
- acceptedClaims, KnowledgeClaim, MemoryItem, Conversation Summary,
  ProjectionJob, cursor, Event, and RelationshipState production stores were
  unchanged by `observation_only` extraction.
- The only storage operation was temporary rewriting/restoration of the
  isolated synthetic `phone_messages` fixture used to select each scenario;
  no user data, user backup, or production storage was touched.
- Bridge/Shadow export remained metadata-only and contained no forbidden
  fields: message text, statement, evidence quote, Prompt, full response,
  source/scope/candidate/lineage IDs, API key, Authorization, raw exception,
  stack, or idempotency key.

## Evidence coverage matrix

| Boundary | Targeted | Model-native observed | Safe observed behavior | Open issue |
| --- | ---: | ---: | --- | --- |
| epistemic objective/uncertain | yes | 14/14 | uncertain reviewed; no write | confirmed source unavailable |
| asserted → objective | yes | 3 concerns | review/route only; no write | needs policy evidence |
| plan active | yes | 2 | review/defer | no completed comparison |
| plan cancelled | yes | 1 | shadow safety veto; no write | more real pairs desirable |
| plan completed | yes | 0 | not observed | need real evidence |
| plan uncertain | yes | 1 | review; no write | more real pairs desirable |
| preference stable | yes | 2 | review; no write | stable alone is not Canary proof |
| preference temporary | yes | 0 | not observed | metadata coverage gap |
| preference unknown | yes | 0 | not observed | metadata coverage gap |
| event | yes | 1 | route; no write | more semantic pairs desirable |
| episodic | yes | 2 | route; no write | canonical projection deferred |
| relationship signal | yes | 2 | route/review; no RelationshipState write | future boundary service needed |
| scene-only | yes | 1 | reject; no Scene mutation | remains outside Truth authority |

## 89-item completion checklist

1. scenarios run: 4 completed evidence scenarios (plus 2 non-evidence preflight probes recorded above).
2. completed evidence `extractNow()` count: 4; no further evidence calls.
3. synthetic messages: isolated fixture only; 18/8/6/6 selected-window counts.
4. new logical `memory_extract`: 8.
5. new Provider attempts: 8.
6. primary failures: 4.
7. fallback successes: 4.
8. Bridge request delta: 0.
9. total legacy candidate rows: 15.
10. total V2 candidate rows: 14.
11. reliable pairs: 13.
12. `reliablePairRate`: 86.7% (13/15 bridge-side slots).
13. exact pairs: 1.
14. semantic/policy conflicts: 12.
15. wrong pair: 0.
16. unmatched due transport: 0.
17. ambiguous due transport: 0.
18. scope/provenance failures: 0/0.
19. model-native epistemic count: 14/14.
20. objective: 10.
21. subjective: 2.
22. uncertain: 2.
23. asserted → objective escalation concerns: 3; none wrote.
24. unsafe authority escalations: 0.
25. plan candidates: 4.
26. active plans: 2.
27. cancelled plans: 1.
28. completed plans: 0.
29. uncertain plans: 1.
30. unknown lifecycle among plan candidates: 0.
31. expected plan veto candidates: 1 (`cancelled`).
32. preference candidates: 2.
33. durability present on preference rows: stable 2/2.
34. stable preferences: 2.
35. temporary preferences: 0.
36. unknown preference durability: 0.
37. temporary preference durable write: 0.
38. event candidates: 1.
39. episodic candidates: 2.
40. relationship-signal candidates: 2.
41. scene-only candidates: 1.
42. event Bridge outcome: route.
43. episodic Bridge outcome: route.
44. relationship Bridge outcome: route/review.
45. scene-only Bridge outcome: reject.
46. `wouldWriteProposal`: 0.
47. proposal validator-safe rows: none, because no proposal was emitted.
48. `wouldSafetyVeto`: 1.
49. `wouldReview`: 7.
50. `wouldRoute`: 5.
51. `wouldPassthrough`: 1.
52. V2-only write: 0.
53. old-reject/new-accept write: 0.
54. uncertain objective write: 0.
55. cancelled active write: 0.
56. completed active write: 0.
57. temporary durable write: 0.
58. direct RelationshipState mutation: 0.
59. direct Scene mutation: 0.
60. Prompt changed: no.
61. Provider changed: no.
62. retry/fallback changed: no.
63. token delta: not measured; no Prompt change and no evidence of a request-shape delta.
64. request delta from Bridge: 0.
65. production storage changed: no; isolated synthetic fixture was temporarily rewritten/restored.
66. KnowledgeClaim changed: no.
67. MemoryItem changed: no.
68. Summary changed: no.
69. ProjectionJob changed: no.
70. cursor changed: no.
71. canonical Event changed: no.
72. canonical RelationshipState changed: no.
73. privacy clean: yes; forbidden-field hits 0.
74. policy metadata sufficient for Canary: no.
75. correlation still validated: yes for trusted, scope-exact paired rows; diagnostic metadata gap remains.
76. readiness enum: `NEED_MORE_REAL_POLICY_EVIDENCE`.
77. Canary design start: no, not from this evidence.
78. Canary implementation start: no.
79. production authority changed: no.
80. starting HEAD: `23e1274b4f885832f7ead7e86e6ce4ab23e7fd02`.
81. final HEAD: recorded by the Stage 4D-11A commit.
82. commit: `audit: expand real admission policy evidence`.
83. tests: full suite unchanged at 578 tests before this docs-only stage.
84. lint: required final verification passed.
85. build: required final verification passed.
86. dependency gate: 105 allowlisted edges / 3 cycles; passed.
87. AI accounting: 8 new logical records, 8 attempts, 4 primary failures, 4 fallbacks.
88. smoke: passed.
89. worktree status: clean after commit; original repository remains clean at the stable baseline.

## Readiness and next recommendation

Readiness is `NEED_MORE_REAL_POLICY_EVIDENCE`. Correlation remains reliable for
all trusted, scope-exact paired rows and no unsafe authority escalation was
observed. The blockers are policy coverage, not a matcher change: no
completed-plan row, no temporary/unknown preference row, and no representable
confirmed external fact. The B diagnostic-only unmatched row also needs a
future metadata contract decision.

Do not start Canary or change production authority. The next recommended stage
is a separately approved, still observation-only evidence plan for completed
plans and temporary/unknown preference durability, followed by an explicit
policy review. No Prompt, Provider, retry/fallback, storage schema, or other
feature work is included here.

Rollback is a single `git revert` of the Stage 4D-11A documentation commit;
there is no migration and no production data rollback requirement.
