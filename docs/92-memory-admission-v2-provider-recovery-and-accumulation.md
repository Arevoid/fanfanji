# Stage 4D-11O-RG1-R2 — Provider Runtime Recovery and Accumulation

Date: 2026-09-11  
Starting refactor HEAD: `ff88dc1b6ae4962fdb2963ace50bfbea6f338064`  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`

Readiness: `R2_RESPONSE_FORMAT_BLOCKED`

This stage stopped at the first unhealthy post-probe accumulation turn. No
governed Window, raw token, collector, Shadow, Canary, automatic extraction,
`extractNow()`, threshold change, fixture reset, history deletion, or Campaign
evidence operation was performed.

## 1. Starting fixture and continuation audit

The exact isolated Direct Chat scope was healthy before sending anything:

```text
durable history: 22 (21 prior messages plus the retained failed-turn user message)
eligible after the existing archive cursor: 1
triggerCount: 20
distanceToTrigger: 19
archive marker: present and found in loaded scope
Memory: 0
inFlight: false
cooldown: false
```

The source audit confirmed that `lastImmediateSummaryMsgId` is a
processed-input cursor. Automatic Direct Chat counts only messages after that
cursor, successful zero-candidate passes advance it, failed passes leave it in
place, and module-level in-flight/cooldown guards prevent immediate replay.
The old 21-message range was not reprocessed. The retained user-only failed
turn was not deleted, edited, excluded, or replayed.

## 2. Provider preflight and recovery probe

The active runtime configuration was present and unchanged:

```text
provider type: server-proxy
model: 【仿生玫瑰】gemini-2.5-flash
endpoint: configured, api.ebutterfly.cc/v1
credential: configured
transport: backend_proxy
```

No credential, endpoint, model, preset, routing, or fallback setting was
modified. There were no pending Ledger rows after the previous aborted turn;
that prior `chat_reply` failure remains separately recorded as `aborted`.

One ordinary low-risk synthetic recovery probe was sent. It completed with one
successful `chat_reply` Provider attempt, no retry/fallback, usable assistant
delivery, released loading state, and durable readback. The inspector advanced
from eligible `1` / distance `19` to eligible `3` / distance `17`.

## 3. Bounded accumulation result

The next ordinary accumulation turn also completed successfully with one
Provider attempt and no retry/fallback. The inspector advanced to eligible `5`
and distance `15`.

The following turn was the first unhealthy turn. The Provider transport rows
were successful, but the request required a `format_validation` retry and no
usable assistant bubble was delivered. The UI returned to an idle state, the
new user message remained durable, and the inspector reported eligible `6`
and distance `14`. No assistant record was manufactured.

This is classified as category F from the stage contract: Provider returned,
but the response-format/parser-to-delivery path did not produce a usable Direct
Reply. The stage readiness is therefore `R2_RESPONSE_FORMAT_BLOCKED`; it is
not treated as a trigger, extraction, or evidence result.

## 4. Safety and accounting boundary

Automatic extraction remained at zero because the fixture never reached the
20-message boundary. No marker/cursor changed, Memory remained empty, and no
background extraction activity was observed. No Window, session fingerprint,
Campaign token, collector export, reviewer artifact, or Canary record was
created. The Campaign manifest and authoritative counts remained unchanged:

```text
approved/closed windows: 3/3
artifacts: 2
sessions: 2
promotion scopes: 1
batches: 2
controls: 2
suppressions: 0
zeroCandidateBatchCount: 0
logical/physical: 2/4
distinct UTC days: 2
stickyFailure: false
promotionEligible: false
```

The isolated fixture now contains the retained prior failed user message, the
successful recovery probe, one successful accumulation turn, and the latest
user-only failed turn. No user production data was touched.

## 5. Validation and next step

The controller, Cheap Filter, fallback, and dedicated-scope seam tests passed
before runtime. The inherited refactor baseline remains 595/595 tests, lint
pass, build pass, and dependency gate pass (105 allowlisted edges / 3 cycles).
No production or dev source code changed in this stage; only this report was
added. The failed runtime turn must be diagnosed/recovered before any further
accumulation. The next approved step should resume this same RG1-R2 line after
response-format/runtime recovery; do not create a governed Window or enter
RG1-R3/RG2 from this blocked state.
