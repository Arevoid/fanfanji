# Memory Admission V2 — Running Sanitized Checkpoint

This file records the sanitized metadata from Stage 4D-11O's Day 1
continuation. It intentionally contains no raw token, prompt, message,
candidate statement, response, API key, Authorization header, or raw ID.

```json
{
  "windowFingerprint": "window-8817672802574c9a",
  "sessionFingerprint": "session-803588fc45247e6e",
  "scopeFingerprint": "scope-bbb51957",
  "batchActionFingerprint": "batch-17b6502c",
  "evidenceRecordFingerprint": "evidence-30e3b20a69bc9b70",
  "evidenceDay": "2026-09-10",
  "classification": "VALID_CONTROL",
  "formalSessionCount": 1,
  "distinctExactScopeCount": 1,
  "extractionBatchCount": 1,
  "validSuppressionCount": 0,
  "validControlCount": 1,
  "failOpenCount": 0,
  "invalidSampleCount": 0,
  "safetyIncidentCount": 0,
  "logicalActionTotal": 1,
  "physicalAttemptTotal": 2,
  "accountingConflictCount": 0,
  "unknownGroupingCount": 0,
  "firstEvidenceDay": "2026-09-10",
  "lastEvidenceDay": "2026-09-10",
  "distinctEvidenceDayCount": 1,
  "repeatedExport": {
    "status": "ok",
    "windowCount": 1,
    "mixed_window": false,
    "malformedExportCount": 0,
    "malformedRecordCount": 0,
    "recordCount": 2,
    "dedupedRecordCount": 1
  }
}
```

The prior R2 Day 1 export is summarized in
`docs/65-memory-admission-v2-long-evidence-window-day-1.md`, but its complete
record payload was not persisted. The summary above is historical context only:
it is not an authoritative export and must not be supplied to
`combineLongEvidenceExports()` or counted toward promotion. Consequently a
machine-checked previous-plus-current combined review is pending; this
checkpoint is not a long-evidence promotion.

The 11O continuation export was likewise available only in the browser page
that was closed before persistence. It is therefore recorded as
`11O_EXPORT_UNRECOVERABLE`; no placeholder JSON or reconstructed record may be
created from this summary. The durable-artifact protocol and offline review
tool are specified in
`docs/68-memory-admission-v2-sanitized-evidence-artifact-protocol.md`.
