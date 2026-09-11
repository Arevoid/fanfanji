# Memory Admission V2 — Dedicated Relation and Exact Direct Scope Bootstrap

Stage 4D-11O-R4C is a dev-only fixture bootstrap. It starts from refactor
`b3083e94f06d808bf3357484dc197364cc22b100` on the isolated origin
`http://127.0.0.2:3000`; the stable repository remains at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

## Preconditions and continuity

The dedicated action is query-gated and waits for the normal Character
repository hydration. It accepts only the one canonical, non-archived
synthetic identity identified by the existing development-only bio marker and
the one non-group, non-contact Character whose `ownerIdentityId` is exactly
that identity ID. It does not identify either record by name, avatar, persona,
or display text. The recheck showed one identity, one owned Character,
`summaryTriggerRound = 10`, and zero relations, messages, memories, Network
NPCs, or Network edges. No backup or production data is used.

## Relationship seam audit

The normal domain seam is `createRelationship(...)`, followed by the existing
relationship repository and the existing `saveRelationships` application
path. Its default relationship value is `friend`; it derives
`conversationId` with `getConversationId`, yielding `direct:${relationId}`.
The seam itself does not call a Provider, create a Message or greeting, create
Memory, or create Network data. The application callback also captures the
normal idempotent `relationship_created` CharacterEvent; this is the only
expected auxiliary event and contains no prompt or transcript.

The dev helper uses governed `createId`, persists through the normal repository
callback, and reads the repository back. It never writes raw localStorage or
IndexedDB and refuses a second relation for the fixture.

## Exact scope inspector

`inspectDedicatedEvidenceFixture()` uses the production
`resolveDirectInteractionScope(...)` resolver and verifies the stored
conversation contract before reading the message window. It is read-only: it
does not set React state, write storage, create records, move the archive
marker, schedule extraction, call a Provider, or invoke `extractNow()`.

The initial empty transcript is valid: marker absent is represented as
`archiveMarkerPresent = false`, `archiveMarkerFoundInLoadedScope = false`, and
`exactPendingRange = true`. With trigger round 10, the inspector reports
`triggerCount = 20`, `eligibleMessageCount = 0`, and `distanceToTrigger = 20`.
The exact scope is online, non-group, not in flight, not cooling down, and
therefore `nextTurnTriggers = false` while the distance is above the two-turn
threshold. Canonical identity, Character, relation, and conversation IDs are
represented only by privacy-safe fingerprints in the dev log.

## Persistence and reload

The relation is created exactly once, read back from the repository, and the
inspector is stable after a page reload and a development-server restart.
Message and Memory counts remain zero; the archive marker remains absent.
No chat page is opened in a way that could seed a greeting, and no messages
are sent.

During the smoke pass, opening the Chat application allowed the existing
background proactive scheduler to attempt one `moment_generate`; it failed
closed because the local runtime had no API key. This was not initiated by the
relation helper and did not write a Message, Memory, Network record, or alter
the fixture. It is recorded as `BACKGROUND_PROVIDER_ROUTING_DEBT_REPRODUCED`
for this runtime and is not changed by R4C.

## Scope and campaign invariants

This bootstrap adds no fixture-specific production flag or runtime manifest.
It adds only a Vite-development query action and its test seam. There is no
Provider request from the R4C helper, automatic extraction,
`memory_extract`, Window, collector, shadow, Canary, or Campaign token. The
campaign manifest remains unchanged (`approved/closed = 2/2`, artifacts 2,
sessions 2, scopes 1, batches 2, controls 2, suppressions 0, days 2,
`stickyFailure = false`, `promotionEligible = false`).

## Readiness

The fixture is `DEDICATED_DIRECT_FIXTURE_READY_VALIDATED` with lifecycle
`ready`, exact scope healthy, one normal relation, zero transcript, zero
Memory, and zero Network side effects. The next approved step is
Stage 4D-11O-R5 bounded accumulation (at most three normal direct turns,
inspector before/after, and no Window/collector/Canary/Campaign work). It was
not started in this stage.
