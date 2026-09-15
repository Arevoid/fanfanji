# Memory Admission V2 — Promotion and Memory Closure

Date: 2026-09-15

This document supersedes the pre-promotion status in the Early Daily-Use audit
for the reviewed refactor build. It records the safe cutover from the completed
synthetic campaign; historical campaign artifacts remain unchanged.

## Authoritative gate

Policy: `memory-admission-v2-promotion-2`

The immutable runtime gate is derived from the reviewed, sanitized campaign
snapshot:

```text
promotionEligible = true
formal sessions = 16
exact scopes = 4
automatic batches = 20
valid controls = 14
valid suppressions = 10
pre-promotion evidence days = 5
safety/privacy/accounting incidents = 0/0/0
```

The gate is checked before enabling the cutover. A failed gate keeps the
legacy-only path active.

## Effective runtime state

Application startup invokes `initializeMemoryAdmissionV2Promotion()`. When the
gate is valid it enables the existing candidate-local Direct Chat Safety-veto
adapter and its same-operation fail-open validator shadow. The first-wave
reason remains only `SAFETY_VETO_CANCELLED_PLAN`; temporary preference remains
shadow-only. The existing `MemoryService` extraction, canonical writer,
summary/projection path, cursor, and legacy compatibility seam are retained.

The adapter can only remove a single, fully validated cancelled-plan candidate
from the already accepted legacy list. It cannot create V2-only writes, widen
scope, or alter events, relationships, scenes, or other producers. Any
uncertain provenance, lineage, correlation, scope, schema, or validator result
preserves the legacy write (fail-open to the established path).

## Rollback

`rollbackMemoryAdmissionV2()` disables the promoted brake and safety shadow in
memory. No schema or destructive migration is required; canonical data remains
readable and previously written claims are not replayed or retracted. A future
promotion must pass the immutable gate again.

## Cloudflare propagation

The Worker extraction route now forwards `enableV2Shadow` to
`buildKnowledgeExtractionPrompt({ includeV2Shadow })` and preserves V2 source
hints for the parser and repair path. The flag is explicitly forced off for
`scenario = offline`. Other proxy routes and response shapes are unchanged.

## Memory V2 closure boundaries

- Chat, Offline, Diary, Character Phone, Moments, Events, and other existing
  producers retain their established intake boundaries.
- Candidate, Claim, provenance, exact scope, unique correlation, Safety-veto,
  and canonical write ownership remain separate and fail closed.
- Truth/Fact, Event, Episodic, Relationship State, Belief/Impression, Summary,
  Diary/private reflection, and Scene are not merged into one authority.
- Memory remains historical reference; it does not rewrite the current Scene or
  Relationship truth, and historical/future Events do not become the current
  shared Scene.
- Canonical Character IDs remain the identity key; same-name different-ID
  characters do not merge. Retrieval, Summary, Relationship, and private
  Diary boundaries remain exact-scope and privacy filtered.
- Offline exit persists the Scene and lightweight Handoff Capsule first;
  heavy consolidation/summary remains asynchronous and does not block return
  Online. Cross-app continuity shares character life without sharing a current
  Scene between apps/windows.
- Existing V3 backup/restore and migration compatibility remains covered by the
  synthetic round-trip suite. No destructive migration is introduced.

## Observation and release boundary

The five legitimate pre-promotion evidence days satisfy policy 2. The original
seven-day horizon is retained as post-promotion observation and is not
back-filled or fabricated. No real backup, real conversation, credential, raw
Provider payload, campaign counter, or hand-edited evidence is used here.

The promotion is local source/runtime work only. Deployment remains a separate
release action and is intentionally not performed by this closeout.
