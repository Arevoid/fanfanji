# Stage 4D-11O-RP — Provider Configuration Recovery

Status: `PROVIDER_CONFIGURATION_RECOVERED_REAL_PROBE_VALIDATED`

Starting refactor HEAD: `55fd5d5091dcf73c25753686b919c6bb89205919`  
Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`  
Campaign: `campaign-memory-admission-v2-2026-09-10`

## Failure symptom and layer

The previous Stage 4D-11O attempt stopped during the Direct Chat reply. The
server-side `server-proxy` path returned HTTP 404 for a native Gemini-shaped
request route (`/v1beta/models/...:generateContent`). This is a routing/configuration
failure, not evidence of a missing, expired, revoked, or quota-exhausted key.

Static inspection of `src/server/textProtocolAdapters.ts` and `src/utils/apiHelper.ts`
shows the explicit branch:

- a non-empty `apiEndpoint` uses the OpenAI-compatible adapter and appends
  `/chat/completions`;
- an empty `apiEndpoint` uses the native Gemini adapter and constructs
  `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

Therefore the failed request reached the native-Gemini branch while carrying a
custom-proxy model alias. The exact time or source of the stale/empty runtime
value cannot be recovered from the previous page, but the branch condition and
the observed route are conclusive. No Provider adapter defect was established.

## Current and last-known-good configuration

The current active local preset is `preset-gemini` (user-visible name
`蝴蝶`). Its safe configuration summary is:

- provider: `server-proxy`;
- provider type: OpenAI-compatible custom endpoint;
- base URL pattern: `https://api.ebutterfly.cc/v1`;
- endpoint template: `{base}/chat/completions`;
- model: `【量子花园】gemini-3.5-flash`;
- credential: configured (the value is intentionally not recorded).

The last-known-good real extraction records also used `server-proxy` with the
active configured model and completed through the existing Provider path. Their
privacy-safe documents intentionally do not retain the exact base URL. The
current settings were restored in the existing `phone_settings` user storage;
the exact historical change timestamp is unknown.

## Static validation and isolated probe

The existing routing tests passed:

- custom models are preserved for the OpenAI-compatible adapter;
- `/chat/completions` composition is used for custom endpoints;
- the native Gemini path is reserved for an empty custom endpoint;
- Provider 4xx responses are not retried through a second transport.

One and only one new synthetic message was sent in the existing isolated
`Stage4D3 临时样本` Direct Chat. No evidence Window, collector, admission
shadow, Safety-veto Canary, or Memory extraction was enabled or called.

Probe result:

- one logical `chat_reply` request;
- one Provider attempt;
- HTTP success through `server-proxy`;
- complete assistant reply;
- no duplicate reply and no stuck loading state;
- no new `memory_extract` record;
- no Prompt, response body, API key, Authorization header, or raw Provider
  response was exported or persisted by the audit.

Existing background `moment_generate` records were unrelated to the probe and
did not alter Memory evidence or the Campaign.

## Campaign and product invariants

The Campaign remained unchanged and paused:

```text
approved/closed windows 2 / 2
authoritative artifacts 2
formal sessions 2
promotion scopes 1
batches 2
controls 2
suppressions 0
logical actions 2
physical attempts 4
distinct evidence days 2
stickyFailure false
promotionEligible false
```

The previously aborted pre-evidence Window was not restored or counted. No
closure artifact was created for it. No Memory authority, Prompt, Provider
implementation, retry/fallback policy, storage schema, or production user data
was changed.

## Readiness and next step

Readiness is `PROVIDER_CONFIGURATION_RECOVERED_REAL_PROBE_VALIDATED`.

The next step is a separately approved rerun of Stage 4D-11O. It must create a
new private token and a new approved Window; it must not reuse the aborted
Window. This stage stops here and does not collect Memory evidence.
