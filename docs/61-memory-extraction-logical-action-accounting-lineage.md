# Memory Extraction Logical Action Accounting Lineage

Status: `ACCOUNTING_LINEAGE_FIXED_VALIDATED` only after the Stage 4D-11J
verification listed below. This document does not authorize long evidence
collection, Phase 2, Provider policy changes, or positive V2 write authority.

- Starting refactor HEAD: `20178c693f7336a5864f3310170de0e452657dd1`
- Stable original-repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Scope: `memory_extract` logical-action lineage and accounting only

## 1. Existing Ledger semantics

The AI Request Ledger is diagnostic metadata, not a business-memory store. Its
intended model is:

- one logical AI action has one stable `logicalActionId`;
- `providerRequestCount` is the number of physical Provider attempts represented
  by a row;
- `parentActionId` remains the higher-level user/business action lineage and is
  not repurposed as a Provider-attempt ID;
- provider/model/transport describe the last attempt represented by the row;
- no raw Prompt, message, response, API key, Authorization header, or raw error
  body is stored.

The additive `logicalActionId` is optional for backward compatibility. New
memory extraction wrappers always create one with the existing governed
`createAiActionId()` path when the caller does not supply one. It is ledger
metadata only and is never sent in the Provider request body or copied into the
Memory source envelope.

## 2. Fallback split root cause

`apiExtractMemoriesWithModelFallback` invokes `apiExtractMemories` once for the
configured extraction model and again for the active chat model when the first
call returns an eligible model/transport error. Before this fix, each wrapper
created an independent Ledger session, so one business operation appeared as:

```text
row A: memory_extract, providerRequestCount = 1
row B: memory_extract, providerRequestCount = 1
```

The two rows had no reliable logical grouping. This was an accounting
representation defect, not a request-policy defect.

## 3. Chosen lineage design: Option B, linked rows

Option A (one shared Ledger session) was considered but would require changing
the existing wrapper/session boundary and could also change API-usage metric
semantics. Option B is the safer minimal fix:

1. The fallback wrapper creates one governed `logicalActionId` per business
   extraction invocation.
2. Primary and fallback calls receive that same transient value.
3. Each existing wrapper session persists the value additively in its row.
4. A pure aggregation helper groups only exact matching non-empty IDs.

No timestamps, model names, array positions, reason text, or scope proximity
are used to guess a relationship. Two independent extractions generate two
different logical IDs, even if they use the same character, model, or messages.

## 4. Logical versus physical definitions

The authoritative contract is:

```text
Logical AI action:         memory_extract = 1
Primary Provider attempt:                         1
Fallback Provider attempt:                        1
Total physical attempts:                          2
```

Thus a primary failure followed by fallback success is one business extraction
and two Provider executions. A direct backend-to-browser fallback inside one
Ledger session also remains one logical ID with `providerRequestCount=2`.

## 5. Schema impact and compatibility

`logicalActionId?: string` was added additively to `AiRequestLedgerInput` and
`AiRequestEnvelope`, and to the internal memory-extraction request type. The
request implementation strips it before sending `requestBody` to the backend
or Provider. The existing storage key, existing fields, retention, and flush
strategy remain unchanged.

No migration, rewrite, backfill, or deletion of old Ledger rows is required.
Old rows without the field remain readable and are classified as
`logical_grouping_unknown`; they are never retroactively paired. Authoritative
long-evidence counting starts only with rows created after this lineage fix.

## 6. Aggregation rules

`aggregateAiRequestLedgerAccounting(records)` returns:

- `logicalActionCount`: distinct explicit `logicalActionId` values only;
- `physicalProviderAttemptCount`: the sum of every row's
  `providerRequestCount`;
- `logicalGroupingUnknownRows`: rows without a usable logical ID;
- `fallbackAttemptCount`: known-group physical attempts beyond one baseline
  attempt per known logical action. This is an extra-attempt metric; a report
  must use the reviewed accounting shape before attributing every extra to a
  specific fallback rather than a retry/repair;
- `fallbackAttemptRate`: the extra-attempt rate divided by known logical
  actions; it is not a free-text reason classifier;
- `physicalAttemptsPerLogicalAction`: known-group physical attempts divided by
  known logical actions.

Unknown legacy rows remain visible in the physical total but do not inflate the
known logical count or fallback rate. A report must show the unknown-row count
instead of fabricating a grouping.

Examples:

| Input | Logical | Physical | Fallback rate |
| --- | ---: | ---: | ---: |
| one success row, count 1 | 1 | 1 | 0 |
| linked primary/fallback rows, each count 1 | 1 | 2 | 1.0 |
| one logical row, count 2 | 1 | 2 | 1.0 |
| two independent success rows | 2 | 2 | 0 |
| one old row without lineage | 0 known | 1 | unknown |

Raw Ledger row count must not be reported as business API-call count.

## 7. Cost interpretation

Cost, quota, and Provider rate-limit accounting use physical attempts and actual
Provider usage when available. Product/business volume uses logical actions.
For example, 100 logical extractions and 130 physical attempts means 100
business extraction actions with 30 additional attempts; it must not be called
130 memory extractions.

## 8. Latency interpretation

Reports keep three measurements separate:

1. logical extraction wall-clock duration;
2. individual Provider attempt duration (including failed attempts);
3. local Canary filtering duration.

The approximately 21.1s and 8.5s J/K observations include existing Provider
fallback work. They are not Canary filtering latency. This fix does not alter
timeouts, retry order, fallback conditions, Prompt, model resolution, or
Provider transport.

## 9. Fallback-rate interpretation and debt

The linked rows make `fallbackAttemptRate` and
`physicalAttemptsPerLogicalAction` computable for new evidence. Repeated
primary failure followed by active-model fallback can add latency, Provider
cost, and rate-limit consumption. It remains tracked as medium/high operational
debt and should be addressed before Admission cutover or authoritative tiny
cohort decisions. The fallback policy itself is deliberately unchanged here.

## 10. Tests

`scripts/memoryExtractionLogicalAccounting.test.ts` covers:

1. normal extraction success: logical 1, physical 1;
2. primary failure plus fallback success: logical 1, physical 2;
3. primary failure plus fallback failure: logical 1, physical 2;
4. no fallback: logical 1;
5. two independent extractions: logical 2 and no accidental merge;
6. legacy rows without lineage: unknown grouping, no fabricated pair;
7. `providerRequestCount` remains physical-attempt semantics;
8. request body excludes the transient lineage field and model selection remains
   unchanged.

The existing AI accounting, fallback-contract, Ledger persistence, and full
test suites remain in place and were not weakened. Existing chat retry and
backend-to-browser fallback tests continue to assert their prior semantics.

## 11. Production behavior invariants

The change does not alter the number, order, or conditions of Provider requests.
Primary failure plus fallback still performs two physical attempts. It does not
change Prompt text/order, token payload, model resolution, retry/fallback
policy, error handling, user-visible delivery, or storage/business records.

## 12. Admission invariants

Accepted claims, Bridge classification, Safety-veto validator, Canary filtering,
writer, Summary, Projection, cursor, MemoryItem, Event, RelationshipState, and
Scene behavior are untouched. The Canary remains developer/local-only, default
OFF, and limited to `SAFETY_VETO_CANCELLED_PLAN`. This lineage is accounting
metadata and cannot grant V2 authority.

The related evidence contract must preserve the runtime metadata gate
`v2_model_native` for a production-shaped suppression. A report may normalize
that value to the display category `model_native`, but `legacy_derived` and
`mixed` observations cannot contribute to the authoritative suppression count.

## 13. Rollback

Revert the implementation commit to remove `logicalActionId` generation and the
aggregation helper, then revert the test and documentation commits as desired.
Because the field is additive and no old rows are rewritten, rollback does not
require data migration or user-data repair. The original repository remains the
clean insurance copy at `f515f7408cfe19da145f15a8ddffceae06e608d`.

## 14. Readiness and next stage

When the full Stage 4D-11J checks pass, readiness is
`ACCOUNTING_LINEAGE_FIXED_VALIDATED`: new fallback pairs are authoritative,
old rows remain safely unknown, the evidence validity predicate is candidate
local, and Provider/Prompt/Memory authority behavior is unchanged.

This still does not authorize long evidence collection. The next separately
approved stage may run the bounded local long-window protocol from document 60,
using only post-fix evidence and explicit manual review. It remains distinct
from any Phase 2 cohort.
