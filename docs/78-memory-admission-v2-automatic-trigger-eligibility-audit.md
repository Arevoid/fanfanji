# Stage 4D-11O-R2 — Automatic Trigger Eligibility Audit

Date: 2026-09-11  
Starting/final refactor HEAD: `af94ff0ddb4c786656c629757ef263b64c928294`  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`  
Campaign: `campaign-memory-admission-v2-2026-09-10`

Readiness: `NO_SAFE_AUTOMATIC_TRIGGER_FIXTURE_AVAILABLE`

This is a read-only eligibility audit. No evidence Window, token, collector,
Admission Shadow, Safety-veto Canary, Provider request, chat message, automatic
extraction, `extractNow()` call, threshold override, archive-marker mutation,
synthetic repository injection, production-code change, or user-data change was
performed. The only repository change is this audit document.

## 1. Automatic trigger contract

The production entry is `createChatSideEffectController().afterReplySuccess()`
in `src/features/chat/controllers/chatSideEffectController.ts`. The normal
Direct Reply path reaches it through `postReplyCoordinator.schedule()` only
after `executeDirectReplyTurn()` has delivered at least one assistant message;
`DirectReplyUseCase` does not invoke its post-reply adapter for an empty or
failed delivery. The extraction task itself is scheduled 200 ms later and is
not awaited by the user-visible reply.

The actual calculation is:

```text
configuredRounds = activeCharacter.summaryTriggerRound
rounds = clamp(round(configuredRounds), 10, 100), or 50 when absent/non-finite
triggerCount = rounds * 2
eligibleMessages = currentChatMessages + user message + created assistant messages
eligibleMessages = messages after relation.lastImmediateSummaryMsgId, when the
                   marker is present in the loaded list
trigger when eligibleMessages.length >= triggerCount
```

Therefore the threshold unit is **message count**, not token count, character
count, wall-clock time, or a durable job count. “Round” is a product-facing
setting whose implementation treats two messages as one round. The setting is
configurable per character in `AppMemory` (10–100, default 50), persisted with
the character; it is not a dev-only setting and is not a single hardcoded
constant. The legacy `enableAutoSummary` field is not consulted by the current
controller; the existing test locks that behavior. No change was made to this
rule.

For a non-group Direct Chat, the application resolves an exact
`characterId + relationId + userIdentityId + conversationId` scope before the
hook can perform extraction. Group Chat uses a separate path. Offline returns
before this automatic Direct Chat calculation, and manual extraction passes an
explicit message list that bypasses the automatic threshold/marker decision.

The relation archive marker (`lastImmediateSummaryMsgId`) is a processed-input
cursor, not proof that every projection or side effect completed. When found,
messages at or before it are excluded. If the marker is not in the loaded list,
the hook conservatively reprocesses the loaded list rather than silently
discarding content. A successful zero-candidate pass and a safe Cheap Filter
skip advance the existing cursor; an extraction/provider/write failure leaves
it unchanged and applies the five-minute in-memory failure cooldown. The
module-level in-flight set prevents duplicate scheduling within a runtime.

The assistant reply is therefore required for the normal automatic path (the
post-reply adapter runs only after delivery), but the memory Provider call is
background work after delivery. One threshold hit can produce more than one
`memory_extract` call: `useChatMemoryExtraction` splits the eligible messages
into sequential batches using `historyMemoryLimit`, clamped to 10–200. The
number of batches is `ceil(eligibleMessages / batchSize)`; with the usual 100
message threshold and default batch size it is one, while a smaller configured
batch size can produce several. No second summary Provider call is introduced
by this trigger.

## 2. Eligibility formula used for this audit

An evidence fixture is considered eligible only when all of the following hold:

```text
eligibleForNextAutomaticExtraction =
  non-group Direct Chat
  AND active exact relation scope (character/relation/identity/conversation)
  AND eligibleMessages.length >= clamp(summaryTriggerRound, 10..100) * 2
  AND no in-flight extraction for the relation
  AND no active five-minute failure cooldown
  AND isolated, non-production data
  AND the next normal user turn + successful assistant delivery can reach the gate
```

The last condition is deliberately stricter than “a test can call a function”:
it excludes mocks, migration fixtures, direct repository seeding, threshold
overrides, and manually forced extraction.

## 3. Candidate fixture audit

No message body, raw scope ID, user backup, or production conversation was
read or emitted. Counts below are metadata-only.

| Fixture label | Classification | Direct one-to-one | Total / eligible count | Marker | Distance to trigger | Next normal turn | Evidence-safe | Reason |
|---|---|---:|---:|---|---:|---|---:|---|
| `Stage4D3 临时样本` | developer/local isolated runtime fixture | yes | last reachable runtime read: 3 total; exact pending count is not recoverable without the lost page, so the conservative bound is ≤3 | present | at least 97 messages (100-message default threshold) | no | no | The fixture is far below the default threshold; the previous one-turn continuation consequently could not trigger. The current browser has no accessible tab and the dev endpoint is not serving, so no new runtime read or interaction was attempted. |
| `chatSideEffectController.test.ts` threshold fixture | test-only in-memory synthetic | shape yes | 20 eligible messages with `summaryTriggerRound=10` | none in test input | 0 | only the unit callback would run | no | No durable app scope or real Provider path; not a runtime evidence fixture. |
| `memoryExtractionCheapFilterWiring.test.ts` threshold fixture | test-only in-memory synthetic | shape yes | 20 eligible messages with `summaryTriggerRound=10` | none in test input | 0 | only the mocked extraction callback would run | no | Unit seam for Cheap Filter behavior, not persisted Direct Chat data. |
| `fixedMigrationDataset` direct relation A | migration-test dataset | shape yes | 400 direct messages in a mixed 1,000-message dataset | none | 0 | unknown | no | Migration fixture, mixed with another direct scope and group records; using it would require prohibited synthetic injection and would not represent a normal runtime conversation. |
| `fixedMigrationDataset` direct relation B | migration-test dataset | shape yes | 400 direct messages in a mixed 1,000-message dataset | none | 0 | unknown | no | Same migration/injection limitation as relation A; not an existing dev conversation. |

The first row is the only real isolated runtime fixture found. Its last
reachable metadata read confirmed the character and relation existed, three
scoped messages were present, and an archive marker was present. The marker's
raw message ID and exact position were intentionally not exported; the current
browser runtime is unavailable, so an exact pending count cannot be safely
reconstructed from disk. Even the conservative upper bound (three pending)
leaves at least 97 messages before the default 100-message gate. One normal
turn adds only the delivered user/assistant pair and therefore cannot make this
fixture eligible. It is not selected for long evidence.

No historical persisted Direct Chat fixture with a safe, naturally reachable
next-turn threshold was found. The existing test and migration data are useful
for unit characterization only and are explicitly excluded from real evidence.

## 4. Stage4D3 conclusion

The temporary fixture is not permanently invalid as a product conversation, but
it is unsuitable for the current long-evidence campaign: it is far from the
production threshold, the exact runtime marker position is unavailable, and
the runtime continuity needed for a read-only recheck is lost. Continuing would
require either many normal turns, a threshold/configuration change, manual
extraction, or synthetic data—all disallowed in this stage.

No automatic archive or extraction happened in this audit. The prior one-message
continuation did not trigger because the post-marker eligible message count was
well below `summaryTriggerRound * 2`; it was not a Provider, parser, or V2
policy failure.

## 5. Background `moment_generate` routing debt

The previously observed startup `moment_generate` HTTP 404 came from the
character-Moments scheduler (`checkAndTriggerCharacterMoments` in `AppChat`),
which calls `generateCharacterMomentPipeline` and ultimately the shared
`apiChat` wrapper. It is not part of the Direct Chat automatic-memory trigger.
The shared wrapper can select the native Gemini route when the endpoint value
seen by that runtime is empty, while the recovered custom endpoint uses the
OpenAI-compatible `/chat/completions` route. The observation is therefore
consistent with a stale/empty endpoint source in that background runtime, not
with a Memory fixture eligibility failure. It remains an independent
`BACKGROUND_PROVIDER_ROUTING_DEBT`; it was not modified here.

## 6. Invariants and stop state

- Provider requests: `0` in this audit.
- Messages sent: `0`.
- Memory extraction requests: `0`.
- `extractNow()` calls: `0`.
- Evidence Window/token/collector/shadow/Canary: not created or enabled.
- Archive marker and application state: unchanged.
- Campaign manifest: unchanged; approved/closed windows `2/2`, artifacts `2`,
  formal sessions `2`, exact promotion scopes `1`, batches `2`, controls `2`,
  suppressions `0`, evidence days `2`, sticky failure `false`, promotion
  eligible `false`.
- Production code, Prompt, Provider, threshold, storage schema, and user data:
  unchanged.
- Added helper/tests: none. Existing trigger, archive-boundary, and dev-guard
  tests passed; no full suite was needed for this documentation-only audit.

## 7. Readiness and next step

`NO_SAFE_AUTOMATIC_TRIGGER_FIXTURE_AVAILABLE` is the only safe readiness state
for this result. Do not enter the long-evidence continuation with the current
fixture. The next stage should be a separately approved **Dedicated Long-
Evidence Fixture Design** that defines a non-production lifecycle capable of
reaching the unchanged production threshold through ordinary bounded turns,
without threshold changes, bulk seeding, repository injection, or Provider
policy changes. Keep all current campaign controls disabled.

