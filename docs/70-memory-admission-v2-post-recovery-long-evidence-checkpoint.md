# Stage 4D-11O — Post-Recovery Long-Evidence Checkpoint

## Run boundary

- Starting refactor HEAD: `9ace25a4ba33e8b86a4b2d01427a75c70b6af64c`.
- Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`.
- UTC evidence day: `2026-09-10` (real clock; no date mocking).
- Existing window resumed: `window-8817672802574c9a`.
- New session: `session-2febd71437e7d77e`.
- Historical R2 and 11O observations remain excluded permanently.

## Persist-first artifact

One automatic one-to-one Direct Chat extraction batch completed through the real
Provider path and existing fallback, Bridge/Safety shadow, canonical writer,
cursor, and exact-scope readback. The exact `exportJson()` string was obtained
without editing or reconstruction, written immediately, and read back
byte-for-byte before review.

Artifact:

`docs/evidence/memory-admission-v2/window-8817672802574c9a/2026-09-10__session-2febd71437e7d77e.json`

The disk reviewer returned:

```text
status = ok
windowCount = 1
mixedWindow = false
malformedExportCount = 0
malformedRecordCount = 0
privacyViolationCount = 0
accountingConflictCount = 0
safetyIncidentCount = 0
authoritativeArtifactCount = 1
```

## Authoritative cumulative baseline

Only the durable full artifact contributes:

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

The record is `VALID_CONTROL`, with exact scope, trusted provenance, shared
lineage, canonical survivor observed, cursor advanced, no cursor/replay loop,
no V2-only or unauthorized write, zero Prompt/Canary deltas, and
`metadata_only` privacy. Logical/physical accounting is `1/2` with the existing
`fallback_split_rows` shape. No suppression was forced or synthesized.

Repeating the same file through the reviewer produced raw record count `2` and
deduplicated count `1`; cumulative counts remain unchanged. The recovery
manifest was not supplied to the reviewer and contributes no evidence.

## Shutdown state

After persistence, disk read-back, review, and checkpoint, the collector,
Canary, and shadow were disabled. The formal window remains active for future
same-window continuation; the raw token remains developer-held only and is not
stored in this checkpoint or artifact.

## Readiness and next recommendation

Readiness is `LONG_EVIDENCE_WINDOW_ACTIVE_HEALTHY` for this bounded post-recovery
session. This is not `LONG_EVIDENCE_VALIDATED` and does not authorize Phase 2.
Keep the current controls disabled. A future continuation must repeat
preflight, baseline disk review, same-window resume, bounded extraction,
persist-first exact export, disk review, cumulative combine, checkpoint, and
shutdown. Coverage remains below the long-window minimums (1/5 sessions, 1/10
suppressions, 1/3 scopes, 1/7 days, 1/20 batches).
