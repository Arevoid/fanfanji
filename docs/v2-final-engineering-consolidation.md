# V2 Final Engineering Consolidation Status

Status for the consolidation sprint that started at `ac4c03668729061bfb6545c0ed8ce63825c1510a`.
This document records an audit and test boundary; it does not authorize a
provider cutover, a data migration, an Admission promotion, or a deployment.

## Outcome

`V2 FINAL ENGINEERING CONSOLIDATION COMPLETE`

`V2_ENGINEERING_READY = true`

`V2 RELEASE READINESS — WAITING ONLY ON ADMISSION EVIDENCE`

`ENGINEERING COMPLETE — ADMISSION EVIDENCE STILL PENDING`

`PROVIDER E2E DEFERRED — QUOTA BLOCKED`

`FIRST USABLE BASELINE STILL WAITING ON ADMISSION EVIDENCE`

The engineering work in this sprint is limited to an evidence-backed audit,
one synthetic full-life regression, and this status record. No production
feature contract, prompt semantics, provider configuration, or user data was
changed.

## Audit and classification

### Dead and legacy code

- No production file was deleted. A zero-reference result is not sufficient
  proof because migration, backup, import, and compatibility paths can be
  runtime-only entry points.
- Historical stage/evidence documents remain intact. They are part of the
  release audit trail and are not dead product code.
- Legacy storage adapters and UI/settings bootstrap access remain documented
  compatibility exceptions. Character, Message, Moment, Phone, Memory,
  Continuity, Life, Schedule, Event, OpenLoop, and Handoff writes use their
  repository/domain seams.
- `src/utils/stickerDb.ts` direct multimodal analysis and the explicit
  `forceDirectTts` branch in `src/utils/minimaxTts.ts` remain opt-in/compatibility
  paths. They were not silently migrated during a consolidation audit.
- No duplicate production AI entry point was found outside the approved shared
  runtime and transport adapters. The approved direct transport boundaries are
  `src/utils/apiHelper.ts`, the server protocol adapters, the Cloudflare worker,
  and the explicitly documented compatibility paths above.

### Large components and dependency graph

The following files are known high-risk/cohesive “god component” candidates:
`src/components/AppChat.tsx`, `src/App.tsx`,
`src/components/AppCharacterPhone.tsx`, `src/components/AppSettings.tsx`, and
`src/components/AppReading.tsx`. They were classified as `DEFER HIGH-RISK
SPLIT`: splitting them would expand the change surface without a focused
behavioral requirement. The dependency baseline remains **105 edges and 3
pre-existing allowlisted cycles**; no new cycle or allowlist entry was added.

## AI request and context boundaries

- UI/features submit one logical action through `apiChat` or an approved
  feature service. Retries and fallback transports remain inside the same
  accounting/ledger boundary.
- Purpose metadata and safe ledger records are preserved; prompts, full
  responses, credentials, and authorization headers are not persisted.
- Context/prompt assembly owns history, World Book, Truth/Knowledge,
  Relationship, Scene, and memory selection. Direct Chat does not absorb
  Phone, Moments, Diary, Forum, Reading, voice, image, payment, or background
  jobs without an explicit tested seam.
- The new life/continuity domain files contain no provider call, `fetch`,
  browser storage access, API key, or authorization header. This is asserted by
  the synthetic consolidation test.

## Identity, privacy, scene, and replay

- Ownership is always the exact ID tuple: `characterId`, `relationId`,
  `userIdentityId`, and `conversationId` where applicable. Names, avatars,
  persona text, and array position are never identity keys.
- `buildCrossAppContext` filters life state, schedules, beliefs, emotions,
  relationships, OpenLoops, and Handoff capsules by that tuple and omits
  user-private Diary data.
- Scene is a view boundary. An offline capsule can carry bounded references,
  but reopening Direct Chat defaults to `online_chat`; it does not turn the
  offline story into shared online reality.
- Event/OpenLoop transitions are deterministic and replay-safe. A fulfilled
  promise cannot be reopened by a reload, and proactive evaluation persists at
  most one bounded intent for a scope/cooldown window.

## Repository, storage, and backup

- Character Life and Schedule state use `characterLifeRepository` and
  `characterScheduleRepository` over the existing `storageAdapter`, retaining
  empty-safe reads and non-blocking storage failures.
- The synthetic regression covers an accepted direct-chat interaction, a
  persisted LifeEvent promise, deterministic Emotion/Belief/OpenLoop
  projection, a one-off overdue Schedule entry, Proactive quiet-period and
  cooldown/duplicate gates, exact-scope reload, and an Offline-to-Online
  Handoff capsule.
- Additive keys `phone_continuity_runtime_v1`,
  `phone_character_life_runtime_v1`, and `phone_character_schedule_v1` survive
  the V3 system-backup export/parse path. The old flat backup parser remains
  readable and does not invent the new stores. No backup was read, requested,
  or restored from a real user.
- Backup restore remains a compensating multi-store operation; cross-store
  atomicity is residual engineering debt and is not being hidden by this
  sprint.

## Production-path matrix

| Area | Current classification | Boundary |
| --- | --- | --- |
| Topic | ACTIVE/conditional | Context and continuity runtime; exact relation scope |
| Emotion | ACTIVE deterministic bridge | Event projection; decay is local |
| Belief/Impression | ACTIVE deterministic bridge | Subjective belief channel, never Truth writer |
| Relationship | ACTIVE bounded state | Existing relationship domain; no macro auto-upgrade |
| OpenLoop | ACTIVE | Explicit lifecycle and source-reference transitions |
| Character Life | ACTIVE | Repository-backed state and projection |
| Schedule | ACTIVE | Recurring/one-off/flexible lifecycle with real timestamps |
| LifeEvent | ACTIVE/explicit producer seam | `persistConfirmedLifeEvent`; no implicit AI inference |
| Handoff | ACTIVE bounded capsule | IDs/references only, no transcript/prompt dump |
| Context Gateway | ACTIVE | Read-only exact-scope cross-app projection |
| Proactive | ACTIVE deterministic eligibility | No background polling; generation remains a separate action |
| Provider E2E | DEFERRED | Metadata-safe check is `403 insufficient_user_quota` |
| Admission | PAUSED/SHADOW/DEV-GATED | Independent evidence campaign; no promotion inferred |

The LifeEvent-to-continuity bridge is an explicit deterministic seam. The
`persistConfirmedLifeEvent` service persists a canonical event and life state;
callers still invoke the bridge when they intentionally project that event into
Emotion, Belief, or OpenLoop. The audit does not claim automatic projection
that the production call graph does not perform.

## Verification

The added synthetic regression is
[`scripts/v2FinalEngineeringConsolidation.test.ts`](../scripts/v2FinalEngineeringConsolidation.test.ts).
It uses isolated synthetic IDs and an in-memory Storage implementation only.

At the final checkpoint, run and record all of the following against the final
HEAD: `npm test`, `npm run lint`, `npm run build`, `npm run install:check`,
`npm run release:check`, `npm run smoke:check`,
`npx tsx scripts/dependencyDirectionBaseline.test.ts`, and `git diff --check`.
Focused life-runtime, continuity, handoff, backup, AI accounting, and browser
error regression tests remain part of the complete suite.

## Admission boundary and remaining work

The Admission campaign remains independent and unchanged: Provider is blocked
by `403 insufficient_user_quota`; session/scopes, automatic-batch,
suppression, and calendar-day evidence counts remain governed by the campaign
and are not manufactured here. No credentials, real profile, real backup,
real conversation, diary, or memory was accessed. No push, merge, or deploy is
part of this sprint.

Residual engineering debt is limited to the documented large-component split
risk, legacy/compatibility direct paths, and cross-store backup atomicity.
Residual product/release debt is the Admission evidence campaign and Provider
quota recovery.
