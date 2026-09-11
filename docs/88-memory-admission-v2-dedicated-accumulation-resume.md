# Stage 4D-11O-R5R — Resume Dedicated Bounded Accumulation

## Scope and starting state

This stage resumed the existing dedicated synthetic Direct Chat fixture at
`http://127.0.0.2:3000/` without recreating or resetting any fixture data. The
starting refactor HEAD was `589e0d52ebede163daa28d0f257f48d32c492ca3`; the
stable original worktree remained at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

The persisted starting state was three exact-scope messages (two user and one
assistant), with `eligibleMessageCount=3`, `triggerCount=20`,
`distanceToTrigger=17`, no archive marker, Memory count zero,
`exactScopeHealth=true`, `inFlight=false`, `cooldownActive=false`, and
`nextTurnTriggers=false`. The active Provider preset remained configured as
the custom OpenAI-compatible runtime with model
`【仿生玫瑰】gemini-2.5-flash`; endpoint host and credential presence were
verified without exposing secrets.

## Turn-level evidence

Each turn used ordinary low-risk synthetic conversation text. No memory
instruction, suppression phrase, parser edge case, prompt injection, or
special output request was used. Each turn completed the required sequence:
pre-inspector, one user message, Provider request, assistant delivery,
durability completion, and post-inspector.

| Point | Durable total | User | Assistant | Eligible | Trigger | Distance | Marker | Scope | In-flight | Cooldown | Next turn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Start | 3 | 2 | 1 | 3 | 20 | 17 | absent | healthy | false | false | false |
| Turn 1 pre | 3 | 2 | 1 | 3 | 20 | 17 | absent | healthy | false | false | false |
| Turn 1 post | 5 | 3 | 2 | 5 | 20 | 15 | absent | healthy | false | false | false |
| Turn 2 pre | 5 | 3 | 2 | 5 | 20 | 15 | absent | healthy | false | false | false |
| Turn 2 post | 7 | 4 | 3 | 7 | 20 | 13 | absent | healthy | false | false | false |
| Turn 3 pre | 7 | 4 | 3 | 7 | 20 | 13 | absent | healthy | false | false | false |
| Turn 3 post | 9 | 5 | 4 | 9 | 20 | 11 | absent | healthy | false | false | false |

All three turns were healthy. Each added one `chat_reply` logical record and
one physical Provider attempt, with the configured server-proxy transport,
`retryCount=0`, no format repair, no fallback, one usable candidate, one
assistant delivery, successful durable completion, and no persistence warning.
The Ledger grew from 12 to 15 records, entirely through the three new
`chat_reply` entries; no new background AI activity appeared.

## Durability and reload checkpoint

After the third turn, the authoritative
`FanfanjiReadingMetadataDB.metadata["messages-v4"]` snapshot contained nine
records, all in the exact scope, with zero duplicate IDs. A single stage-end
reload was then executed without sending another message. After hydration:

- durable total remained 9 (5 user, 4 assistant);
- the opaque ID-set, user-ID, and assistant-ID hashes matched the pre-reload
  checkpoint;
- exact-scope health remained true and Inspector stayed `ready`;
- eligible remained 9, trigger remained 20, distance remained 11;
- marker remained absent, with no in-flight/cooldown state and
  `nextTurnTriggers=false`;
- the chat history and composer were restored in the same order;
- no duplicate bubble, loading state, storage warning, or runtime error was
  observed.

Raw IDs, message正文, Prompt, complete responses, credentials, and raw
Provider bodies are intentionally not recorded.

## Safety invariants and readiness

- Automatic extraction: 0.
- `extractNow()`: 0.
- Memory writes: 0.
- Archive marker: absent.
- Campaign unchanged: approved/closed `2/2`, artifacts `2`, sessions `2`,
  scopes `1`, batches `2`, controls `2`, suppressions `0`, days `2`,
  `stickyFailure=false`, `promotionEligible=false`.
- No Window, token, preapproval, collector, Shadow, or Canary was created or
  used.
- Production and dev runtime code were not modified; this document is the
  only change in this stage.

Starting automated validation remained applicable: 595/595 tests, lint,
build, and dependency gate (105 allowlisted edges / 3 cycle baselines) had
already passed at the starting HEAD. No code changes occurred in R5R, so the
full suites were not rerun.

Readiness: `DEDICATED_ACCUMULATION_RESUME_VALIDATED`.

Recommended next stage: `Stage 4D-11O-R6 — Dedicated Bounded Accumulation #2`.
R6 is not started automatically.
