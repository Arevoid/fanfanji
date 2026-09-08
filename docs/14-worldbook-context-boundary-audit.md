# Stage 3B-8：WorldBook Context Boundary Audit

## 范围与结论

本审计只覆盖 direct normal / regenerate 的 WorldBook 运行路径，并把 group、offline、
diary、inner voice、Moments 等其他调用者列为共享实现的影响面。没有修改生产代码、
WorldBook 规则、Prompt 文案、Provider、Retry/Fallback、离线快照或存储 schema。

当前建议选择 **Option A：暂不抽取 WorldBook contributor**。现有
`buildWorldBookSystemBlocks` 已经是一个稳定的结构化边界，但其内部仍把 freshness
读取、scope/visibility、trigger 选择、文本投影和注入位置分组放在同一函数中；调用者
数量和场景差异也已经超过 direct reply 的安全抽取范围。贸然抽出 selection contributor
会同时改变 online、offline snapshot、group/public、diary 和 Moments 的调用协议。

Stage 3B-8 因此完成“真实边界审计 + 行为特征锁定”，不创建新的
`ContextContribution`、registry、universal WorldBook service 或空壳 abstraction。

## Direct normal / regenerate 真实链路

```text
user message / regenerate target
  → scan text preparation
      normal: current message + currentChatMessages.slice(-10)
      regenerate: current message + target-excluded previousMessages.slice(-10)
  → buildWorldBookSystemBlocks(..., { scenario: "chat", characterId, userIdentityId, relationId })
      → getVisibleWorldBookEntries
          → getLatestWorldBookEntries
              → loadWorldBookEntries (localStorage read, best effort)
          → isWorldBookEntryVisible / isWorldBookEntryForCharacter
      → trigger selection
          persona_rule / constant / keys / vector
      → depth sort
      → projection and placement
          structural slots + at_depth metadata + allTriggered + formattedAll
  → formatStructuralWorldBookSection for four system slots
  → buildDirectChatSystemInstruction (normal preparation or regenerate path)
  → PromptComposer with `historyInjections: wbBlocks.at_depth`
  → requestDirectChatTurn / generateRegeneratedChatTurn
```

The direct normal call site is `src/components/AppChat.tsx:2303`; its structural blocks
are passed into `DirectReplyPromptPreparationInput`. Regenerate repeats the same WorldBook
builder and placement calls at `src/features/chat/hooks/useChatRegenerationAction.ts:299`,
then calls `buildDirectChatSystemInstruction` directly. The only intended input difference
for WorldBook is the scan/history boundary; with equal scan text and scope, the resulting
WorldBook blocks are equivalent.

## Responsibility map (A–F)

| Layer | Current owner | Audit result |
|---|---|---|
| A. Source loading/freshness | `getLatestWorldBookEntries` → `loadWorldBookEntries` | Reads localStorage through repository; no write, migration, cache refresh or repair. On unavailable/invalid storage, returns props. |
| B. Scope resolution | `worldBookVisibility.ts` | Explicit global/character(s)/identity/relationship scope; chat/offline allow matching private scope, group excludes identity/relationship, public requires explicit public opt-in. |
| C. Trigger selection | `buildWorldBookSystemBlocks` | Persona rules/constants unconditional; keys use keyword/title substring; vector uses lightweight term overlap; inactive entries excluded. |
| D. Material projection | `buildWorldBookSystemBlocks` | Produces `【设定 - title】` plus content, `allTriggered`, and `formattedAll`. No AI call. |
| E. Injection placement | `buildWorldBookSystemBlocks` + `formatStructuralWorldBookSection` + `PromptComposer` | Four structural slots remain system text; `at_depth` is a history injection and excluded from `formattedAll`. Depth is clamped to 1–15. |
| F. Prompt ordering/ownership | direct call sites + existing prompt builders/Composer | WorldBook builder does not own character, Truth, Memory, Scene, provider, retry, delivery, or persistence. Prompt builders only receive its already-projected blocks. |

The function is not a giant provider or persistence service, but it is a mixed boundary
for source loading, selection and projection. That mix is the main reason to defer extraction.

## Storage, side effects and AI boundary

WorldBook request-time reads are localStorage reads through `readArray`/repository fallback.
`saveWorldBookEntries` is not called by this direct builder. No request-time DB write,
freshness repair, schema migration, or cache refresh occurs. Errors are caught and fall back
to the prop entries. The trigger, selection, projection and formatting paths contain no
`apiChat`, provider transport, fetch, retry or fallback call. AI is called only by the
downstream direct/offline/diary feature after PromptComposer input has been built.

The existing helper is invoked by more than direct chat: group member/reply services,
offline context, diary generation, inner voice, public chat Moments and relationship-network
Moment services. AppChat also uses latest WorldBook data for location references and has a
separate proactive path. These callers are intentionally not folded into this stage.

## Normal versus regenerate

Both paths reuse:

- the same `buildWorldBookSystemBlocks` implementation;
- the same chat `WorldBookReadContext` fields (character, identity, relation);
- the same trigger, scope, depth sort, structural slot and `at_depth` behavior;
- the same final language metadata projection through `getVisibleWorldBookEntries`.

They intentionally differ in scan/history input: normal uses the current message and the
current chat tail; regenerate uses the current target user message and target-excluded
`previousMessages`. This preserves regenerate's history boundary and prevents it from
reading messages that belong to the replaced future. No WorldBook-specific duplication was
found beyond the two call sites required by their different lifecycle inputs.

## Offline snapshot and stale-data semantics

Offline story creation/handoff captures `worldBookSnapshot` using latest entries filtered by
participant character IDs. Each turn reads that snapshot through
`collectOfflineWorldBookContext`; it does not consult live WorldBook entries. A legacy story
without a structured snapshot receives a one-time compatibility migration from latest entries
on first generation. A settings action can explicitly refresh the snapshot. Imported legacy
flattened context remains a title-overlap fallback.

This makes post-creation staleness intentional design, not an accidental live-read bug: the
story is stable until the user refreshes it. Continuation uses the existing snapshot. Offline
still applies its own downstream bounds (non-depth system limits and at most four depth
injections truncated to the existing estimate); this stage does not change them.

## Budget and duplication audit

WorldBook itself has no per-entry, count or total-character budget. It scans the current text
and about ten recent messages at both direct call sites, sorts all triggered entries, and emits
all matching content. Offline adds the existing system/prompt caps and depth bound described
above. Regenerate inherits the same block shape but its history boundary differs. This is a
known budget coupling to the existing prompt path, not a new Stage 3B-8 change.

Potential semantic duplication is visible at the prompt boundary: WorldBook blocks coexist
with persona/character description, Truth, legacy Memory, summaries, offline handoff, and
Character Knowledge. The WorldBook builder does not deduplicate those domains and does not
claim that a WorldBook entry is current Scene state. No deduplication was added because it
would change prompt behavior.

`WorldBookSystemBlocks` is already the structured representation used by callers: four
structural arrays, `at_depth` metadata, `allTriggered`, and `formattedAll`. Introducing a
second universal contribution type would duplicate this contract and increase migration risk.

## Contributor options

| Option | Boundary | Advantages | Risks |
|---|---|---|---|
| A. No contributor now (recommended) | Keep current builder and callers | Zero behavior drift; preserves offline/group/public contracts; no new dependency edge | Freshness/selection/projection remain co-located |
| B. Selection contributor | `entries + scope + scan → selected structured entries/blocks`; placement remains downstream | Could isolate pure selection later; small enough if freshness is first separated | Requires changing many callers and defining snapshot/live semantics; still must preserve depth/position metadata |
| C. Full contributor | Loading + selection + projection + placement + prompt contribution | One apparent API | Becomes a cross-feature God service, couples storage/React/PromptComposer/offline/provider-adjacent code, and cannot safely unify normal/regenerate/group/offline |

Option B is a possible future seam only after a separate, tested split of freshness loading
from pure selection. It is not safe to implement in this stage because the existing builder
is called across incompatible read scenarios and the offline path deliberately passes a frozen
snapshot. Option C is rejected.

## Characterization coverage

`scripts/directReplyWorldBookContextCharacterization.test.ts` locks:

- persona/constant/key/vector/inactive trigger behavior;
- chat, group and public scope isolation;
- depth ordering, structural positions, unknown duplication boundary and at-depth injection;
- PromptComposer history insertion;
- equal-input normal/regenerate block equivalence and both call-site seams;
- no-provider request in the utility and read-only storage fallback;
- offline snapshot projection.

The test is deliberately a characterization suite, not a new implementation contract. It
does not change prompt wording, ordering, WorldBook budgets, provider request count, retry or
delivery behavior.

## DirectReplyUseCase boundary impact

WorldBook should remain a feature-owned context producer. A future DirectReplyUseCase may
orchestrate a prepared direct turn and request/delivery lifecycle, but it should receive
already-resolved WorldBook material (or a small producer port) rather than own WorldBook
storage, scope rules, trigger algorithms, offline snapshots, group/public paths, or PromptComposer.
The current Stage 3B DirectReplyUseCase boundary documents this ownership and remains valid.

The after-reply side effects (memory extraction, diary generation, relationship/state updates,
offline/proactive work, character phone, Moments and other background actions) are unchanged
and remain outside this audit's production scope.

## Verification debt and rollback

Browser direct-chat smoke remains `DIRECT_CHAT_BROWSER_SMOKE` because the current automation
environment cannot launch its kernel assets. This audit does not remove or reduce that debt;
because there is no production wiring change, it does not add a new Stage 3B-8 production
wiring debt item. Existing code-level smoke, AI accounting, Prompt equivalence, Character
State, lint, build and dependency-gate results remain the Stage 3B baseline.

Only a characterization test and this audit document are added. Rollback is a normal revert
of those two commits; no user data, storage schema, prompt, provider or runtime behavior is
changed. Stage 3B-9, Memory V2, Context Engine V2 and Offline V2 remain pending explicit
approval.
