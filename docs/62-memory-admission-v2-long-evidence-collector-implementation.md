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
`clear`, `count`, `exportJson`, `summary`, and the governed `createWindowToken`
helper. The API is not installed in a
production bundle. The exported configuration function accepts `explicitDebug`
only for the Node test environment, so a production caller cannot turn on the
collector through the test seam.

An enable call always starts a fresh evidence session. `startWindow(token)` and
`resumeWindow(token)` accept an explicit high-entropy developer-held window
token; `createWindowToken()` delegates to the governed project ID utility. The
token is never exported or persisted. A formal window supplies the stable salt
for cross-session scope/action fingerprints. Without an active window, records
are dry-run observations. Disable ends collection but leaves records available
for an explicit export; clear removes only records. Reload loses records and
the active window, so resuming requires re-entering the same local token.

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

For formal collection, the four-part exact scope tuple is combined with a
window-local manual token and a bounded non-reversible digest. Only
`scope-<opaque token>` is exported. The same tuple is stable across sessions in
one window, while a changed tuple or a new window token produces a different
token. Dry-run records use only a session-local salt and are never formal
window evidence. Character, relation, user identity and conversation IDs never
appear in a record.

## 9. Session ordinal

`sessionOrdinal` is a process-local monotonic ordinal created by an explicit
collector enable cycle. Reload/dev restart can reset it, so it is display/debug
metadata only and is never used for authoritative session counts. Each session
gets a fresh nonce and reviewer-safe `sessionFingerprint`; repeated exports of
that session retain the same fingerprint, while a resumed session gets a new
one. A window has its own display ordinal and authoritative `windowFingerprint`.
The lifecycle is start/create, resume with the same manually held token, session
start/end, explicit export, finish, and clear/destroy. Clearing window identity
removes only collector state; it never touches chat, Memory, Ledger, Canary, or
character data.

## 10. Logical accounting integration

`deriveLongEvidenceAccounting()` delegates to the Stage 4D-11J
`aggregateAiRequestLedgerAccounting()` helper. Each evidence record also
stores only a salted `logicalActionFingerprint`/`batchActionFingerprint`.
Multiple candidate records sharing one explicit action fingerprint are grouped
once: a single row is `single_row` (logical 1, physical 1), while linked
fallback rows are `fallback_split_rows` (logical 1, physical 2). If repeated
records for one action disagree on logical count, physical count, or shape, the
action is marked `accounting_conflict` in summary and excluded rather than
resolved by max/min/last-wins. Rows without an ID or with unknown shape remain
unknown. No timestamp, model, row position, scope, or reason-text heuristic is
used.

Each candidate observation also has an opaque `evidenceRecordFingerprint`,
derived from the window/session identities, batch fingerprint, and a bounded
candidate-local ordinal. `combineLongEvidenceExports()` deduplicates this key
before counting suppressions/controls, sessions, scopes, and batches. It
requires one `windowFingerprint`; mixed-window exports are rejected. Duplicate
ordinals never merge sessions because `sessionFingerprint`, not ordinal, is
authoritative.

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
fingerprints, a coarse UTC hour bucket, a coarse UTC `evidenceDay`, and latency buckets. Validator/Bridge
codes are normalized to allowlists and unknown values become `unknown`. The
export cannot contain Prompt, response, transcript, statement, raw lineage,
source references, API keys, Authorization, stack traces, or raw Provider
errors.

## 14. Memory bounds

Each enabled session uses an in-memory latest-record ring buffer capped at 100
records. There is no localStorage, IndexedDB, cross-tab merge, durable
cross-session store, or cloud/network path. The window token is the only
window identity material and lives in memory/caller state; it is not persisted.
The bounded policy prevents an observation tool from growing with chat volume.

## 15. Export

`exportJson()` returns a sanitized object containing `schemaVersion`,
`persistenceMode: "in_memory_only"`, window/session ordinals, window state,
record count, classification counts, session count, distinct exact-scope count,
extraction-batch count, candidate-level suppression/control counts, logical and
physical totals, accounting-conflict count, unknown-grouping count, and the
bounded records. Formal aggregate counts exclude dry-run records; observation
classification counts remain visible for audit. `summary()` returns the same
metadata without records. Export is explicit and manual; the collector does
not upload or auto-sync anything.

## 16. Tests

`scripts/memoryAdmissionLongEvidenceCollector.test.ts` covers default-off and
test-only activation, fresh sessions, clear and the 100-record cap, stable and
distinct scope fingerprints, privacy sanitization, all-veto and partial
suppression, controls, fail-open/invalid/incident states, the
`v2_model_native` gate, linked fallback and normal accounting, unknown legacy
rows, no Provider/Prompt invocation, input immutability, and export summaries.
`scripts/memoryAdmissionFormalWindowIdentity.test.ts` covers stable window and
session identities, reload/resume, duplicate ordinals, observation fingerprints,
multi-export deduplication, mixed-window rejection, malformed exports,
accounting conflicts, safety incidents, deterministic day calculation, privacy,
and dry-run exclusion.

## 17. Dry-run

The implementation test performs a short synthetic dry-run with exactly two
logical-shaped samples: one cancelled-plan suppression and one normal control.
It then starts a separate explicit test window to verify repeated candidate
records, linked accounting, cross-session scope stability, conflict handling,
and a second scope. The test also exercises partial/all-veto branches, but
none are real application extraction operations. No Provider is called and no
canonical state is written.

## 18. Formal collection exclusion

Dry-run records have no formal `windowFingerprint` and are explicitly excluded from
the future long-window minimums. This stage does not claim five sessions, ten
valid suppressions, three scopes, seven days, or twenty batches. A separately
approved Stage 4D-11M may start bounded local collection; it must start a new
explicit window token and use new manual exports.

## 19. Rollback

Rollback is the single-purpose commit
`feat: add local memory admission evidence collector` plus its test and document
commits. Removing the module/API removes only developer diagnostics; it does not
delete chat, memory, Ledger, or any user data. The collector has no durable
artifact to migrate or clean up.

## 20. Readiness

After the 11L accounting/scope integrity checks and full verification, the
collector state is `LONG_EVIDENCE_COLLECTOR_INTEGRITY_VALIDATED`. This means
the collector contract and dry-run accounting are validated—not that the long
evidence window is complete. Accounting remains
`ACCOUNTING_LINEAGE_FIXED_VALIDATED`, design readiness remains
`LONG_EVIDENCE_DESIGN_READY`, and collection remains `NOT_STARTED`.

## 21. Next recommendation

Stop after this stage. Seek explicit approval for Stage 4D-11M — Bounded Local
Long-Evidence Collection Start. That stage may use only developer/local manual
exports and the existing cancelled-plan observation; it must not enable positive
V2 authority, broaden Canary reasons, enter Phase 2, persist a durable evidence
store, or upload telemetry.
