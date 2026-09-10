# Memory Admission V2 — Sanitized Evidence Artifact Protocol

## 1. Purpose and scope

Stage 4D-11O-R1 makes long-evidence review recoverable without changing the
application's Provider, Prompt, Memory, writer, retry, fallback, or storage
behavior. It defines a small, offline protocol for saving and reviewing the
collector's exact sanitized export. It does not create telemetry infrastructure
or authorize Phase 2.

## 2. Why 11O was insufficient

The 11O continuation produced a valid in-memory control observation, but its
serialized export existed only in the browser page. The page closed before the
payload was saved, so the cumulative R2-plus-11O review could not be reproduced
from a file. The run is safe but not durably reviewable.

## 3. Lost exports and non-authoritative summaries

The R2 payload is `R2_EXPORT_UNRECOVERABLE`; the 11O payload is
`11O_EXPORT_UNRECOVERABLE`. Their Markdown summaries are historical checkpoint
notes, not records. Summary counters must never be hand-added to an artifact,
passed to `combineLongEvidenceExports()`, or used for promotion.

## 4. Artifact definition

An artifact is the exact string returned by the dev-only collector
`exportJson()`, written unchanged as UTF-8 JSON. It has the collector schema
version and a non-empty `records` array whose members are the complete sanitized
metadata records. The artifact contains reviewer fingerprints and bounded
codes/counts only; it contains no raw identity, content, credential, or token.

## 5. Location and filename

For a recoverable formal run, use a repository-local evidence directory such as:

`docs/evidence/memory-admission-v2/<windowFingerprint>/<UTC-day>__<sessionFingerprint>.json`

The recommended 11O filename would have been
`docs/evidence/memory-admission-v2/window-8817672802574c9a/2026-09-10__session-803588fc45247e6e.json`,
but it is intentionally absent because the export was not recoverable. Do not
create empty or reconstructed placeholders.

## 6. Exact saving rule

Immediately after a bounded run, save the exact `exportJson()` string before
closing or navigating the page. Do not copy a summary, reserialize a hand-built
object, or edit the payload. The raw developer window token remains only in the
developer's live session and is never saved.

## 7. Read-back and machine review

Read the saved file back from disk and invoke
`scripts/reviewMemoryAdmissionLongEvidence.ts`. The script uses the production
`combineLongEvidenceExports()` combiner and reports schema/status, window and
mixed-window state, malformed export/record counts, raw and deduplicated record
counts, formal sessions/scopes/batches, valid controls/suppressions,
fail-open/invalid/safety counts, logical/physical accounting, conflicts,
unknown groupings, and first/last evidence days.

## 8. Privacy boundary

The reviewer rejects raw logical/action/window/session identifiers, character,
relation, identity, user, conversation, candidate, source, or lineage IDs;
prompt, message, statement, response, error content; Authorization, API keys,
secrets, tokens, and bearer/sk-like values. A privacy rejection is not silently
converted into an empty successful review.

## 9. Malformed and mixed inputs

Wrong schema, invalid JSON, summary-only input, empty-record artifacts, or
privacy violations are rejected and counted as malformed/rejected. Individual
records that fail the collector's sanitized shape are excluded and counted.
Exports from more than one window return `mixed_window` and are not a valid
single-window promotion input. Duplicate records are deduplicated by their
evidence fingerprint; conflicting duplicate accounting remains visible.

## 10. Authoritative counting

Only complete, machine-reviewed records in a valid artifact are authoritative.
Formal counts include only `evidenceMode=formal_window` records with a window
fingerprint. Dry-run records may exercise the protocol but do not increase
formal sessions, scopes, batches, suppression, control, day, or accounting
promotion totals.

## 11. Evidence-day and promotion rules

`firstEvidenceDay`, `lastEvidenceDay`, and the day span are computed from
deduplicated formal records, not elapsed wall-clock time or summaries. Missing
days do not count as evidence. A protocol-valid artifact is not itself a
healthy-window or Phase 2 approval; the existing safety, coverage, and duration
thresholds still apply.

## 12. Persist-first sequence

The required order is: run one bounded action; obtain exact export; persist the
file; read it back; run the machine review; run privacy/malformed checks; write
the checkpoint; then disable collector and Canary. If persistence fails, stop
and classify the export as unrecoverable rather than continuing collection.

## 13. Continuity and recovery

The same developer-held window token may resume a window only when the exact
prior artifacts are already durable. A missing prior file is a recovery block;
do not reconstruct it from a Markdown summary and do not create a new window to
hide the gap. R1 intentionally performs no new formal activity.

## 14. Tests

`reviewMemoryAdmissionLongEvidence.test.ts` covers complete shape, duplicate
deduplication, conflicting accounting, mixed windows, malformed JSON/schema,
summary-only and empty artifacts, malformed records, privacy keys/values,
dry-run exclusion, safety incidents, unknown grouping, and evidence-day span.
The collector's existing runtime tests remain the source of truth for runtime
behavior; the reviewer is offline and has no network, storage, or Provider
side effects.

## 15. Runtime and user-data safety

The protocol adds no production writes, no database or IndexedDB migration, no
background runtime, and no user-data mutation. It cannot make an AI request
fail because it runs after export as best-effort review tooling.

## 16. Accounting interpretation

One sanitized record represents one observation of a logical AI request. The
record's `providerLogicalRequestCount` and `providerPhysicalAttemptCount` retain
the existing logical-versus-attempt contract; deduplication prevents repeated
exports from inflating totals. This protocol does not add attempt-level logs.

## 17. Readiness states

If a required exact export is missing, use `EVIDENCE_ARTIFACT_RECOVERY_BLOCKED`
(or the explicit unrecoverable labels above). If privacy or shape checks fail,
use `EVIDENCE_ARTIFACT_SAFETY_FAILURE`. Once this protocol and its tests pass,
`EVIDENCE_ARTIFACT_PROTOCOL_VALIDATED` may be recorded even while retained
formal evidence counts are zero. None of these states authorizes positive V2
authority or Phase 2.

## 18. Token and Git policy

Raw window tokens must not appear in artifacts, docs, logs, commits, browser
exports, or bug reports. Only reviewer fingerprints may be retained. Evidence
files are review inputs and must be handled as sanitized metadata; never add a
secret-bearing file to Git.

## 19. Next recommendation

Keep the collector and Canary disabled. After a separately approved run, repeat
the bounded local evidence flow using persist-first saving and this reviewer,
then combine only the durable full artifacts. Do not enter Phase 2 or implement
positive V2 authority until the required real coverage and safety review are
complete.
