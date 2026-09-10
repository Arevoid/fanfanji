# Memory Admission V2 — Lost Runtime Recoverability Audit (Stage 4D-11O-R3A)

## 1. Scope and stop boundary

This is a static/storage-layer audit only. No Provider request, chat message,
`extractNow()`, observer toggle, `resumeWindow()`, `startWindow()`, token
creation, evidence artifact creation, or production-code change was performed.

The audit started at and ended on refactor HEAD
`c78b4bfa8a7e63cb10162b5a787a2187815a4c97`. The original repository remains at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

## 2. Browser and runtime facts

The CUA browser descriptor was present, but it exposed zero accessible tabs.
`getTab("1", { browser: "iab" })` returned `Tab not found`; no new tab was
created. The original fanfanji tab therefore cannot be attached from the
current automation runtime and is recorded as:

`ORIGINAL_RUNTIME_TAB_LOST=true`

The local dev server remained reachable (`HTTP 200`, title `米饭机`). This
proves server availability only; it does not recreate the lost page runtime.

## 3. Raw-token lifecycle

`directChatMemoryLongEvidenceCollector.ts` stores the supplied token only in
the module-local `activeWindow.salt`. `createWindowToken()` creates a new
governed ID through `createId("memory-evidence-window")`; it does not persist
the result. `startWindow()` and `resumeWindow()` explicitly reject short or
low-diversity values and retain only a deterministic reviewer fingerprint.

No collector implementation writes the raw token to localStorage,
sessionStorage, IndexedDB, the application database, the Ledger, the
filesystem, a document, or an evidence export. The current CUA kernel also
had no verifiable developer-held token value. The raw token is therefore
runtime-volatile:

`RAW_TOKEN_RUNTIME_VOLATILE`

Because the original tab/runtime is unavailable and no persistent or live
holder can be verified, continuity is classified as:

`RAW_TOKEN_CONTINUITY_LOST`

The token itself is not included in this document or any output.

## 4. Window, session, and collector sources of truth

The following values are module-local variables in
`directChatMemoryLongEvidenceCollector.ts`:

- `activeWindow` contains the window ordinal, token salt, and fingerprint.
- `windowState`, `lastWindowOrdinal`, and `lastWindowFingerprint` are local
  lifecycle/debug state.
- `currentSessionOrdinal`, `sessionOrdinalCounter`, `sessionNonce`, and
  `currentSessionFingerprint` are local session state.
- `records` is the bounded in-memory collector buffer.
- `configured` is the collector enabled flag.

`persistenceMode: "in_memory_only"` describes this collector buffer and its
runtime control/session state. It is not a durable window or token store.

The formal window fingerprint is `reviewerFingerprint("window", token)`, two
deterministic FNV-style 32-bit lanes over the supplied token. The same raw
token deterministically produces the same window fingerprint in a fresh
runtime. Session fingerprints additionally include a fresh governed random
session nonce, so a resumed session is a new session even when the window
fingerprint is unchanged.

`resumeWindow(token)` requires the collector to be configured and the original
raw token to be supplied. If no `activeWindow` exists, it reconstructs a
window object from that token and starts a fresh session; it does not recover
old records, ordinals, or prior page state. Thus a fresh JS runtime is
theoretically resumable only when the same raw token is still available; this
condition is not met in the current environment.

## 5. Canary and shadow lifecycle

Canary (`directChatMemorySafetyVetoCanary.ts`), safety-veto shadow
(`directChatMemorySafetyVetoShadow.ts`), and admission shadow telemetry
(`directChatMemoryAdmissionShadowTelemetry.ts`) keep their enabled flags and
record buffers in module-local variables. Their exports explicitly report
`persistenceMode: "in_memory_only"`. They have no localStorage,
sessionStorage, IndexedDB, filesystem, or Ledger-backed toggle state.

On a new page/JS runtime they initialize disabled with empty in-memory
records. A tab loss or browser restart therefore loses their runtime state;
the current runtime state could not be read because the original tab is gone.

## 6. Persisted storage boundaries

| State | Source of truth | Refresh/tab loss/browser restart |
| --- | --- | --- |
| raw window token | module-local `activeWindow.salt` / external developer holder | lost; not persisted |
| window fingerprint/state/ordinal | collector module variables | reset/lost |
| session nonce/fingerprint/ordinal | collector module variables | reset/lost |
| collector records | collector module `records` | reset/lost |
| collector enabled | collector module `configured` | reset to disabled |
| Canary enabled/records | Canary module variables | reset to disabled/empty |
| shadow enabled/records | shadow module variables | reset to disabled/empty |
| Chat/AI Ledger | localStorage key `fanfan_ai_request_ledger_v1` | independently durable; not a resume source |
| canonical Memory/Summary/Projection | their existing application repositories | independent of evidence runtime |
| authoritative evidence | full sanitized files under `docs/evidence/...` | durable and reviewer-readable |

No long-evidence runtime control state is written to sessionStorage or
IndexedDB. The Ledger contains accounting metadata only and cannot reconstruct
the interrupted window/session. The existing disk artifact remains the sole
promotion authority.

## 7. Interrupted-session authority

The interrupted session/turn had no newly persisted full sanitized artifact.
It can never become authoritative by inference. If the runtime cannot be
recovered, its classification is:

`INTERRUPTED_RUNTIME_NON_AUTHORITATIVE_UNRECOVERABLE`

No replacement window or token is authorized by this audit.

## 8. Disk authoritative baseline

The reviewer was rerun against the one real full sanitized artifact only;
the recovery manifest and Markdown files were excluded. Result:

```text
status = ok
authoritativeArtifactCount = 1
formalSessionCount = 1
distinctExactScopeCount = 1
extractionBatchCount = 1
validControlCount = 1
validSuppressionCount = 0
logicalActionTotal = 1
physicalAttemptTotal = 2
firstEvidenceDay = 2026-09-10
distinctEvidenceDayCount = 1
windowCount = 1
mixedWindow = false
```

The lost runtime contributes nothing to these counters.

## 9. Test-count reporting audit

The `npm test` runner discovers `*.test.ts` and `*.test.tsx` files under
`scripts/`. Static Git-tree counts are:

- HEAD `d29d6fd...`: 536 test files (the source of the earlier `536/536`
  report).
- HEAD `396ddc8...`: 571 test files.
- Current HEAD `c78b4bfa...`: 587 test files (the source of the current
  `587/587` baseline).

From `d29d6fd...` to current HEAD, 52 test files were added and none were
deleted. Therefore `536/536` is stale for the current HEAD, not evidence that
tests were removed. No full test run was performed in this audit.

## 10. Final classification and recommendation

Final recoverability classification:

`LONG_EVIDENCE_RAW_TOKEN_CONTINUITY_LOST`

The browser descriptor and dev server remain available, but the original tab,
its JS module memory, and the developer-held token are not recoverable through
the current tooling. Keep the existing authoritative artifact and campaign
boundary unchanged. Do not create a replacement window/token. A separately
approved design stage must decide whether to close the old campaign and how a
new campaign may accumulate evidence. Only after that approval should a new
controlled evidence campaign be considered.

