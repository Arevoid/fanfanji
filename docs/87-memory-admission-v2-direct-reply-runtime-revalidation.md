# Stage 4D-11O-R5E-R1 — Direct Reply Completion and Message Reload Real Runtime Revalidation

## Scope

This stage revalidated one real Direct Chat turn in the existing isolated
fixture at `http://127.0.0.2:3000/`. No identity, character, relation,
conversation, scope, Provider adapter, Prompt, Memory, Admission, Campaign,
or production code was changed. The existing synthetic fixture and its prior
durable user record were retained.

Starting refactor HEAD was `cd65dc8b0c15d4d3908eb76b105047993b0bfd25`.
The stable original worktree remained at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

## Provider precheck

The active preset was configured (`蝴蝶`) with provider routing consistent with
the custom OpenAI-compatible runtime. The selected model was
`【仿生玫瑰】gemini-2.5-flash`. The endpoint was present at the host
`api.ebutterfly.cc`; credential configuration was present. No secret value,
Authorization header, request body, Prompt, or raw Provider response was
read or recorded.

## Real turn

Exactly one new low-risk synthetic user turn was sent after the existing
fixture was inspected. The request completed normally:

- one `chat_reply` logical ledger record was added;
- `providerRequestCount=1`, `retryCount=0`, and no fallback were recorded;
- final transport was the existing server-proxy path;
- no format-repair logical record was created for this turn;
- the response parser and validation path accepted a usable response;
- one reply candidate was created and one assistant message was delivered;
- the user message remained durable and the explicit durability completion
  boundary resolved successfully.

The existing ledger history contains older, unrelated format-repair and
background records; they are not attributed to this turn. No new
`moment_generate` activity appeared during the turn.

## Durable snapshot before reload

The pre-reload authoritative `FanfanjiReadingMetadataDB.metadata["messages-v4"]`
snapshot contained three records: two user records (the retained prior record
and the new turn) and one assistant record. All three records carried the
exact direct scope, duplicate ID count was zero, and no sensitive field names
were present. Memory count remained zero and no archive marker was present.

The post-turn Inspector reported:

| Field | Value |
| --- | ---: |
| `eligibleMessageCount` | 3 |
| `triggerCount` | 20 |
| `distanceToTrigger` | 17 |
| `archiveMarkerPresent` | false |
| `exactScopeHealth` | true |
| `inFlight` | false |
| `cooldownActive` | false |
| `nextTurnTriggers` | false |

## Reload and hydration

The page was reloaded once and allowed to hydrate before inspection. The
authoritative snapshot remained three records (two user, one assistant), with
zero duplicate IDs, all records still scoped, and no sensitive fields. The
existing user record, the newly created user record, and the assistant record
were all still represented after hydration; raw IDs are intentionally not
exported. The chat view restored the same message order and composer controls,
with no loading state or duplicate bubble observed.

The post-reload Inspector was stable at `ready` with the same exact-scope
health and the same admission counters (`eligibleMessageCount=3`,
`triggerCount=20`, `distanceToTrigger=17`, marker absent, no in-flight or
cooldown state, and `nextTurnTriggers=false`).

## Safety invariants

- Automatic extraction: 0.
- Dev-only `extractNow()`: 0.
- Memory writes: 0.
- Campaign/window/token/collector/shadow/canary state: unchanged and unused.
- No Prompt text, complete response, API key, Authorization value, or raw
  exception body entered the Ledger or this artifact.
- No persistence warning, Provider auth error, or runtime error was observed
  after reload.
- No production or dev runtime code changed in this stage; this document is
  the only new file.

## Validation reference and readiness

The starting HEAD had already passed the full local baseline: 595/595 tests,
lint, build, and dependency gate (105 allowlisted direction edges and three
cycle baselines). This stage made no code changes, so those results remain the
applicable automated baseline.

Readiness: `DIRECT_REPLY_AND_MESSAGE_RELOAD_REAL_RUNTIME_VALIDATED`.

The next step is a separately approved R5R design/review. Do not send another
real turn, alter the fixture, or begin Memory extraction in this stage.
