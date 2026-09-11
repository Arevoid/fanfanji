# Stage 4D-11O-R3E — Isolated Dev Origin Recovery (diagnosed)

## Result

The original supported-browser attempt stopped before any Memory Admission
runtime action. A later bounded Edge/CDP diagnostic run reached the runtime
diagnosis boundary without sending a message or invoking Memory.

Original stop code: `R3E_CURRENT_DEV_BUNDLE_NOT_LOADED`

- Starting HEAD: `2bec271856051f1f90e36397aa656255d61dfeeb`
- Refactor branch: `refactor/v2-architecture`
- Original stable HEAD: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Existing origin preserved: `http://127.0.0.2:3000/`
- Readiness: not reached

## Source and Service Worker audit

Before this change, `src/main.tsx` treated only `localhost` and
`127.0.0.1` as local development hosts. The existing `public/sw.js` fetch
handler used the same two-host exception for Vite modules. Consequently the
existing `127.0.0.2` origin could remain controlled by the production PWA
worker and serve stale lazy modules.

The attempted recovery is dev-only: `src/main.tsx` now uses the shared
`isDevLoopbackOrigin` predicate for `localhost`, the complete IPv4
`127.0.0.0/8` loopback range, and `::1`, and unregisters existing Service
Worker registrations on a Vite dev build. It no longer deletes CacheStorage.
The normal production registration branch remains present. The predicate is
covered by `scripts/devOriginServiceWorker.test.ts`.

## Runtime observations

The refactor dev server was running from this worktree on port 3000. A direct
source read from the server contained the current R3C helper rebind,
`instanceOrdinal`, trace API, and the new dev-origin predicate. However, the
actual page did not expose either global after all of the following safe
operations on the existing origin:

1. normal page reload;
2. same-origin navigation with a cache-busting query;
3. a fresh same-origin temporary tab;
4. closing old tabs and opening a new same-origin tab;
5. entering the existing chat without sending a message.

The runtime checks consistently returned:

```text
helperPresent = false
tracePresent = false
collector instance counter = absent
```

Earlier development logs showed the old page registering a Service Worker for
`http://127.0.0.2:3000/`. After the attempted dev unregister path, no new PWA
registration log was observed, but the lazy Chat module still did not expose
the Collector globals. Therefore the stale-module cause remains plausible but
is not fully resolved or proven at runtime.

The browser automation kernel then failed to reinitialize with
`failed to write kernel assets (os error 3)`, so no further runtime inspection
or HMR test was attempted. This is an environment blocker, not evidence of
fixture corruption.

## Data and safety boundary

No IndexedDB, localStorage, CacheStorage, fixture, campaign, marker, cursor,
or message data was cleared, reset, deleted, or rewritten. No Window was
created; no accumulation or trigger was run; no Direct Chat message was sent;
no Provider request, extraction, `extractNow()`, Memory write, or artifact
export was performed.

## Verification

The deterministic source/test validation for the attempted fix completed
before the runtime stop:

- relevant dev-origin, HMR, trace, and Service Worker tests: passed;
- full test suite: `599/599`;
- `npm run lint`: passed;
- `npm run build`: passed (the generated Service Worker fingerprint was
  restored to the tracked baseline after the check);
- dependency gate: passed (`105` allowlisted boundary edges, `3` cycles).

These checks validate the source change only; the later CDP run below supplies
the bounded runtime diagnosis.

## R3E-R1-R1 runtime diagnosis

The supported CUA kernel remained unavailable, so a pre-existing Microsoft
Edge executable was launched with a separate diagnostic-only profile and CDP.
The only origin opened was `http://127.0.0.2:3000/`. No site data was cleared.

The root probe reported:

```text
rootBundleLoaded = true
dev = true
mode = development
hostClass = loopback
window === window.top = true
serviceWorker.controller = null
registrations = []
```

A timing probe after a harmless reload reproduced the preflight boundary:

```text
~50ms:  helper=false, trace=false, Chat resources not yet evaluated
~700ms: helper=false, trace=false, Chat resources not yet evaluated
~1.8s:  helper=true, trace=true, collector ordinal=1
```

The module registry then recorded `chat_module_evaluated`,
`memory_extraction_module_evaluated`, `collector_module_evaluated`, and
`trace_module_evaluated`, followed by successful dev API installation. The
helper ordinal and Collector ordinal were both `1`.

This proves classification `J — helper unavailable before lazy business module
load by design`. `App.tsx` schedules the existing `IDLE_PRELOAD_APP_IDS`
preload through `requestIdleCallback` (with a 1500ms timeout), so an immediate
preflight can observe a current root bundle while the Chat module has not yet
run. The current run had no Service Worker controller, no registration, and no
module evaluation error; stale SW and wrong browsing context were not involved
in this diagnosis.

To make that state inspectable without forcing a business action, the
checkpoint now exposes a dev/test-only root probe and a bounded 64-entry
privacy-safe module registry. It records only enumerated stage/module/mode,
timestamp, optional instance ordinal, and safe reason codes. It does not
contain prompts, responses, messages, tokens, credentials, request IDs, or
user data. This corrects the preflight model; it does not preload production
modules or alter Memory behavior.

Readiness: `DEV_RUNTIME_PRECHECK_MODEL_CORRECTED`

## Recovery boundary

The next attempt must first make the existing `127.0.0.2` page expose the
current helper and trace globals, then prove helper/runtime Collector ordinal
alignment. Until that succeeds, do not create a Window, send a turn, call the
Provider, or run Memory evidence. Do not clear site data or replace the
fixture. The next governed stage remains R3D-R1 only after this blocker is

## Fast-Track portable synthetic fixture checkpoint

The browser-profile dependency was removed for the next runtime attempt by
adding the dev-only `portableDirectChatFixture` bootstrap. It uses the
existing character-ownership and dedicated relation/exact-scope repositories;
it does not seed messages, Memory, Campaign, Window, suppression, or any
historical evidence. The fixture lineage is `Stage4D3Portable` with the
following immutable labels in its manifest:

```text
synthetic = true
portableFixture = true
historicalEvidenceImported = false
evidenceMode = mechanism_characterization
defaultBehaviorRepresentative = false
summaryTriggerRound = 10
```

The bootstrap is invoked only by the development query
`?portableDirectChatFixture=1`, creates at most one matching synthetic
identity/Character/Relation, and persists only privacy-safe fingerprints in
the dev manifest key. `?inspectPortableDirectChatFixture=1` is read-only. A
conflicting synthetic identity or duplicate portable identity is rejected;
the existing Stage4D3 lineage is never imported or rewritten.

In the isolated Edge/CDP profile the bootstrap returned
`PORTABLE_FIXTURE_READY_VALIDATED`, with exact scope healthy, zero eligible
messages, trigger count 20, distance 20, no archive marker, and zero Memory.
A reload and read-only inspection returned the same fingerprints and manifest,
proving fixture persistence without relying on a previous browser profile.

The next R3D attempt is still blocked until this portable profile has an
available Provider credential. No credential was copied from a real user
profile or written by this checkpoint.
resolved.
