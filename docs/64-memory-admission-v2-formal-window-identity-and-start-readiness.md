# Stage 4D-11M — Formal Evidence Window Identity & Start Readiness

## Scope and stop state

This document formalizes reviewer-safe identities and a dry start protocol for
the bounded local long-evidence collector. It does **not** start formal
collection, count samples toward the 5-session/10-suppression/3-scope/7-day or
20-batch minimums, change Canary authority, enter Phase 2, add persistence, or
alter Provider, Prompt, Memory, user data, or Ledger behavior.

The readiness state after synthetic verification is
`FORMAL_WINDOW_START_READY`. Collection itself remains `NOT_STARTED`; the next
separately approved stage is Stage 4D-11N — Bounded Local Long-Evidence
Collection — Window Day 1.

## Four authoritative units

| Unit | Authoritative key | What is exported |
| --- | --- | --- |
| formal window | `windowFingerprint` | deterministic opaque digest of a developer-held token |
| formal session | `sessionFingerprint` | digest of window token + per-session random nonce |
| extraction batch/logical action | `batchActionFingerprint` | window-salted digest of the explicit logical action ID |
| candidate suppression/control | `evidenceRecordFingerprint` | window/session/batch digest plus bounded candidate-local ordinal |

`sessionOrdinal` and `windowOrdinal` remain display/debug metadata only. They
are process-local counters, reset by reload/dev restart, and cannot be used for
authoritative counting or joining. A session with no authoritative record is
not counted.

## Token and privacy contract

The developer may call `createDirectChatMemoryLongEvidenceWindowToken()`. It
delegates to the existing governed `createId()` utility and does not introduce
a new random-ID algorithm. Manually supplied tokens must be high-entropy; the
collector rejects short or low-diversity values. The raw token is held only in
page memory while a window is active. It is never exported, persisted, sent to
Provider/Prompt/Memory/Ledger, copied into user data, or sent over the network.

Each `startWindow()`/`resumeWindow()` session creates a fresh nonce through the
existing governed action-ID helper. Only the deterministic
`sessionFingerprint` is exported. Raw nonce, application IDs, source IDs,
lineage IDs, candidate IDs, statements, messages, Prompt, responses, secrets,
Authorization, and raw Provider errors are absent from the artifact.

## Lifecycle and reload protocol

1. Enable the developer-only observer and clear old observer records.
2. `startWindow(windowToken)` starts the formal window and session A.
3. Record bounded metadata, then export A and end/finish the session.
4. Simulate reload (page-memory state is gone), re-enable, and
   `resumeWindow(windowToken)`.
5. Record session B and export B. The window fingerprint is unchanged and the
   session fingerprint is different.
6. Combine sanitized exports offline with `combineLongEvidenceExports()`.

The same session can be exported more than once; its fingerprint and records
remain stable. Repeated exports are deduplicated by evidence-record
fingerprint. A different developer token produces a different window identity
and is rejected when mixed into one review set.

## Pure combined review

`combineLongEvidenceExports(exports)` accepts JSON strings or parsed sanitized
exports. It validates schema/version, required identity fields, coarse UTC
`evidenceDay`, and privacy-safe shape. Malformed exports/records are excluded
and reported. More than one formal window is a `mixed_window` rejection.

For one window it deduplicates evidence-record fingerprints, then counts
distinct valid session, exact-scope, and batch fingerprints. Accounting groups
are reconciled from logical/physical counts and shape; conflicts are preserved
and excluded rather than resolved by first/last/max/min. Safety incidents are
preserved. Dry-run records have `windowFingerprint = null` and cannot enter
formal totals.

Formal time is deliberately coarse. `evidenceDay` is UTC `YYYY-MM-DD`.
`firstEvidenceDay` and `lastEvidenceDay` are the lexicographic minimum and
maximum valid dates. `calendarDaySpan` is the number of distinct UTC calendar
dates represented (a day without evidence does not count; repeated exports do
not add a day). This explicit definition is used for the future seven-day gate.

## Synthetic readiness evidence

The identity test proves:

- process-local ordinal reset/duplication does not merge authoritative sessions;
- same token gives one stable window fingerprint, different tokens differ;
- generated token output is governed/high-entropy and raw token is absent;
- same session exports share a fingerprint, resume/reload creates a new one;
- same batch shares a batch fingerprint while candidate A/B observations differ;
- repeated session/batch/suppression/control exports do not inflate counts;
- same scope across sessions is stable, a second scope increments, and mixed
  windows are rejected;
- malformed exports are reported; conflicts and safety incidents are retained;
- deterministic day fields are calculated; dry-run cannot enter formal counts;
- production default remains OFF.

These are synthetic/test fixtures only. No real long-window session, suppression,
scope, day, or batch is claimed, and no production cutover is authorized.

## Invariants and rollback

Provider selection, fallback/retry behavior, Prompt text/order, context,
Memory authority, storage schema, user data, and API accounting are unchanged.
The collector remains in-memory, developer/local-only, and observation-only.
Rollback is a single-purpose revert of the Stage 4D-11M commits; removing the
identity helper, combiner, tests, and docs removes diagnostics only and cannot
delete chat or Memory data.

## Readiness and next stage

Readiness may be reported only as one of:

- `FORMAL_WINDOW_IDENTITY_BLOCKED` — required identity/lifecycle contract is incomplete;
- `FORMAL_WINDOW_IDENTITY_SAFETY_FAILURE` — privacy, mixed-window, dedup, or
  production-invariant check failed;
- `FORMAL_WINDOW_START_READY` — identity, dedup, malformed/conflict handling,
  time calculation, privacy, dry resume/combine protocol, tests, lint/build,
  dependency gate, and no-production-delta checks pass.

The next recommendation is Stage 4D-11N, Window Day 1 only. Do not begin it
without separate approval and a freshly generated developer-held token.
