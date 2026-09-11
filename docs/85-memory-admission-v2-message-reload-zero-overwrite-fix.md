# Stage 4D-11O-R5D — Message Reload Empty-Snapshot Overwrite Fix

## Scope and result

This stage investigated the R5C runtime failure in which a durable
`messages-v4` snapshot containing two direct-chat records was present before a
reload and became empty after bootstrap. No real Direct Chat turn was sent in
R5D. No Provider, Memory, Admission, Prompt, Campaign, Service Worker, or
entry-store behavior was changed.

The root cause was proven in the App bootstrap timeline: React development
`StrictMode` replays mount effects. The old `messagesPersistenceReady` ref was
set during the first messages persistence effect, so the replay treated the
initial `[]` placeholder as an authoritative state and called `saveMessages([])`
before `initializeMessages()` finished. `saveMessages` increments the
repository mutation version and replaces `cachedMessages`; the subsequent
`initializeMessages()` read therefore returns that concurrent empty cache and
the latest-snapshot writer persists `[]`.

## R5C reproduction evidence

| Point | Durable messages | Exact-scope eligible | Distance | Marker | Memory |
| --- | ---: | ---: | ---: | --- | ---: |
| Before the R5C turn | 0 | 0 | 20 | absent | 0 |
| After one completed turn, before reload | 2 | 2 | 18 | absent | 0 |
| After reload and approximately four seconds of hydration wait | 0 | 0 | 20 | absent | 0 |

The pre-reload snapshot had one user and one assistant record, no duplicate
IDs, and one exact scope. The R5C browser evidence therefore ruled out an
unfinished write and narrowed the failure to bootstrap/hydration.

## Mount and repository timeline

| Phase | Operation | Execution class | State effect |
| --- | --- | --- | --- |
| T0 | Repository module loads | synchronous | `cachedMessages = null`, `metadataReady = false`, `mutationVersion = 0`, writer idle |
| T1 | `useState` message initializer calls `loadMessages(DEFAULT_MESSAGES)` | synchronous | With the entry-store flag disabled, localStorage fallback is read; bootstrap value is `[]` when no legacy snapshot exists |
| T2 | App renders | synchronous | React state contains the bootstrap placeholder `[]` |
| T3 | Effects register | synchronous/effect scheduling | `initializeMessages(DEFAULT_MESSAGES)` starts; messages persistence effect is registered |
| T4 | First persistence effect pass (old code) | effect | `messagesPersistenceReady` becomes `true`; no write |
| T5 | StrictMode replay of the persistence effect (old code) | effect | The old guard is already `true`; `saveMessages([])` is called |
| T6 | `saveMessages([])` | synchronous repository mutation | `mutationVersion` increments, `cachedMessages` becomes `[]`, and an empty snapshot is enqueued |
| T7 | `initializeMessages` starts/continues metadata read | async IndexedDB | The read is allowed to observe the durable two-record snapshot |
| T8 | Initialization compares versions | microtask after IndexedDB | Because the mutation version changed, the repository returns the current cached `[]` as the concurrent result |
| T9 | Initialization applies result | React state update | `setMessages([])` leaves the UI empty |
| T10 | Latest-snapshot writer completes | async IndexedDB transaction | `messages-v4` is now durably `[]` |
| T11 | Post-reload inspector | async read | Exact scope has no messages; no Memory extraction or marker is involved |

`initializeMessages()` is otherwise read/hydrate-first when `messages-v4` is an
array: it loads the snapshot, updates the module cache and removes legacy
localStorage copies. If the target is absent, it may enqueue a legacy/default
fallback snapshot as part of migration. That fallback path was not involved in
the R5C failure; the target contained a valid non-empty array before reload.

## Fix design

`src/core/messagePersistenceLifecycle.ts` now owns a small, storage-neutral
lifecycle state:

- `hydrationReady` is false until `initializeMessages()` resolves a valid
  authoritative result;
- the messages state effect returns `wait_for_hydration` while that barrier is
  false, including both StrictMode mount passes;
- the hydration-applied snapshot is consumed as
  `hydration_snapshot`, preventing an immediate duplicate write;
- an explicit `handleSendMessage` save is marked by snapshot identity and is not
  written again by the state effect;
- after hydration, a genuine user clear remains authoritative and persists
  `[]`.

The App now calls `markMessageHydrated()` when initialization resolves,
`consumeMessagePersistenceDecision()` from the state effect, and
`markMessageSnapshotPersisted()` after the existing immediate message save.
No storage schema or repository writer semantics changed.

## Tests

`scripts/messagePersistenceBootstrap.test.ts` covers:

1. StrictMode double mount cannot persist the bootstrap placeholder;
2. an existing durable pair remains authoritative during fresh bootstrap;
3. hydration does not enqueue a duplicate snapshot;
4. an intentional post-hydration clear persists `[]`;
5. explicit send persistence is not duplicated by the state effect.

Existing `scripts/messagePersistenceDurability.test.ts` continues to cover
awaited flush, latest-snapshot behavior, fresh repository hydration and exact
scope reads. `scripts/directReplyDurableCompletion.test.ts` continues to cover
R5B completion ordering, provider failure, partial delivery and storage failure
non-blocking behavior.

Full validation after the fix: 594/594 tests passed, lint passed, build passed,
and dependency direction passed with 105 allowlisted edges and 3 unchanged
cycle baselines. The generated Service Worker cache fingerprint was restored to
the repository baseline after build.

## Safety and readiness

- Real R5D Direct Chat turns: 0.
- Provider calls: 0.
- Automatic extraction / `extractNow()`: 0.
- Memory writes: 0; archive marker absent.
- Campaign: unchanged (`approved/closed=2/2`, artifacts=2, sessions=2,
  scopes=1, batches=2, controls=2, suppressions=0, days=2,
  `stickyFailure=false`, `promotionEligible=false`).
- Service Worker and entry-store flag: unchanged.
- User data: no existing user data was intentionally modified; the R5C
  temporary synthetic pair had already been lost before this fix stage.

Readiness: `MESSAGE_RELOAD_ZERO_OVERWRITE_FIX_LOCAL_VALIDATED`.

The next approved step is
**Stage 4D-11O-R5E — Durable Message Reload Real Runtime Validation**:
exactly one new synthetic turn, pre-reload durable evidence, reload, and proof
that the same records survive. Do not enter R5R until R5E passes.

