# Stage 4D-11E — Real Runtime Safety-veto Shadow Validation

## Result

The initial 11E attempt was blocked before application interaction. The
approved R1 retry below restored the runtime and completed the two allowed
real shadow extractions. Current readiness is:

`REAL_SHADOW_VALIDATED_FOR_LIMITED_CANARY_DESIGN`

Starting refactor HEAD for the initial blocked attempt:
`8822c2c6866dba7e4b1c3c0140a6bdfed694abb7`

Stable original-repository HEAD:
`f515f7408cfe19da145f15a8ddffceae06e608d`

The code-only Stage 4D-11D implementation remains unchanged. No Canary,
suppression, Prompt, Provider, matcher, comparator, bridge policy, storage, or
authority change was made in this stage.

## Initial runtime setup and blocker (historical)

The requested isolated browser verification could not be started:

* the local application endpoint `http://127.0.0.1:3000/` and `/healthz` were
  unavailable when checked;
* the available CUA browser entry failed on `getState()` with
  `failed to write kernel assets: 系统找不到指定的路径。 (os error 3)`;
* retrying the same call and resetting/reinitializing the CUA session produced
  the identical error;
* the Node REPL browser/CDP fallback failed with the same kernel-assets error.

No click, typing, login, message submission, `extractNow()`, Provider request,
or page-side state mutation was attempted after the blocker. This is an
environment/tooling blocker, not evidence of a runtime safety failure.

## Stage 4D-11E-R1 — Real runtime retry result

Starting refactor HEAD for R1:
`8f730ba47fd15d1283a3d1ab6df12bf4174d3818`

The refactor Vite dev server was restored at `http://127.0.0.1:3000/`; both
the application endpoint and `/healthz` returned HTTP 200. The in-app browser
and CDP were recovered after the earlier kernel-assets failure. The existing
one-to-one `Stage4D3 临时样本` conversation was reused. Only two explicitly
synthetic, send-only scenarios were added: a cancelled future plan (H) and a
temporary beverage preference (I). No real production user data was used and
the temporary fixture was not deleted.

The development-only Admission and Safety-veto shadows were enabled and
cleared before each extraction. `extractNow()` was invoked exactly once for H
and exactly once for I (two total). Both CDP calls exceeded the host's command
deadline before returning their helper result; they were not retried. Follow-up
observation of the page and bounded in-memory exports confirmed both calls had
completed, with the sanitized results below.

### Sanitized real observations

Scenario H (cancelled plan): two observations were produced. Both had exact
scope, trusted V2 model-native metadata, the `safety_veto` Bridge state, and
the `cancelled_plan_not_active` Bridge reason. The pure validator returned
`allow_veto` / `SAFETY_VETO_CANCELLED_PLAN` for both; both were eligible and
`wouldVeto: true`. The result implies the validator's shared-lineage,
same-extraction-operation, unique-pair, and provenance gates all passed; raw
lineage and IDs were not exported.

Scenario I (temporary preference): two observations were produced after the
shadow buffers were cleared. One was the existing cancelled-plan candidate
and again returned `allow_veto` / `SAFETY_VETO_CANCELLED_PLAN`. The new
temporary-preference candidate carried exact scope and trusted V2 metadata but
was classified as a `fact` rather than an effective `preference`; the
validator therefore returned `deny_veto` /
`temporary_preference_semantic_mismatch`, with `eligible: false` and
`wouldVeto: false`. The Bridge observation recorded
`temporary_preference_not_durable`; no veto authority was activated.

Across the two runs, the Safety shadow observed 3 `allow_veto` results, 1
`deny_veto`, 0 `insufficient`, 0 fail-open records, and 3 `wouldVeto` records
in the two per-scenario buffers (H: 2/0/0/2; I: 1/1/0/1). Actual suppression
remained zero. The Admission shadow was observation-only (H: 2 observations;
I: 2 observations) and its bounded metrics remained local to the page.

### Provider and Ledger evidence

The real extraction path used the existing `server-proxy` provider. The
current Ledger contained 30 historical `memory_extract` records at the end of
R1. Each of the two new extraction runs produced the existing primary-failure
then active-model-fallback-success pair (one provider attempt recorded on each
entry); no additional attempt was introduced by either shadow. The latest
entries had `provider: server-proxy`, models `gemini-3.5-flash` then the active
chat model alias, statuses `failure` then `success`, `providerRequestCount: 1`
each, retry count 0, fallback count 0, and no persisted reason text. The
existing extraction fallback implementation creates the pair as two Ledger
records; this R1 made no change to that pre-existing accounting behavior.

No Prompt, Provider, retry, fallback, request-count, or token-building code
was changed. The Safety and Admission shadows added no Provider request. No
Prompt/body/response/API key/Authorization/raw exception text was returned by
the inspected metadata.

### Canonical safety result

`persistenceMode` was `observation_only`. The hook exits before the canonical
commit path, so `acceptedClaims`, commit payload, KnowledgeClaim/MemoryItem,
Summary, ProjectionJob, archive cursor, Event, RelationshipState, and Scene
were not written or changed. Group, Offline, and Manual paths were not
invoked. The shadow remains in-memory-only and bounded to 100 records per page
session; no durable telemetry or runtime export was produced.

The real `allow_veto` records satisfy the current validator contract (approved
reason, exact scope, trusted provenance, shared operation lineage, unique pair,
and reason-specific predicate). Therefore the evidence is sufficient to
design a separately approved limited Canary, but no Canary, suppression, or
authority change is implemented in R1.

## Scenario and evidence accounting (initial attempt)

Scenario H (cancelled plan): not run.

Scenario I (temporary preference): not run.

`extractNow` count: 0 (within the limit of 2).

Successful real extractions: 0.

Real validator invocations: 0.

Real telemetry observations: 0.

Real `allow_veto`, `deny_veto`, `insufficient`, and `wouldVeto` counts: not
observed. No claim is made about whether either natural scenario would hit an
approved reason; Prompt wording was not changed to seek a hit.

Because no extraction occurred, there is no real Provider-attempt, fallback,
Bridge-request, or Safety-shadow-request sample. The Stage 4D-11D contract and
its synthetic tests remain the evidence for zero deltas and canonical
equivalence.

## Safety and canonical invariants

`actualSuppression = 0`: no suppression code was run or added.

No `result.acceptedClaims`, commit payload, KnowledgeClaim, MemoryItem,
Summary, ProjectionJob, cursor, Event, RelationshipState, or Scene was read or
changed by this stage. No Group, Offline, Manual, Diary, or other feature was
triggered. No user backup or long-term user data was used.

The Stage 4D-11D shadow adapter remains in-memory-only, bounded to 100 records
per session, with no localStorage, IndexedDB, network export, raw lineage, or
raw IDs. Its privacy contract is unchanged; no runtime export was produced.

## Required next action from initial attempt (superseded by R1)

Restore a working isolated browser/CDP environment and a running refactor dev
server, then rerun at most two targeted Direct Chat scenarios (one
`extractNow()` per scenario). Capture only sanitized metadata:
`bridgeCorrelation`, `lineageStatus`, `pairUnique`, exact-scope/provenance
flags, Bridge state/reason, V2 metadata source, validator result/reason,
eligibility, `wouldVeto`, and `failOpen`.

Do not modify Prompt or production authority to force a veto hit. If a real
allow-veto is observed, verify shared lineage, same extraction operation, exact
scope, trusted provenance, unique pair, allowlisted reason, and the
reason-specific predicate before considering the next design stage. If only
deny/insufficient outcomes occur, use
`REAL_SHADOW_WIRING_VALIDATED_NEEDS_VETO_HIT` instead.

## Acceptance answers for initial attempt (historical 70-point checklist)

1. Scenarios run: none; blocked before setup.
2. `extractNow()` count: 0.
3. Successful extractions: 0.
4. Validator invoked in real runtime: no; not reached.
5. Real observations: 0.
6. Cancelled V2 produced: not observed.
7. Cancelled Bridge safety-veto: not observed.
8. Cancelled validator allow-veto: not observed.
9. Temporary V2 durability: not observed.
10. Temporary Bridge safety-veto: not observed.
11. Temporary validator allow-veto: not observed.
12. Total real allow-veto: 0 observed.
13. Total real deny-veto: 0 observed.
14. Total real insufficient: 0 observed.
15. Total real `wouldVeto`: 0 observed.
16. Actual suppression: 0.
17. Allowlist validation: synthetic contract only; no real allow-veto.
18. Shared-lineage validation: synthetic contract only; no real allow-veto.
19. Same extraction operation: synthetic contract only; no real run.
20. Exact scope: synthetic contract only; no real run.
21. Trusted provenance: synthetic contract only; no real run.
22. Unique pair: synthetic contract only; no real run.
23. Wrong pair: no real pair accepted.
24. Structural fallback allow-veto: no; validator requires shared lineage.
25. Partial lineage allow-veto: no; returns insufficient.
26. V2-only allow-veto: no; denied.
27. Legacy-rejected allow-veto: no; denied.
28. Asserted-to-objective allow-veto: no; denied.
29. `acceptedClaims` equivalent: unchanged; no runtime extraction.
30. Commit payload equivalent: unchanged; no runtime extraction.
31. KnowledgeClaim changed: no.
32. MemoryItem changed: no.
33. Summary changed: no.
34. ProjectionJob changed: no.
35. Cursor changed: no.
36. Event changed: no.
37. RelationshipState changed: no.
38. Scene changed: no.
39. Logical `memory_extract`: 0 real requests.
40. Provider attempts: 0 real attempts.
41. Primary failures: not applicable.
42. Fallback successes: 0.
43. Bridge request delta: 0; no runtime was started.
44. Safety-shadow request delta: 0; shadow is local-only and no runtime was started.
45. Prompt delta: 0; no Prompt code changed.
46. Token delta: 0; no Provider call occurred.
47. Telemetry persistent: no.
48. Telemetry maximum: 100/session.
49. Privacy: no runtime export; synthetic export contract remains clean.
50. Raw lineage stored: no in the new safety telemetry.
51. Raw IDs stored: no in the new safety telemetry.
52. User data used: no.
53. User backup used: no.
54. Production authority changed: no.
55. Group invoked: no.
56. Offline invoked: no.
57. Manual invoked: no.
58. Readiness: `REAL_SHADOW_WIRING_BLOCKED`.
59. Limited Canary design allowed: no, not until runtime evidence is collected.
60. Limited Canary implemented: no.
61. Starting HEAD: `8822c2c6866dba7e4b1c3c0140a6bdfed694abb7`.
62. Final HEAD before audit commit: same as starting HEAD.
63. Audit commit: recorded below.
64. Tests: Stage 4D-11D baseline was 579/579; no code changed here.
65. Lint: Stage 4D-11D baseline passed; no code changed here.
66. Build: Stage 4D-11D baseline passed; no code changed here.
67. Dependency gate: 105 allowlisted edges / 3 cycles baseline.
68. AI accounting: no runtime request; no delta.
69. Smoke: previously passed at Stage 4D-11D; current dev endpoint was unavailable for this attempt.
70. Worktree: must be clean after the audit-only commit.

## R1 final acceptance checklist

1. Dev server: restored; `/` and `/healthz` returned HTTP 200.
2. Browser/CDP: restored after retry; the earlier kernel-assets error did not
   recur during the run.
3. Scenarios: H cancelled plan and I temporary preference.
4. `extractNow()` count: H=1, I=1, total=2; neither timed-out call was retried.
5. Successful real extractions: 2 completed (confirmed after the CDP deadline
   by page state and bounded shadow exports).
6. Real validator invocations: 4 total observations.
7. Real observations: Admission H=2, I=2; Safety H=2, I=2 after each clear.
8. H result: 2 cancelled-plan `allow_veto`, 2 `wouldVeto`.
9. I result: 1 cancelled-plan `allow_veto`, 1 temporary-preference
   `deny_veto`, 1 `wouldVeto`.
10. Totals: `allow_veto`=3, `deny_veto`=1, `insufficient`=0,
    `wouldVeto`=3, `failOpen`=0.
11. Actual suppression: 0; no authority or Canary path ran.
12. Allowlist/lineage/scope/provenance/unique-pair checks: all gates required
    by the real `allow_veto` validator path passed; raw lineage and IDs were
    not exported. Ambiguous, partial, V2-only, legacy-rejected, asserted-to-
    objective, and structural-fallback cases remain denied/insufficient by the
    unchanged synthetic contract.
13. Canonical objects: accepted claims, commit payload, KnowledgeClaim,
    MemoryItem, Summary, ProjectionJob, cursor, Event, RelationshipState, and
    Scene unchanged because `observation_only` exits before commit.
14. Provider: existing `server-proxy`; the two runs used the existing primary
    extraction failure plus active-model fallback-success behavior. No Safety
    or Admission request was added.
15. Ledger: 30 `memory_extract` records present at inspection; each R1 run
    added the pre-existing failure/success pair with one attempt per entry,
    retry count 0, fallback count 0, and controlled reason arrays. This is an
    observed pre-existing fallback accounting shape, not an R1 change.
16. Prompt/request/token deltas: 0; no Prompt/provider/accounting code changed.
17. Persistent telemetry: no. Safety buffer remains in-memory-only, bounded
    to 100 records per page session.
18. Privacy: no Prompt, message text, complete response, API key,
    Authorization, raw exception body, raw lineage, or raw IDs were exported
    or persisted by the new shadow.
19. User data: only the explicitly-created synthetic messages in the existing
    `Stage4D3 临时样本` conversation; the fixture was retained.
20. Backup/authority/scope: no backup used; production authority unchanged;
    Group, Offline, and Manual paths not invoked.
21. Readiness: `REAL_SHADOW_VALIDATED_FOR_LIMITED_CANARY_DESIGN`.
22. Limited Canary: design may be proposed in a separately approved stage;
    implementation and cutover are not allowed by R1 and were not performed.
23. Starting HEAD: `8f730ba47fd15d1283a3d1ab6df12bf4174d3818`.
24. Baseline quality: latest validated Stage 4D-11D remains 579/579 tests,
    lint pass, build pass, dependency gate 105 allowlisted edges / 3 cycles,
    and smoke pass; R1 changed documentation only.
25. Worktree: must be clean after the single audit-document commit; original
    repository remains at `f515f7408cfe19da145f15a8ddffceae06e608d` and clean.

The next step is to stop and request explicit approval before designing a
limited Canary. Do not activate suppression or modify canonical authority as
part of this R1 result.
