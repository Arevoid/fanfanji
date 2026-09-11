# Stage 4D-11O-R3E — Isolated Dev Origin Recovery (blocked)

## Result

This attempt stopped before any Memory Admission runtime action. The required
readiness condition was not reached.

Stop code: `R3E_CURRENT_DEV_BUNDLE_NOT_LOADED`

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

These checks validate the source change only; they do not upgrade this attempt
to runtime readiness.

## Recovery boundary

The next attempt must first make the existing `127.0.0.2` page expose the
current helper and trace globals, then prove helper/runtime Collector ordinal
alignment. Until that succeeds, do not create a Window, send a turn, call the
Provider, or run Memory evidence. Do not clear site data or replace the
fixture. The next governed stage remains R3D-R1 only after this blocker is
resolved.
