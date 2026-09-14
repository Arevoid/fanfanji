# Character Life Runtime (V2 Sprint Pack 3)

Character Life is one canonical, relation-scoped record. Chat, Offline, Diary,
Moments, Character Phone, Forum, Browser, and Reading are separate windows into
that life; they do not share one current Scene. `CharacterLifeState` stores only
phase/activity/availability and timestamp references. Missing or invalid records
resolve to an empty-safe `unknown` state, preserving old users without a
destructive migration or backup re-import.

## Temporal and schedule boundaries

`temporalRuntime` derives local day keys, elapsed durations, relative labels,
future schedule distance, and overdue state from real timestamps. It never asks
the provider to infer time. `CharacterScheduleEntry` supports recurring routines,
one-off items, flexible blocks, and explicit scheduled/completed/cancelled/
missed/postponed lifecycle states. Existing appointment records remain separate.

## Events and continuity

`LifeEvent` adds explicit type, timestamp/interval, participants, visibility,
status, and references while retaining the legacy `CharacterEvent` shape. An
event describes what happened or is planned; it is not the current Scene.
`lifeContinuityBridge` applies independent deterministic rules to Emotion,
Belief/Impression, OpenLoop, and topic hints. Beliefs remain subjective, and
bounded relationship dimensions never auto-upgrade a macro relationship label.

OpenLoop lifecycle supports pending/fulfilled/cancelled/expired/superseded
outcomes, with source-reference transitions so reloads cannot recreate the same
promise. Proactive eligibility is local and explainable: it considers quiet
period, cooldown, duplicate intent, open loops, schedules, events, unresolved
topics, and emotion residue, returning `eligible/not eligible + reason` without
background polling or extra provider calls.

## Projection, privacy, and persistence

`Life Projection` and `Context Gateway` filter every record by exact
character/relation/identity scope. User-private Diary data is never included in a
character projection. Character Phone projections are owner-character scoped;
other characters cannot read its life state. Handoff capsules carry bounded life
event, schedule, and open-loop references only—not transcripts, prompts, full
memories, or schedule history.

New records persist through `characterLifeRepository` or
`characterScheduleRepository` over the existing `storageAdapter`. Relation
cleanup removes them without touching another character. Existing V3 backup
payloads remain readable because the new keys are additive and empty-safe; the
synthetic regression is `scripts/characterLifeRuntimePack3.test.ts`.

Provider E2E remains deferred while the metadata-safe quota check returns
`403 insufficient_user_quota`. Admission promotion remains an independent
paused/shadow/dev-gated campaign and is never inferred from Life Runtime
completion.
