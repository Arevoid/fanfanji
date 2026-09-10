# Stage 4D-11B — Targeted Missing Policy Evidence

Status: complete. This stage collected bounded, development-only, metadata-only
evidence and stopped before Canary design or implementation.

- Starting refactor HEAD: `73c09842ee5cbf883180d1ddc367428a09cca2d5`
- Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Runtime: isolated headless Edge profile and refactor development server
- Scope: synthetic one-to-one Direct Chat relation/transcripts only
- Extraction: real Provider path, existing `extractNow()`, Admission/Bridge
  Shadow enabled, `observation_only`
- Production code: unchanged

## Bounded run summary

Exactly three targeted scenarios were run, one extraction per scenario. No
additional extraction was attempted after Scenario G.

| Scenario | Target | Window messages | Candidates | Provider observed | Result |
| --- | --- | ---: | ---: | --- | --- |
| E | Completed-plan wording | 6 | 2 | yes | emitted `event`, not `plan + completed` |
| F | Temporary preference | 4 | 3 | yes | two `preference + temporary` rows |
| G | Unknown preference | 4 | 2 | yes | two `preference + unknown` rows |

## Completed-plan evidence

Scenario E did not produce model-native `planLifecycle=completed`. The Provider
returned two `event` candidates. The legacy side retained two future-plan
diagnostics without a paired V2 row; their scope was exact and the diagnostics
had no source-window/lineage metadata, so they are recorded as diagnostic
metadata absence rather than transport corruption.

The V2 event rows remained non-writing (`event_route`/review path). No active
future plan write occurred and no completed-plan safety-veto row was needed.
This establishes the required safe fallback and records:

`COMPLETED_PLAN_NOT_MODEL_NATIVE_IN_CURRENT_CONTRACT`

The contract is therefore safe for Canary design only with completed-plan
handling treated as a deferred model-native taxonomy capability; Prompt changes
are not authorized in this stage.

## Preference evidence

Scenario F produced two model-native `preference` rows with
`durability=temporary`. Both entered Bridge Shadow
`safety_veto / temporary_preference_not_durable`, with zero write proposals.
Scenario G produced two model-native `preference` rows with
`durability=unknown`. Both entered `review / unknown_preference_durability`.
None became `stable`; `UNKNOWN_TO_STABLE_ESCALATION=0` and
`TEMPORARY_TO_DURABLE_WRITE=0`.

Across the three targeted scenarios: preference candidates 4, durability
present 4/4, stable 0, temporary 2, unknown 2, missing 0, Bridge veto 2,
Bridge review 2, write proposals 0. Including the two stable rows from 11A,
the cumulative preference evidence is stable 2, temporary 2, unknown 2.

## Confirmed-fact seam audit

The Direct Chat extraction path constructs `KnowledgeWriteCandidate.source.kind`
as `user_message`. The write policy resolves user-authored evidence to
`asserted` unless `userConfirmed=true`; the Direct Chat extraction context does
not set that confirmation flag. Model confidence or a character's affirmative
reply is not a trusted confirmation source.

The only confirmed-producing seams are outside ordinary Direct Chat extraction:
manual user-confirmation, deterministic actions, and the explicitly confirmed
offline-story boundary. Therefore:

`CONFIRMED_FACT_NOT_REPRESENTABLE_IN_DIRECT_CHAT_EXTRACTION`

No synthetic confirmed-fact extraction was run. Direct Chat automatic
extraction must not create confirmed objective authority; future confirmed
Truth evidence must come from a deterministic system source, verified Event,
trusted repository, or explicit confirmation workflow.

## Bridge, correlation, and accounting

Stage 11B primary observations were 7; legacy candidate rows 9; V2 candidate
rows 7; Bridge-side rows 9. Reliable pairs were 5 (three F conflicts and two G
conflicts), exact pairs 0, and semantic/policy conflicts 5. The E ambiguous and
unmatched rows had no scope/provenance mismatch and were caused by absent
diagnostic source-window/lineage fields, not cross-scope transport.

| Metric | Stage 11B | Cumulative with 11A |
| --- | ---: | ---: |
| reliable pairs | 5 | 18 |
| bridge-side expected pair slots | 9 | 24 |
| `reliablePairRate` | 5/9 = 55.6% | 18/24 = 75.0% |
| exact pairs | 0 | 1 |
| `exactRate` | 0/9 = 0.0% | 1/24 = 4.2% |
| wrong pair | 0 | 0 |
| transport unmatched | 0 | 0 |
| transport ambiguous | 0 | 0 |
| scope failures | 0 | 0 |
| provenance failures | 0 | 0 |
| `wouldWriteProposal` | 0 | 0 |
| `wouldSafetyVeto` | 2 | 3 |

The five Stage 11B reliable pairs all had exact scope, trusted provenance, and
unique same-lineage pairing. Diagnostic rows without a source window are not
silently promoted to reliable pairs.

Each completed extraction added two logical `memory_extract` Ledger records:
three primary default-model failures and three successful active-model
fallbacks. New Stage 11B total: six logical records, six Provider attempts,
three primary failures, three fallback successes. This is the unresolved
`MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK` debt; no Provider or retry/fallback
implementation changed. Bridge request delta was zero.

## Safety, storage, and privacy

- `wouldWriteProposal`: 0; no proposal validator was invoked.
- unsafe write proposal: 0.
- asserted → objective concerns: cumulative 3 from 11A; none became a write.
- V2-only write: 0; old-reject/new-accept write: 0.
- completed active write: 0; temporary durable write: 0; uncertain objective
  write: 0.
- Direct RelationshipState or Scene mutation: 0.
- `observation_only` left acceptedClaims, KnowledgeClaim, MemoryItem, Summary,
  ProjectionJob, cursor, Event, RelationshipState, and Scene unchanged in
  production stores.
- Only the isolated synthetic `phone_messages` fixture was replaced between
  scenarios and restored to the Stage 4D sample; no user profile or backup was
  read.
- Export privacy remained clean: no message text, statement, quote, Prompt,
  Provider response, source/scope/candidate/lineage ID, secret, Authorization,
  stack, or idempotency key.

## Missing-boundary completion matrix

| Missing boundary | Targeted | Observed | Safe behavior | Conclusion |
| --- | ---: | ---: | --- | --- |
| completed plan | yes | 0 native completed; 2 event fallback rows | route/review, no active write | not model-native; safe fallback recorded |
| temporary preference | yes | 2 | shadow veto, no durable write | covered |
| unknown preference | yes | 2 | review, no stable escalation | covered |
| confirmed fact seam | audited; no legal run | absent in Direct Chat | asserted/inferred only | formally outside Direct Chat gate |

## 76-item completion checklist

1. Scenarios run: E, F, G (3).
2. `extractNow()`: 3, one per scenario.
3. Provider attempts: 6.
4. Primary failures: 3.
5. Fallback successes: 3.
6. Bridge request delta: 0.
7. Completed plan targeted: yes.
8. Completed plan observed: no; two event fallbacks.
9. Completed bridge outcome: route/review fallback; no active write.
10. Completed active write: 0.
11. Completed safety-veto candidate: 0.
12. Temporary preference targeted: yes.
13. Temporary observed: 2.
14. Temporary durability model-native: yes, `temporary` 2/2.
15. Temporary bridge outcome: safety veto, non-write.
16. Temporary durable write: 0.
17. Unknown preference targeted: yes.
18. Unknown observed: 2.
19. Unknown bridge outcome: review, non-write.
20. Unknown → stable escalation: 0.
21. Total preference candidates: 4 targeted; 6 cumulative with 11A.
22. Stable count: 0 targeted; 2 cumulative.
23. Temporary count: 2.
24. Unknown count: 2.
25. Missing durability count: 0 among targeted preference rows.
26. Confirmed fact seam exists in Direct Chat: no.
27. Confirmed fact test run: no legal Direct Chat seam.
28. Legacy confirmed observed: no.
29. V2 objective observed: 4 targeted rows; remaining targeted rows were uncertain.
30. `wouldWriteProposal`: 0.
31. Unsafe write proposal: none.
32. Proposal validator-safe: no proposals emitted.
33. Asserted → objective escalation: cumulative 3 evidence concerns; no write.
34. `wouldSafetyVeto`: 2 targeted; 3 cumulative.
35. Expected veto candidates: 2 temporary preferences targeted.
36. Reliable pairs: 5 targeted; 18 cumulative.
37. `reliablePairRate`: 55.6% targeted; 75.0% cumulative.
38. Wrong pair: 0.
39. Unmatched transport: 0.
40. Ambiguous transport: 0.
41. Scope failures: 0.
42. Provenance failures: 0.
43. Correlation still validated for trusted scope-exact pairs: yes.
44. Prompt changed: no.
45. Provider changed: no.
46. Retry/fallback changed: no.
47. Request delta: 0 from Bridge.
48. Token delta: not measured; no Prompt change.
49. Production storage changed: no; isolated fixture only was rewritten/restored.
50. KnowledgeClaim changed: no.
51. MemoryItem changed: no.
52. Summary changed: no.
53. ProjectionJob changed: no.
54. Cursor changed: no.
55. Event changed: no canonical mutation.
56. RelationshipState changed: no.
57. Scene changed: no.
58. Privacy clean: yes.
59. Completed-plan contract sufficient: safe fallback sufficient for design;
    native completed metadata remains deferred.
60. Preference durability contract sufficient: yes for bounded non-write
    design evidence; no durable authority cutover.
61. Confirmed-fact authority contract clear: yes; Direct Chat cannot create
    confirmed authority.
62. Policy evidence sufficient: yes for Canary design only, with completed
    native taxonomy deferred.
63. Readiness: `POLICY_EVIDENCE_SUFFICIENT_FOR_CANARY_DESIGN`.
64. Can Canary design begin: yes, after separate approval.
65. Canary implementation begin: no.
66. Production authority changed: no.
67. Starting HEAD: `73c09842ee5cbf883180d1ddc367428a09cca2d5`.
68. Final HEAD: recorded by the Stage 4D-11B commit.
69. Commit: `audit: close admission policy evidence gaps`.
70. Tests: 578/578.
71. Lint: passed.
72. Build: passed.
73. Dependency gate: passed, 105 allowlisted edges / 3 cycles.
74. AI accounting: 6 new logical records, 6 attempts, 3 primary failures,
    3 fallback successes.
75. Smoke: passed.
76. Worktree status: clean after commit; original repository remains clean at
    the stable baseline.

## Readiness and next recommendation

Readiness is `POLICY_EVIDENCE_SUFFICIENT_FOR_CANARY_DESIGN`. This means the
bounded policy safety conditions have real evidence or an explicit safe
fallback; it does not authorize implementation. Before any future Canary
design, review the E diagnostic metadata gap and decide whether completed plans
need a model-contract revision. Do not change Prompt, Provider, authority,
storage schema, or taxonomy in this stage.

Rollback is a single `git revert` of the Stage 4D-11B documentation commit;
there is no migration and no production data rollback requirement.
