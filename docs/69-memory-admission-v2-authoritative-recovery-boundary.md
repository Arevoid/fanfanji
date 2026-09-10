# Memory Admission V2 — Authoritative Recovery Boundary

## 1. Boundary fact

Stage 4D-11O-R2 establishes a recovery boundary for window
`window-8817672802574c9a`. The R2 Day 1 and 11O continuation full sanitized
exports are unavailable and are permanently classified
`historical_non_authoritative` (`R2_EXPORT_UNRECOVERABLE` and
`11O_EXPORT_UNRECOVERABLE`).

## 2. Why lost evidence cannot be rebuilt

Markdown summaries, Ledger rows, fingerprints, and remembered counters do not
contain the exact complete record payload. Reconstructing a record would make
the cumulative review non-reproducible, so no reconstructed LongEvidenceRecord,
Ledger-derived record, or hand-authored authoritative JSON is permitted.

## 3. Window identity versus evidence authority

The window fingerprint identifies the same review campaign. It does not grant
authority to every runtime observation. Promotion authority belongs only to a
full sanitized export that is durably persisted, read back, privacy-checked,
and machine-reviewed.

## 4. Recovery-boundary definition

`recoveryBoundaryEstablished=true` means that all pre-boundary observations
without durable full artifacts are excluded forever. The machine-readable
declaration is
`docs/evidence/memory-admission-v2/window-8817672802574c9a/recovery-boundary.json`.

## 5. Excluded historical observations

R2 Day 1 and the 11O Day 1 continuation remain documented for audit context,
but cannot increase formal sessions, exact scopes, batches, suppressions,
controls, logical/physical accounting, or evidence-day totals.

## 6. Authoritative baseline reset

The retained baseline at the boundary is:

```text
retainedAuthoritativeExports = 0
formalSessionCount = 0
distinctExactScopeCount = 0
extractionBatchCount = 0
validSuppressionCount = 0
validControlCount = 0
logicalActionTotal = 0
physicalAttemptTotal = 0
firstEvidenceDay = null
lastEvidenceDay = null
distinctEvidenceDayCount = 0
```

This is a promotion-counter reset, not deletion of historical documentation or
rollback of the runtime window.

## 7. Evidence-day reset

The historical `2026-09-10` summaries do not count as evidence days. The first
future full artifact that passes review supplies the new `firstEvidenceDay`;
missing calendar dates do not count.

## 8. Promotion-counter reset

Future coverage starts at `sessions 0/5`, `scopes 0/3`, `batches 0/20`,
`suppressions 0/10`, and `days 0/7`. No historical summary is carried forward.

## 9. Same-window continuation conditions

Recovery continuation may use the existing window only after all of the
following are true: excluded observations are documented; counters are reset;
the boundary exists; reviewer input is full artifacts only; persist-first is
confirmed; exclusions are permanent; the same raw developer-held token is
available; and the window fingerprint is unchanged.

## 10. Raw-token continuity

The token remains developer-held only. It is never written to this manifest,
an evidence artifact, docs, logs, Git, or a test snapshot. If the token is lost,
continuation is blocked rather than replaced with a new token/window.

## 11. Persist-first hard gate

The next session must run in this order: resume existing window; create a new
session; perform one bounded extraction; obtain exact `exportJson()`; write the
exact string immediately; read the same file; run the reviewer; pass privacy,
schema, malformed, and mixed-window checks; then mark the session authoritative,
checkpoint, and disable collector/Canary. Any write/read/review failure excludes
that session from authority.

## 12. Browser memory is not evidence storage

Collector memory is a temporary runtime buffer. The sole promotion-authoritative
source is a durable full sanitized export that passes the offline reviewer.

## 13. Artifact directory

The campaign directory is
`docs/evidence/memory-admission-v2/window-8817672802574c9a/`. It currently
contains only the recovery-boundary manifest, not a fake evidence JSON. Future
files must use the documented date/session filename and contain sanitized full
exports only.

## 14. Reviewer behavior

`reviewMemoryAdmissionLongEvidence.ts` accepts full export files and delegates
aggregation to `combineLongEvidenceExports()`. It does not read Markdown,
recovery manifests, Ledger storage, browser state, or network data. Manifests
and summaries cannot increase any count.

## 15. Tests

The reviewer tests cover zero retained evidence, historical/unrecoverable
summary exclusion, manifest non-evidence, future same-window acceptance,
mixed-window rejection, missing-artifact non-synthesis, future first day,
raw-token absence, privacy/schema checks, and unchanged runtime behavior through
the complete 587-test suite.

## 16. Readiness

This boundary is `RECOVERY_BOUNDARY_VALIDATED`: the contradiction in the prior
resume wording is removed, the baseline is explicit, token continuity is
confirmed without exposing the token, no new window was created, and the
persist-first hard gate is documented and tested. This does not claim healthy
long-window coverage or authorize Phase 2.

## 17. Next recommendation

Keep collector and Canary disabled. After separate approval, continue the same
window with the same developer-held token and a new bounded session. Persist the
exact export before any checkpoint; the first successfully reviewed future file
becomes authoritative retained evidence #1.

## 18. Post-recovery continuation result

The first continuation after this boundary completed on real UTC evidence day
`2026-09-10` without creating a replacement window. It resumed the existing
window and created a new session `session-2febd71437e7d77e`, distinct from the
two excluded historical sessions. One automatic one-to-one Direct Chat
extraction batch ran through the real Provider, existing fallback, Bridge/
Safety shadow, canonical writer, cursor, and exact-scope readback. No mock DTO,
synthetic candidate, handcrafted Bridge, or fake readback was used.

The exact serialized export was immediately persisted at:

`docs/evidence/memory-admission-v2/window-8817672802574c9a/2026-09-10__session-2febd71437e7d77e.json`

The file was read back byte-for-byte and reviewed from disk with
`reviewMemoryAdmissionLongEvidence.ts`. Review returned `status=ok`, one
window, one formal session, one exact scope, one batch, one `VALID_CONTROL`,
zero suppressions, zero fail-open/invalid/safety incidents, zero accounting
conflicts, logical `1`, physical `2`, and one evidence day. The record retained
`cursorAdvanced=true`, `cursorLoop=false`, `replayLoop=false`, `v2OnlyWrite=false`,
`promptDelta=0`, `canaryProviderDelta=0`, and `privacyStatus=metadata_only`.
The physical count of two is the existing fallback-split accounting shape for
one logical request.

The authoritative cumulative baseline is therefore now:

```text
retainedAuthoritativeExports = 1
formalSessionCount = 1
distinctExactScopeCount = 1
extractionBatchCount = 1
validSuppressionCount = 0
validControlCount = 1
logicalActionTotal = 1
physicalAttemptTotal = 2
firstEvidenceDay = 2026-09-10
lastEvidenceDay = 2026-09-10
distinctEvidenceDayCount = 1
```

R2 and 11O remain permanently excluded and contribute zero. Repeating the
persisted file as an input produced `recordCount=2` and
`dedupedRecordCount=1`, confirming immutable repeated-export handling. After
the checkpoint, collector, Canary, and shadow were disabled; the formal window
remains active and its raw token remains developer-held only.
