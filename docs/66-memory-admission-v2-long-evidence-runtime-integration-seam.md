# Stage 4D-11N-R1 — Dev-only Long-Evidence Runtime Integration Seam

## Scope and readiness

The previous 4D-11N attempt was blocked because the bounded collector was a
standalone observer with no live extraction caller. R1 adds only the smallest
dev-only observation seam; it does not start formal Day 1, create a formal
window token, enter Phase 2, or expand Canary authority. Formal collection
remains at zero until a separately approved R2 run.

The implementation is designed to end in one of:

- `LONG_EVIDENCE_RUNTIME_INTEGRATION_BLOCKED` — the code seam is present but a
  required real-runtime probe cannot be completed;
- `LONG_EVIDENCE_RUNTIME_INTEGRATION_SAFETY_FAILURE` — an invariant or privacy
  check fails;
- `LONG_EVIDENCE_RUNTIME_INTEGRATION_VALIDATED` — the seam, tests, and the
  isolated real-runtime probe all pass.

This worktree has the code and test seam. A real `extractNow()` invocation is
still an explicit developer probe and is not a formal evidence window.

## Existing automatic path

The only caller added is the direct branch in
`src/features/chat/hooks/useChatMemoryExtraction.ts`:

```text
automatic direct-chat trigger
→ MemoryService.extractMemories
→ apiExtractMemoriesWithModelFallback
→ legacy acceptance + existing V2/Bridge/Safety observations
→ existing Canary filtering (when explicitly enabled)
→ commitMemoryWriteBundle or zero-candidate completion
→ canonical Truth/KnowledgeClaim + Summary/Projection
→ existing archive cursor update
→ bounded exact-scope readback
→ explicit logicalActionId Ledger accounting
→ recordDirectChatMemoryLongEvidence (observation only)
```

The collector is hard-gated to automatic, one-to-one Direct Chat. Group,
offline, manual, Diary, Moments, Character Phone, migration, backfill and
synthetic-only paths do not call the seam. The dev `extractNow(options)` trigger
reuses this same production extraction implementation; its default is
`production_equivalent_write`, while `observation_only` remains an explicit
diagnostic option. It does not force V2 metadata, change Prompt text, or create
a second extraction implementation.

## Chosen seam and authority ordering

`directChatMemoryLongEvidenceRuntime.ts` accepts an internal typed observation
envelope containing the already-produced extraction, Bridge/Safety/Canary
results, before/after accepted claims, write result, cursor result, scope,
logical action ID and bounded latency. The observer is invoked only after the
existing writer and cursor path has completed. Its return value is ignored by
the write path. It cannot suppress, add, retry, rollback, or mutate claims.

When the collector is disabled (the default), the direct path performs no
readback, Ledger assembly, Provider call, Prompt work, or persistence work
beyond the boolean guard. When enabled in a dev/test injection, readback and
recording are best-effort and wrapped in catches; an observer failure cannot
block the writer, cursor, chat, or retry/fallback behavior.

## Metadata and identity

The seam forwards real runtime Bridge/Safety/Canary fields. It does not
reconstruct them by rerunning inference. Raw IDs are held only long enough to
select the current Ledger rows and derive collector fingerprints. The collector
sanitizes them into opaque fingerprints; no raw candidate, source, scope,
lineage, Prompt, response, key, or Authorization value is exported.

The automatic batch creates one governed `logicalActionId` and injects it into
the existing `apiExtractMemoriesWithModelFallback` call. Ledger rows are
selected by exact explicit equality on that ID only. Normal extraction is
accounted as one logical request/one physical attempt; a linked fallback is one
logical request/two physical attempts. Unknown or mixed grouping is reported as
`accountingShape: "unknown"` and cannot become authoritative evidence. Prompt
and collector Provider deltas are always zero.

## Canonical readback

`readDirectChatMemoryCanonicalReadback` reads only the exact character,
relation, identity and conversation scope. It returns bounded IDs/counts for
active KnowledgeClaims, active Summary source claims, Projection jobs and
legacy MemoryItem source claims. It never returns statement bodies. Before and
after snapshots support three existing outcomes:

- control: accepted claims survive, canonical write/readback and cursor advance
  are observed;
- partial suppression: suppressed claims are absent while surviving claims,
  summary/projection state and cursor remain present;
- all-veto/zero-candidate: no surviving claim, Summary or Projection delta, and
  the existing cursor path advances.

Any cross-scope or non-exact observation is metadata-invalid and cannot become a
valid suppression record. No fake Summary or Projection is created.

## Privacy and failure behavior

The collector remains in-memory and bounded by its existing 100-record limit.
Runtime records contain enums, booleans, bounded counts, latency buckets and
opaque fingerprints only. Sanitization rejects unknown reason/state values and
marks malformed observations invalid. Readback, accounting or collector
exceptions fail open: the canonical write and cursor are never rolled back and
no retry is triggered.

## Developer trigger and probe limits

`__fanfanjiMemoryAdmissionTest.extractNow()` is installed only in a Vite
development build. It invokes the real automatic path and may be called at most
twice for an isolated local fixture during an integration check. The probe is a
dry-run/integration check, not a formal window: no `startWindow`, no Day 1
token, no formal session/suppression/scope/day/batch count, and no user backup.
Natural control evidence may be checked; a cancelled-plan case must never be
forced by changing Prompt or metadata.

## Tests and invariants

`scripts/directChatMemoryLongEvidenceRuntime.test.ts` covers the disabled guard,
exact readback, control/partial/all-veto classification, cross-scope rejection,
explicit logical accounting, fallback grouping, unknown grouping and export
privacy. Existing collector, accounting, persistence and dev-trigger tests
remain unchanged in meaning. The complete stage gate is:

```text
npm run lint
npm test
npm run build
tsx scripts/dependencyDirectionBaseline.test.ts
npm run smoke:check
```

No Prompt, Provider, retry/fallback, storage schema, canonical authority, or
user-data behavior is changed. Rollback is a normal commit revert (or resetting
the refactor branch to its prior HEAD); the original repository remains the
stable untouched baseline.

## Formal collection status and next step

R1 does not authorize formal long-evidence collection. Before R2, reviewers
must confirm that the dev trigger can be invoked in the local browser and that
one real Provider extraction produces a metadata-only record with the expected
Ledger/readback linkage. If that probe is unavailable, readiness stays
`LONG_EVIDENCE_RUNTIME_INTEGRATION_BLOCKED`; do not open a formal window. Only
after `LONG_EVIDENCE_RUNTIME_INTEGRATION_VALIDATED` may a separately approved
R2 task create a fresh formal window token and begin bounded Day 1 collection.
