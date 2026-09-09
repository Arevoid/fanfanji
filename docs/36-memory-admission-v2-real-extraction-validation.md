# Memory Admission V2 real extraction validation

## Stage 4D-3A scope

Starting refactor baseline: `5f7c84c4a00ee06df2e2e61e6e0027281ece2531`.
The original repository remains a separate, unchanged checkout at
`f515f7408cfe19da145f15a8ddffceae06e608d`.

This stage adds only a development-build trigger for the existing Direct Chat
memory extraction path. It is not a production cutover and it does not change
the automatic extraction threshold, user settings, prompt, provider, parser,
or admission authority.

## Existing automatic boundary

`chatSideEffectController` derives the configured round count from
`activeCharacter.summaryTriggerRound`, clamps it to 10–100 rounds, and uses 50
rounds when it is absent or non-finite. The trigger requires twice that count
of eligible messages after the relationship archive cursor, an active
relationship, and a non-group Direct Chat. The Direct Chat cheap filter can
also advance the existing cursor without an extraction request. A scheduled
request is guarded per relationship and has a five-minute failure cooldown.

The previous ten-round/20-message browser run did not create `memory_extract`
evidence because this runtime's character used the default 50-round boundary;
it was below the 100-message trigger count. No production threshold was
lowered for this validation.

## Dev-only trigger

The development-only API is installed by `AppChat` as
`globalThis.__fanfanjiMemoryAdmissionTest.extractNow()` and is absent from
test/production-style module evaluation. It has no polling and no persisted
state. It first requires the current exact `activeDirectScope` (character,
relationship, identity, and conversation ownership are resolved by the
existing runtime scope) and then uses the current conversation messages.

The trigger invokes the existing `useChatMemoryExtraction` seam with
`persistenceMode: "observation_only"`. The real Provider request, parser,
runtime source binding, legacy diagnostics, and Admission Shadow observation
run unchanged. Before canonical persistence, the explicit run returns without
writing KnowledgeClaims, Conversation Summaries, ProjectionJobs, or the
archive cursor.

The API returns metadata only: status, scope/message availability, whether the
real extraction request was reached, candidate count, Shadow counts before and
after, and the persistence mode. It does not return chat text, prompts, raw
responses, source IDs, candidate IDs, scope IDs, secrets, or exceptions.

## Tests

`scripts/directChatMemoryAdmissionDevTrigger.test.ts` covers the dev guard,
active-scope requirement, real seam references, privacy boundary, and the
observation-only branch ordering before canonical writes. Existing extraction,
Shadow, canonical-write, cursor, projection, and AI-accounting tests remain in
the full suite.

## Real browser attempt

The refactor dev server started successfully at `http://localhost:3000` and the
side browser exposed both the Shadow debug API and the new test API. The
currently available Direct Chat scope was valid, but its message list was
empty in this browser session; the earlier test conversation was not persisted
across the prior server/browser session. Calling `extractNow()` therefore
returned `NO_MESSAGES`, with `providerRequestObserved: false`, Shadow count
0 before/after, and no Ledger change. No new messages were sent and no
synthetic transcript or fake observation was injected.

Consequently this run did not produce a real `memory_extract` Ledger record or
`real_runtime` Shadow evidence. Taxonomy, mismatch, P0–P4, and privacy
statistics for a real extraction sample remain `not_observed_in_real_sample`.

## Readiness

`BLOCKED — NEED MORE REAL EVIDENCE`: the code path is ready for a future run
with an existing persisted Direct Chat conversation, but this run cannot claim
real Provider or Shadow evidence without sending a new large transcript or
fabricating one. No production cutover or canary design is authorized by this
document.
