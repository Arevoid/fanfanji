# Stage 4D-11O-R4B — Isolated Owned Character Runtime Bootstrap

Status: `OWNED_CHARACTER_RUNTIME_BOOTSTRAPPED_VALIDATED`

This record covers only the Character-level bootstrap in the dedicated local
development partition. It does not create a Relation, Conversation, Message,
Memory item, Network NPC/edge, Direct Chat scope, evidence Window, collector,
Canary, or Campaign record.

## Isolation and identity gate

- Starting refactor HEAD: `944428b53933c411931a5dba88debcd17fc76630`.
- Runtime origin: `http://127.0.0.2:3000` (kept separate from `localhost`).
- A fresh tab before creation showed Character 0, Chat 0, Relation/contact 0,
  and Memory 0.
- The normal `Chat → 我 → 我的人设` path showed the existing synthetic
  identity. Its bio is the explicit local-development marker; no name, avatar,
  or display-text matching was used to select it.
- The settings/domain record was read through the normal UserIdentity settings
  path. Exactly one non-archived, non-alias identity matched the explicit
  synthetic marker. No backup import or production data was used.
- Privacy-safe canonical-ID fingerprints (not reversible IDs) captured during
  the run were:
  - identity: `ddd0e58523e4b05a`
  - Character: `512fa06e6317a4bb`

## Creation and readback

The explicit dev action was query-gated and waited for normal Character
repository hydration. It constructed one ordinary synthetic Character with
`createCharacterFromInput(...)`, passed the canonical `ownerIdentityId`, and
then used the existing App `handleSaveCharacter → saveCharacters →
flushCharacters` path. No raw JSON, direct IndexedDB/localStorage write,
repository injection, or Relationship Network path was used.

The saved Character has:

- `summaryTriggerRound = 10`
- `evidenceMode = mechanism_characterization` (bootstrap metadata only)
- `defaultBehaviorRepresentative = false`
- no greeting or initial chat context
- non-group and non-contact-instance shape

Repository readback returned exactly one Character and proved exact owner
equality with the canonical synthetic identity. The readback action is also
available as a dev-only inspect operation; it never writes storage.

## Side-effect and persistence checks

After creation and after a new tab load, the normal UI showed:

| Record | Before | After / restart |
| --- | ---: | ---: |
| Character | 0 | 1 |
| Relation/contact | 0 | 0 |
| Direct Chat/conversation | 0 | 0 |
| Message | 0 | 0 |
| Memory | 0 | 0 |
| Relationship Network NPC | 0 | 0 |
| Relationship Network edge/link | 0 | 0 |

No Provider, automatic extraction, or `extractNow()` activity occurred. The
dev console contained only the normal Vite/PWA startup messages and the
sanitized bootstrap result; no background Provider activity was observed.
The Campaign remained unchanged at its approved/closed 2/2, artifacts 2,
sessions 2, scopes 1, batches 2, controls 2, suppressions 0, days 2,
`stickyFailure=false`, `promotionEligible=false` state. No Window, token,
collector, shadow, or Canary was created.

The dev server was stopped and restarted. A new tab on the same isolated origin
then read the Character and synthetic identity back successfully, preserving
the owner equality and trigger round. The original stable worktree was not
opened for writes.

## Code boundary

`src/features/archives/characterOwnershipBootstrapDev.ts` is a dev-only
orchestration seam. It can only discover the explicit synthetic identity,
construct through the existing Character creation seam, call the existing App
save callback, and perform repository readback/fingerprinting. The query-gated
App hook is inert outside Vite development builds and does not inject the
active identity into ordinary Archive creation. The ordinary ownerless Archive
default therefore remains unchanged.

No fixture-specific production flag was added. No Relation/scope fields were
invented in a fixture manifest; those remain `not_created` / `not_applicable_yet`.

## Verification

- `scripts/characterOwnershipBootstrapDev.test.ts`: passed; it covers explicit
  identity validation, one-shot creation, exact ownership, persistence
  readback, privacy fingerprints, no greeting, and duplicate-call blocking.
- Full lint, complete tests, build, and dependency gate are run after the
  runtime evidence is recorded and must remain green before the bootstrap
  commit is accepted.

## Next boundary

The next separately approved step is Stage 4D-11O-R4C: create exactly one
Relation and its exact Direct Chat scope, still without messages, Provider
requests, extraction, Window, or Campaign changes. This stage stops before
that work.
