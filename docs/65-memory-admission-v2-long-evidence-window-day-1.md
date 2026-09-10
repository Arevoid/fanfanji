# Stage 4D-11N — Bounded Local Long-Evidence Collection — Window Day 1

## Status and stop state

This Day 1 run is **blocked before formal-window start**. The refactor
worktree was inspected at `28d64a9218a34f6f3fcc8a7627c59a41cff38b9d`; the
stable original repository remains at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

Readiness is therefore:

`LONG_EVIDENCE_COLLECTION_BLOCKED`

No formal window token was created or retained, no formal session was started,
and no Day 1 checkpoint or formal evidence record exists. This document does
not claim long-evidence completion or authorize Phase 2.

## Runtime audit

The refactor Vite development server was running at `http://localhost:3000/`
from the refactor worktree. The isolated `Stage4D3` Direct Chat fixture was
opened in the local browser. One previously approved natural Direct Chat turn
completed normally through the real Provider: the user bubble appeared once,
one assistant reply appeared, loading ended, and no duplicate delivery was
observed. No backup or production user data was used, and the fixture was not
cleared.

The formal Memory extraction trigger was not invoked. No `memory_extract`
formal evidence, suppression, control, or `real_runtime` long-evidence record
was produced.

## Blocking structural gap

`src/features/chat/services/directChatMemoryLongEvidenceCollector.ts` is still
a standalone, in-memory observer. A repository-wide source audit found no
runtime caller of `recordDirectChatMemoryLongEvidence()` and no import that
installs its dev API in the application entry path. The existing AppChat
`extractNow()` trigger only runs the established observation-only extraction
path and exposes bounded Admission Shadow diagnostics; it does not create a
long-evidence record.

Consequently a real Provider extraction cannot currently be joined to the
formal window/session/batch/evidence fingerprints, authoritative Ledger
accounting, and exact-scope canonical readback required by 4D-11N. Adding a
single global import would expose controls but would not supply the required
recording seam or the canonical readback/accounting contract. Completing that
connection is a design/integration change, not a safe evidence-only action, so
collection stops here rather than using handcrafted DTOs or synthetic records.

## Evidence and privacy

- Formal window/session/scope/batch/suppression/control counts: **0**.
- Formal evidence days and checkpoint summary: **none**.
- Provider/Prompt/Memory/Writer behavior: unchanged.
- No Prompt text, message text, candidate statement, raw ID, token, response,
  API key, Authorization header, or raw Provider body was exported.
- No canonical Memory, Summary, Projection, cursor, or user data was changed
  by this blocked run.
- The existing Canary and collector were not enabled for formal collection.

## Required follow-up before the next collection attempt

First design and separately approve a minimal dev-only integration seam that
receives the real extraction result, current Bridge/Safety metadata, canonical
readback, and authoritative AI Ledger accounting as one bounded observation.
That seam must remain fail-open, metadata-only, automatic one-to-one Direct
Chat only, and must not alter Prompt, Provider, retry/fallback, canonical
authority, or storage behavior. After that seam is tested, a new 4D-11N run may
create a fresh developer-held token and start Day 1.

Until then, the correct state remains `LONG_EVIDENCE_COLLECTION_BLOCKED`.
