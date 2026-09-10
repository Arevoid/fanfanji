# Stage 4D-11K — Long-Evidence Collector Implementation

## 1. Purpose

Stage 4D-11K adds a developer/local-only observer for the future Memory
Admission V2 evidence window. It records bounded, reviewer-safe metadata about
an already completed extraction and its canonical readback. It does not make a
suppression decision, write memory, or change any existing runtime behavior.

## 2. Design-state reconciliation

The historical Stage 4D-11I accounting state `LONG_EVIDENCE_ACCOUNTING_UNCLEAR`
is preserved in [the design record](60-memory-admission-v2-long-evidence-and-ledger-accounting-design.md)
but is superseded for new rows by Stage 4D-11J. New memory-extraction rows have
an explicit `logicalActionId`; linked fallback rows can be counted as one
logical action and their physical attempts can be summed. Older rows without
that field remain `logical_grouping_unknown` and are never guessed into a
group. Current accounting readiness is `ACCOUNTING_LINEAGE_FIXED_VALIDATED`;
design readiness is `LONG_EVIDENCE_DESIGN_READY`; formal collection is
`NOT_STARTED`.

## 3. Collector architecture

`src/features/chat/services/directChatMemoryLongEvidenceCollector.ts` is a
small feature service with no authority, persistence, transport, Provider,
Prompt, writer, cursor, Summary, Projection, or UI imports. The data flow is:

```text
existing extraction and exact-scope canonical readback
  -> recordDirectChatMemoryLongEvidence(input)
  -> bounded in-memory sanitized record
  -> explicit exportJson() / summary()
```

The caller supplies the final readback booleans and deltas. The collector never
re-reads or writes canonical state, and it cannot alter `acceptedClaims` or
`filteredAcceptedClaims`.

## 4. Activation

Collection is off by default. A Vite development build installs the optional
`globalThis.__fanfanjiMemoryAdmissionLongEvidence` API with `enable`, `disable`,
`clear`, `count`, `exportJson`, and `summary`. The API is not installed in a
production bundle. The exported configuration function accepts `explicitDebug`
only for the Node test environment, so a production caller cannot turn on the
collector through the test seam.

An enable call always starts a fresh evidence session. Disable ends collection
but leaves the current in-memory records available for an explicit export;
clear removes only those records. Reload naturally loses the in-memory session.

## 5. Candidate/batch schema

The record is strongly typed and keeps candidate-local fields separate from
batch-level outcomes. Candidate fields include feature scope, the approved
Canary reason, validator/Bridge enums, lineage and provenance gates, semantic
kind, lifecycle, legacy eligibility, suppression, canonical absence, and
fail-open state. Batch fields include accepted-before/after counts, zero
candidates, expected/observed surviving writes, cursor progress, canonical
write delta, Summary delta, Projection delta, and readback safety flags.

The additional readback flags (`vetoedCandidateSummaryPresent`,
`vetoedCandidateProjectionPresent`, `v2OnlyWrite`, `cursorLoop`, `replayLoop`,
and `blockingMaterialUserRegression`) are booleans only. They make zero-error
invariants explicit without exporting statements or IDs.

## 6. Classification

`classifyLongEvidenceRecord(record)` is pure and side-effect-free. It returns:

* `VALID_ELIGIBLE_SUPPRESSION` — every cancelled-plan gate is exact and the
  candidate-local suppression is reconciled with a valid partial or all-veto
  batch;
* `VALID_CONTROL` — a normal legacy durable write with no suppression or V2-only
  write, exact scope, normal readback and cursor progress;
* `FAIL_OPEN_OBSERVATION` — an incomplete/exception path marked fail-open that
  left the legacy result untouched;
* `INVALID_SAMPLE` — malformed, ambiguous, legacy-derived/mixed, or incomplete
  evidence that cannot count; or
* `SAFETY_INCIDENT` — any zero-error invariant breach.

The collector records incidents but never repairs data or disables the Canary.

## 7. Canonical readback

The collector input is expected only after the caller has performed an
exact-scope, read-only canonical readback. A vetoed candidate is represented by
`vetoedCandidateCanonicalAbsent`; surviving candidates are represented by the
expected/observed surviving-write pair. Summary and Projection are represented
only by bounded deltas and the two vetoed-presence booleans. Raw statements are
never accepted into the record or export.

## 8. Scope fingerprint

The four-part exact scope tuple is combined with a session-local salt and a
non-reversible FNV-style digest. Only `scope-<opaque token>` is exported. The
same tuple is stable during one evidence session, while a changed tuple or a
new session produces a different token. Character, relation, user identity and
conversation IDs never appear in a record.

## 9. Session ordinal

`sessionOrdinal` is a process-local monotonic ordinal created by an explicit
collector enable cycle. It is not an account/session identifier and is never
persisted. Disable, reload, or a subsequent enable starts a new evidence
boundary; clearing records does not pretend that a new account session began.

## 10. Logical accounting integration

`deriveLongEvidenceAccounting()` delegates to the Stage 4D-11J
`aggregateAiRequestLedgerAccounting()` helper. A single explicit logical ID in
one row is `single_row` (logical 1, physical 1). Multiple rows sharing that
explicit ID are `fallback_split_rows` (for example logical 1, physical 2).
Rows without an ID, or mixtures that cannot be authoritative, are `unknown`.
No timestamp, model, row position, or reason-text heuristic is used.

## 11. Controls

Controls are normal legacy durable writes, not necessarily preference samples.
They require exact scope, trusted provenance, a positive canonical write delta,
normal Summary/Projection readback, cursor progress, and no suppression or
V2-only write. A future collection session should include a control alongside
suppression evidence where safe.

## 12. Safety incidents

The classifier marks `SAFETY_INCIDENT` for privacy violations, Prompt or Canary
Provider deltas, wrong/cross-scope suppression, a present vetoed canonical or
Summary/Projection result, V2-only or legacy-rejected writes, cursor/replay
loops, or a material/blocking regression. The thresholds remain zero. An
incident is retained as metadata for audit; no automatic repair or authority
change is attempted.

## 13. Privacy

The record contains only allowlisted enums, booleans, bounded counts, opaque
fingerprints, a coarse UTC hour bucket, and latency buckets. Validator/Bridge
codes are normalized to allowlists and unknown values become `unknown`. The
export cannot contain Prompt, response, transcript, statement, raw lineage,
source references, API keys, Authorization, stack traces, or raw Provider
errors.

## 14. Memory bounds

Each enabled session uses an in-memory latest-record ring buffer capped at 100
records. There is no localStorage, IndexedDB, cross-tab merge, durable
cross-session store, or cloud/network path. The bounded policy prevents an
observation tool from growing with chat volume.

## 15. Export

`exportJson()` returns a sanitized object containing `schemaVersion`,
`persistenceMode: "in_memory_only"`, enabled/session ordinal, record count,
classification counts, logical-action total, physical-attempt total, unknown
grouping count, and the bounded records. `summary()` returns the same aggregate
metadata without records. Export is explicit and manual; the collector does
not upload or auto-sync anything.

## 16. Tests

`scripts/memoryAdmissionLongEvidenceCollector.test.ts` covers default-off and
test-only activation, fresh sessions, clear and the 100-record cap, stable and
distinct scope fingerprints, privacy sanitization, all-veto and partial
suppression, controls, fail-open/invalid/incident states, the
`v2_model_native` gate, linked fallback and normal accounting, unknown legacy
rows, no Provider/Prompt invocation, input immutability, and export summaries.

## 17. Dry-run

The implementation test performs a short synthetic dry-run with exactly two
logical-shaped samples: one cancelled-plan suppression and one normal control.
The test also exercises the partial/all-veto classifier branches, but these are
not real application extraction operations. No Provider is called and no
canonical state is written.

## 18. Formal collection exclusion

The dry-run records are explicitly excluded from the future long-window
minimums. This stage does not claim five sessions, ten valid suppressions, three
scopes, seven days, or twenty batches. A separately approved Stage 4D-11L may
start bounded local collection; it must begin a new evidence session and use
new manual exports.

## 19. Rollback

Rollback is the single-purpose commit
`feat: add local memory admission evidence collector` plus its test and document
commits. Removing the module/API removes only developer diagnostics; it does not
delete chat, memory, Ledger, or any user data. The collector has no durable
artifact to migrate or clean up.

## 20. Readiness

After docs reconciliation, implementation, tests, and full verification, the
collector state is `LONG_EVIDENCE_COLLECTOR_DRY_RUN_VALIDATED`. This means the
collector contract and dry-run are validated—not that the long evidence window
is complete. Accounting remains `ACCOUNTING_LINEAGE_FIXED_VALIDATED`, design
readiness remains `LONG_EVIDENCE_DESIGN_READY`, and collection remains
`NOT_STARTED`.

## 21. Next recommendation

Stop after this stage. Seek explicit approval for Stage 4D-11L — Bounded Local
Long-Evidence Collection Start. That stage may use only developer/local manual
exports and the existing cancelled-plan observation; it must not enable positive
V2 authority, broaden Canary reasons, enter Phase 2, persist a durable evidence
store, or upload telemetry.

