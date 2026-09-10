# Stage 4D-11L — Long-Evidence Collector Accounting & Scope Integrity

## 1. Scope

This stage hardens the Stage 4D-11K developer/local observer before any formal
long-window run. It does not start a 7-day/20-batch collection, enter Phase 2,
change Canary authority, or alter production memory behavior.

## 2. Wiring audit

The 11K collector is currently a standalone observer: the real extraction hook
does not call `recordDirectChatMemoryLongEvidence()` yet. Therefore no live
batch currently produces duplicate collector rows. The audit identified the
latent issue in the collector contract: if a future caller records one row per
candidate, the old summary would add the same extraction accounting once per
candidate. The new API makes the caller pass the raw logical action ID only for
in-memory fingerprinting and requires summary aggregation by that fingerprint.

## 3. Four counting units

The collector keeps these units separate:

| Unit | Definition | Deduplication |
| --- | --- | --- |
| session | one explicit `enable()` cycle | distinct `sessionOrdinal` |
| scope | one exact character/relation/identity/conversation tuple | stable window-local `scopeFingerprint` |
| batch/logical action | one extraction operation | `logicalActionFingerprint`/`batchActionFingerprint` |
| suppression/control | one candidate outcome | candidate records; no accounting dedup |

Thus one batch with three candidates is one logical action/batch but can be
three suppression or control observations when each candidate is independently
valid.

## 4. Accounting deduplication

`getDirectChatMemoryLongEvidenceSummary()` now considers only valid formal-window
records for authoritative totals. It groups by the sanitized action
fingerprint, counts each group once, and uses the group's actual physical
attempt count. A normal action is logical 1/physical 1; a linked fallback shape
is logical 1/physical 2. Candidate record multiplicity cannot inflate either
total or the extraction-batch count.

## 5. Logical action fingerprint

An explicit `logicalActionId` is combined with the active window token (or the
session salt for dry-run) and a non-reversible digest. Only
`action-<opaque token>` is retained/exported. Same action records share the
token; different action IDs do not merge. Missing IDs produce `unknown` and are
not promoted into authoritative accounting.

## 6. Accounting conflict handling

For one action fingerprint, a disagreement in logical count, physical attempt
count, or `accountingShape` marks that action as `accountingConflictCount` and
excludes it from logical totals, physical totals, batch totals, and promotion
scope counts. The collector does not choose first/last/max/min and does not
repair the underlying Ledger.

## 7. Unknown legacy rows

Ledger rows without explicit `logicalActionId` remain
`logical_grouping_unknown`. They are not merged by timestamp, model, scope,
array adjacency, or reason text. Formal authoritative totals start only from
post-11J linked rows and known action fingerprints.

## 8. Formal window identity choice

The minimal safe choice is Option A from the 11L approval: an explicit manual
window token held by the developer. `startDirectChatMemoryLongEvidenceWindow`
and `resumeDirectChatMemoryLongEvidenceWindow` accept that token, derive stable
scope/action fingerprints, and never export or persist the token. A new token
creates a new window identity. No 500-record evidence store or localStorage
analytics database is introduced.

## 9. Window lifecycle

The lifecycle is:

1. `enable()` — begin an in-memory collector session;
2. `startWindow(token)` — clear old observations and start formal window ordinal;
3. record/readback/export — collect only while enabled and the window is active;
4. `resumeWindow(token)` — re-enter the same token for another session;
5. `finishWindow()` — close formal collection while retaining explicit export data;
6. `clearWindow()` — destroy window identity and observations only.

Reload destroys in-memory state. Resuming after reload requires the developer to
re-enter the same token. Neither the token nor window ordinal is an application
or production identifier.

## 10. Session semantics

Every explicit enable cycle has one new `sessionOrdinal`. Re-enabling inside an
active formal window starts another session but preserves that window's records
so the same scope/action can be recognized across sessions. A dry-run enable
without an active window starts an isolated session and has no formal
`windowOrdinal`.

## 11. Batch semantics

The batch fingerprint reuses the logical action identity in this direct memory
extraction collector. Multiple candidate records from one extraction therefore
contribute one `extractionBatchCount`. A future caller must supply the same
logical ID for every candidate from that extraction.

## 12. Suppression semantics

`validSuppressionCount` remains candidate-level. Two independent cancelled-plan
candidates in one batch can contribute two valid suppressions, while their
shared action contributes only one logical action and one physical accounting
shape. Partial and all-veto records remain valid under the 11K classifier.

## 13. Control semantics

`validControlCount` is also candidate-level. Multiple normal controls in one
batch may be recorded, but the action/batch and Provider accounting are still
deduplicated once. Controls do not need to be preference samples.

## 14. Scope stability

Formal `scopeFingerprint` uses the exact four-part scope tuple and the
window-local token. Same scope across sessions in one window is stable; a
different scope in that window is distinct. Dry-run scope tokens use only a
session salt and are never mixed into formal counts.

## 15. Cross-window unlinkability

Different manually supplied window tokens produce different scope/action
fingerprints for the same raw scope/action. The token itself is not exported,
so exports from different windows cannot be joined by the collector. Reusing a
token intentionally resumes the same window and is the developer's explicit
choice.

## 16. Distinct scope counting

`distinctExactScopeCount` is computed from distinct stable scope fingerprints
on authoritative formal records only: `exactScope=true`,
`privacyStatus=metadata_only`, valid classification, and no accounting
conflict. Unknown, invalid, safety-incident, and conflicting records do not
count as scopes.

## 17. Session counting

`sessionCount` counts distinct session ordinals in retained observations;
`formalSessionCount` counts those represented in the active/former formal
window. Ten candidate records from one session therefore count as one session.

## 18. Summary contract

The summary now exposes record/classification counts plus:

`sessionCount`, `formalSessionCount`, `formalWindowRecordCount`,
`distinctExactScopeCount`, `extractionBatchCount`,
`validSuppressionCount`, `validControlCount`, `failOpenCount`,
`invalidSampleCount`, `safetyIncidentCount`, `logicalActionTotal`,
`physicalAttemptTotal`, `accountingConflictCount`, and
`unknownGroupingCount`.

`countsByClassification` remains an observation view of all retained records.
Formal counts deliberately exclude dry-run records, and an action with an
accounting conflict is excluded from authoritative totals rather than hidden.

## 19. Privacy

Exports contain only opaque window/session/action/scope tokens, enums, booleans,
bounded counts, and coarse buckets. They never contain window salt/token,
logicalActionId, scope IDs, lineage IDs, source IDs, statements, text, Prompt,
responses, secrets, or raw errors.

## 20. Production invariants

This hardening changes no Provider selection, fallback/retry policy, Prompt,
token payload, accepted claims, filtered claims, Canary validator/reason,
writer, Summary, Projection, cursor, MemoryItem, Event, RelationshipState,
Scene, or production Memory authority. The collector remains observation-only.

## 21. Failure behavior

Malformed input is caught and returns `null`. Conflict and safety records are
retained as bounded audit observations but never repaired or used to grant
authority. Clearing window identity affects collector memory only.

## 22. Dry-run result

The synthetic validation covers one cancelled-plan suppression and one normal
control, then exercises repeated candidate records for one fallback action,
cross-session same-window scope stability, a second scope, an accounting
conflict, unknown grouping, and a different window token. It does not call a
Provider or touch canonical memory.

## 23. Formal collection status

No formal window has started. There are zero completed long-evidence sessions,
suppressions, scopes, days, or batches. Dry-run records have no formal window
ordinal and cannot satisfy the 11M minimum.

## 24. Tests

The collector test covers one/many candidates per action, fallback physical
attempts, two independent actions, action deduplication, conflict exclusion,
unknown legacy rows, session/batch/suppression/control units, same/different
scopes and windows, token privacy, dry-run exclusion, clear isolation, and
production default OFF. The full suite remains 584/584.

## 25. Readiness

The final 11L state is `LONG_EVIDENCE_COLLECTOR_INTEGRITY_VALIDATED` after
targeted and full verification. This validates accounting and scope integrity;
it does not validate a long evidence window and does not authorize Phase 2.

## 26. Next stage

Only a separately approved Stage 4D-11M may begin bounded local long-evidence
collection. It must create a fresh explicit window token, preserve the existing
cancelled-plan-only Canary reason, export manually, and stop on any zero-error
invariant breach.

