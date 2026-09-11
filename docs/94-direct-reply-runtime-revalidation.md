# Direct Reply Runtime Revalidation

Stage: 4D-11O-R2B  
Date: 2026-09-11  
Starting refactor HEAD: `3d4cf0ea510831f12322bdbd9186dcaff3c33ca9`  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`

Readiness: `DIRECT_REPLY_RUNTIME_STABLE_TRIGGER_READY`

## Scope and safety

The dedicated isolated fixture was not reset or re-created. Its pre-probe
inspector state was `exactScopeHealth=true`, `durable=27`,
`eligibleMessageCount=6`, `triggerCount=20`, `distanceToTrigger=14`,
`archiveMarkerPresent=true`, `Memory=0`, `inFlight=false`,
`cooldownActive=false`, and `nextTurnTriggers=false`. All prior user-only
failed turns remain intact. No Window, session token, collector, reviewer,
Canary, Campaign mutation, manual extraction, or `extractNow()` call was made.

The existing parser fix was verified in the active Vite source and loaded by a
normal page reload. A dev-only bounded lifecycle observer was available at
`window.__fanfanjiDirectReplyLifecycle`. It stores only stage, sequence,
timestamp, candidate count, and delivered count in memory (maximum 64 events);
it never stores response text, Prompt, message content, credentials,
Authorization, or request IDs.

## Controlled probe and bounded accumulation

One ordinary low-risk synthetic probe was sent, followed by five ordinary
synthetic accumulation turns. Each turn completed before the next inspector
read. Every turn had this lifecycle:

```text
initial_parse_success
candidate_created(candidateCount=1)
delivery_success(deliveredCount=1)
```

No turn requested repair, reached `repair_parse_*`, emitted
`terminal_response_format`, or emitted `candidate_no_response`. The six recent
Ledger rows were all `purpose=chat_reply`, `status=success`,
`providerRequestCount=1`, `retryCount=0`, `fallbackCount=0`,
`errorCategory=none`, and `transport=backend_proxy`. No non-chat Ledger row was
created during this run.

The authoritative inspector advanced as follows:

| checkpoint | eligible | distance | nextTurnTriggers | exact scope | marker |
| --- | ---: | ---: | --- | --- | --- |
| pre-probe | 6 | 14 | false | healthy | present |
| post-probe | 8 | 12 | false | healthy | present |
| post-accumulation 1 | 10 | 10 | false | healthy | present |
| post-accumulation 2 | 12 | 8 | false | healthy | present |
| post-accumulation 3 | 14 | 6 | false | healthy | present |
| post-accumulation 4 | 16 | 4 | false | healthy | present |
| post-accumulation 5 | 18 | 2 | true | healthy | present |

No automatic extraction occurred. `Memory` remained zero and the archive
marker/cursor did not change. Provider type, model, endpoint, credential,
preset, and fallback policy were not changed.

## Durability and reload checkpoint

Before reload, the canonical metadata snapshot contained 39 durable messages
(21 user-authored and 18 character-authored records) with zero duplicate ID
groups. After a normal reload and reopening the same dedicated conversation,
the UI restored all messages and the inspector still reported
`eligibleMessageCount=18`, `distanceToTrigger=2`, marker present, exact scope
healthy, `inFlight=false`, `cooldownActive=false`, and `nextTurnTriggers=true`.
The durable snapshot remained 39 messages with zero duplicate ID groups.

The recent Ledger purpose set after reload remained only `chat_reply` with six
rows and six physical attempts. No duplicate Provider call, assistant bubble,
automatic extraction, or retrigger occurred on reload. The lifecycle observer
correctly reset its in-memory event list on reload; persisted monitoring data
was unaffected.

## Conclusion

The R2A structured-missing-reply parser fix is runtime-compatible on this
Provider path: the controlled probe and all five bounded accumulation turns
were delivered normally without format repair or candidate loss. This does not
prove that the earlier historical blocker was caused by that exact parser
shape; the historical C/E distinction remains unproven without prohibited raw
response data. The fixture is now intentionally parked at the next trigger
boundary (`distanceToTrigger=2`) for a separately approved governed trigger
revalidation stage.

Next stage: `Stage 4D-11O-R3 — Governed Trigger Revalidation`. Do not execute it
automatically.
