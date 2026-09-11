# Stage 4D-11O-R6 — Accelerated Bounded Accumulation to Trigger Boundary

## Scope and starting state

This stage continued the existing dedicated synthetic Direct Chat fixture at
`http://127.0.0.2:3000/`. No fixture reset, bootstrap, deletion, Window,
Campaign token, collector, Shadow, Canary, or extraction was performed. The
starting refactor HEAD was `9264d0dcd1b2741d05601187c5ddabbadac736bd`; the
stable original worktree remained at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

The authoritative starting state matched the expected R6 baseline: durable
and exact-scope messages 9, eligible 9, trigger 20, distance 11, marker
absent, Memory 0, exact scope healthy, no in-flight/cooldown state, and
`nextTurnTriggers=false`. The configured Provider remained the same custom
OpenAI-compatible preset and model as prior stages; endpoint and credential
presence were checked without exposing secrets.

## Turn-by-turn accumulation

Five ordinary, low-risk synthetic user turns were attempted. No turn included
memory instructions, suppression language, special formatting, parser edge
cases, or prompt-injection content. Every turn passed the required Provider,
assistant delivery, durability, and Inspector checks.

| Point | Durable | Eligible | Trigger | Distance | Marker | Scope | In-flight | Cooldown | Next turn |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Start / Turn 1 pre | 9 | 9 | 20 | 11 | absent | healthy | false | false | false |
| Turn 1 post | 11 | 11 | 20 | 9 | absent | healthy | false | false | false |
| Turn 2 pre | 11 | 11 | 20 | 9 | absent | healthy | false | false | false |
| Turn 2 post | 13 | 13 | 20 | 7 | absent | healthy | false | false | false |
| Turn 3 pre | 13 | 13 | 20 | 7 | absent | healthy | false | false | false |
| Turn 3 post | 15 | 15 | 20 | 5 | absent | healthy | false | false | false |
| Turn 4 pre | 15 | 15 | 20 | 5 | absent | healthy | false | false | false |
| Turn 4 post | 17 | 17 | 20 | 3 | absent | healthy | false | false | false |
| Turn 5 pre | 17 | 17 | 20 | 3 | absent | healthy | false | false | false |
| Turn 5 post | 19 | 19 | 20 | 1 | absent | healthy | false | false | true |

Each completed turn added two scoped messages (one user and one assistant),
one `chat_reply` logical ledger record, and one physical Provider attempt.
All five latest records reported `status=success`,
`providerRequestCount=1`, `retryCount=0`, no format repair, and no fallback.
Assistant delivery and `durableCompletion` were confirmed on every turn;
there were no duplicate IDs or persistence warnings. The Ledger increased
from 15 to 20 records (`chat_reply` 9 to 14); no new background AI activity
appeared.

## Trigger safety decision

At the fifth pre-inspector, `distanceToTrigger=3` and
`nextTurnTriggers=false`. A normal turn could add at most the observed two
messages and therefore remained below the trigger boundary. After turn 5 the
authoritative Inspector reported `eligibleMessageCount=19`,
`distanceToTrigger=1`, and `nextTurnTriggers=true`. The trigger boundary was
therefore reached without sending the next trigger turn. No extraction was
performed and no automatic extraction was observed.

## Reload checkpoint

The single stage-end reload was executed after accumulation stopped. Before
reload, the authoritative `messages-v4` snapshot contained 19 records (10
user, 9 assistant), all exact-scoped, with zero duplicate IDs. After hydration
the snapshot remained 19 records with the same role counts; opaque ID-set,
user-ID, and assistant-ID hashes matched. The UI history and composer were
restored, and Inspector remained stable at `ready` with eligible 19, trigger
20, distance 1, marker absent, exact scope healthy, no in-flight/cooldown
state, and `nextTurnTriggers=true`.

## Safety invariants and readiness

- Automatic extraction: 0; `extractNow()`: 0; Memory writes: 0.
- Archive marker: absent.
- Campaign unchanged: approved/closed `2/2`, artifacts `2`, sessions `2`,
  scopes `1`, batches `2`, controls `2`, suppressions `0`, days `2`,
  `stickyFailure=false`, `promotionEligible=false`.
- No Window, token, preapproval, collector, Shadow, or Canary was created.
- No Provider, persistence, response-format, duplicate-ID, or unexplained
  runtime failure occurred.
- Production and dev runtime code were not changed; this document is the only
  change in this stage.

The starting automated baseline remains applicable: 595/595 tests, lint,
build, and dependency gate (105 allowlisted edges / 3 cycle baselines) had
already passed. No code changed in R6, so the suites were not mechanically
rerun.

Readiness: `DEDICATED_ACCUMULATION_TRIGGER_READY`.

Recommended next stage: `Stage 4D-11O-RG1 — Governed Trigger Window Preparation
+ Trigger Execution`. RG1 is not started automatically.
