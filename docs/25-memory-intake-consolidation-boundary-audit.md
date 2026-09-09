# Stage 4C-9 — Memory Intake & Consolidation Boundary Audit

> 审计基线：`74b93a541354daa0abf715b21b6b2a8275dd708d`（2026-09-09）
>
> 本文是只读代码审计、characterization 和设计建议。Stage 4C-9 没有修改生产代码、Prompt、Provider、storage schema、用户数据，也没有创建 durable queue、worker 或 scheduler。

## 审计范围与证据

本审计以以下实际入口和调用点为准：

- `src/features/chat/controllers/chatSideEffectController.ts`
- `src/features/chat/controllers/postReplyCoordinator.ts`
- `src/features/chat/services/directReplyUseCase.ts`
- `src/features/chat/services/directReplyTurnExecutor.ts`
- `src/features/chat/hooks/useChatMemoryExtraction.ts`
- `src/domain/memory/MemoryExtractor.ts`
- `src/domain/memory/memoryWriteCoordinator.ts`
- `src/core/storage/repositories/characterKnowledgeRepository.ts`
- `src/core/storage/repositories/conversationSummaryRepository.ts`
- `src/core/storage/repositories/memoryRepository.ts`
- `src/features/diary/services/diaryGenerationService.ts`
- `src/features/offline/hooks/useOfflineStoryMemorySyncActions.ts`
- `src/features/offline/hooks/useOfflineStoryExitFinalization.ts`
- `src/core/storage/repositories/characterEventRepository.ts`

### Direct Chat lifecycle

```text
directReplyTurnExecutor
  -> requestDirectChatTurn (logical chat_reply; provider retries stay request-local)
  -> parse / candidate creation / delivery
  -> DirectReplyUseCase invokes caller-owned postReply after delivery
  -> postReplyCoordinator.schedule (synchronous adapter)
     -> chatSideEffectController.afterReplySuccess (returns without awaiting extraction)
        -> threshold + lastImmediateSummaryMsgId boundary
        -> Cheap Filter (normal direct relation only)
        -> skip: relationship cursor write, no memory Provider call
        -> extract: 200ms scheduled task
           -> useChatMemoryExtraction.handleExtractMemories
           -> MemoryService.extractMemories(scenario: chat)
           -> extraction parser + source-ref resolution + evaluateKnowledgeWrite
           -> MemoryWriteCoordinator
              -> KnowledgeClaim append (canonical)
              -> ConversationSummary append (derived)
              -> optional legacy MemoryItem (not passed by current direct path)
           -> relationship cursor update
```

Normal direct reply delivery is therefore ahead of automatic memory extraction. Manual archive uses the same extraction hook but is awaited by the manual action. Group extraction remains a separate legacy path and is not covered by the Direct Chat Cheap Filter policy.

## Synchronization matrix

| # | Step / owner | Caller and timing | Awaited? | Provider | Storage reads / writes | Failure effect | Retry / idempotency | User-visible consequence |
|---:|---|---|---|---|---|---|---|---|
| 1 | `requestDirectChatTurn` / `chatGenerationController.ts` | `directReplyTurnExecutor` before delivery | yes | `chat_reply`; format, context, degenerate and alias repair are request-local attempts | prompt sources read in memory; no memory write | blocks reply delivery, not a delivered message | provider/API layer and request-local retry; Ledger records one logical request with attempts | typing remains until success/failure; error toast on terminal failure |
| 2 | candidate parse and delivery / `directReplyTurnExecutor.ts` | after `chat_reply` | yes | no new call | message delivery callback writes chat messages through existing App state path | blocks completion of this turn; no postReply on failed delivery | candidate IDs are generated per turn; delivery outcome is explicit | bubbles and typing state are user-visible |
| 3 | `postReplyCoordinator.schedule` | `DirectReplyUseCase` after successful delivery | no asynchronous wait; method itself is synchronous | no | none directly | catches side-effect throw and returns failure metadata; delivered reply stays delivered | no durable retry | none unless a side-effect-specific UI notification exists |
| 4 | inner voice persistence | AppChat postReply callback, before coordinator | synchronous callback; writes are not awaited | no separate Provider in this boundary; payload is part of reply response | load/save inner voice records | save failure is not promoted to reply failure | per-message existence check; local dedup | inner voice record may be absent |
| 5 | proactive appointment/invitation persistence | AppChat postReply callback | synchronous callback | no | appointment read/update/save | warns; reply remains delivered | appointment state update is record-level | appointment transition may be missed |
| 6 | `maybeAutoStartOfflineFromPresence` | AppChat postReply callback | returns immediately; starts existing offline flow | no new call at this point | story/appointment/navigation writes in called hook | guarded and best-effort; not a memory write | per-tab in-memory relation guard | may show offline handoff toast |
| 7 | threshold and archive boundary | `chatSideEffectController.afterReplySuccess` | synchronous calculation | no | reads active messages and relationship marker; Cheap Filter skip can write relationship | filter exception fails open to extraction; cursor write failure is not thrown | module-scope in-flight/cooldown only | usually invisible |
| 8 | Cheap Filter skip | same controller | synchronous | 0 | relationship load via callback; relationship cursor write | skip write failure is swallowed by callback boundary; no AI request | cursor update is repeatable | no extraction indicator |
| 9 | delayed extraction schedule | same controller, default 200ms | schedule returns; task is not awaited | not yet | none | task failure becomes warning/cooldown | module-scope `autoSummaryInFlight` and 5-minute cooldown per relation | no blocking spinner; later retry is suppressed for cooldown |
| 10 | `MemoryService.extractMemories` | scheduled hook task or manual archive | yes inside task/manual action | `memory_extract` through `apiExtractMemoriesWithModelFallback`; fallback attempts are part of one logical extraction operation | reads configured settings and supplied messages; no write in extractor | returns `apiError` / `-1`; automatic path leaves marker unchanged; manual path reports failure | provider fallback/repair as existing API contract; stable claim IDs on accepted output | automatic path invisible except later marker/recall; manual action shows failure state |
| 11 | parse, local-ref resolution, `evaluateKnowledgeWrite` | inside `MemoryExtractor.ts` | yes as part of extraction | no additional call | no storage | malformed/untrusted candidate rejected; extraction can still succeed with zero accepted claims | candidate IDs and source refs are deterministic for the call; rejected candidates do not write | only archive feedback/count changes |
| 12 | canonical claim append | `commitMemoryWriteBundle` first write | yes in extraction task | no | load/normalize/dedupe/write `characterKnowledgeClaims` | `canonicalWritten=false` stops summary/legacy writes in coordinator | ID and meaning dedup; repository is load/merge/write, not transactional | automatic retry remains possible because marker is not advanced |
| 13 | ConversationSummary append | coordinator after canonical success | yes in extraction task | no | load/merge/write `conversationSummaries` | recorded as `summaryError`; direct hook treats it as batch failure and does not advance marker | meaning merge plus IDs; rebuildable from active claims/source refs | automatic retry may repeat the batch; no chat rollback |
| 14 | legacy MemoryItem append | optional coordinator callback | yes if supplied | no | `memoryVaultItems` load/compress/write | recorded independently; canonical and summary can remain committed | `saveMemories` is whole-array write; no source-claim link guarantee for old rows | current direct canonical path does not invoke it; other callers may observe failure |
| 15 | relationship cursor update | `markArchiveProgress` after claim+summary success | direct path awaits callback invocation but `onSaveRelationships` itself is void; automatic controller later invokes update callback | no | relationship array read/merge/write in App owner | failure cannot be observed reliably by hook; marker may lag | stable message ID; repeat extraction dedupes claims/summaries | next threshold may re-evaluate same range |
| 16 | diary generation | coordinator after side effects | Promise is deliberately fire-and-forget | `diary_generate` at most one call when relation has >=20 messages and 24h gate permits | diary task/entry arrays load+replace/write | caught internally; never blocks reply or memory extraction | module-scope in-flight; durable task status but no durable queue claim | diary may appear later or remain failed |
| 17 | offline story memory sync | Offline exit finalization | yes; exit awaits it | `memory_extract` per direct story; group performs one extraction per participant | claims, summary, relationship transition, story snapshot/status | failure marks story `memorySyncStatus=failed`, preserves story, prevents completed handoff | in-memory per-tab guard; deterministic offline summary ID; manual retry supported | user waits on exit and receives progress/error notification |

## Provider request inventory

- **Normal Direct Chat, common:** one `chat_reply` logical request and normally one provider attempt. The request carries a `parentActionId`; format/context/degenerate/alias repairs use the same logical turn path and increase provider attempts, not logical post-reply memory records.
- **Normal Direct Chat, worst current path:** `chat_reply` plus request-local format/context/degenerate/alias retries and, if the threshold is reached and Cheap Filter says extract, a later `memory_extract` logical request. `memory_extract` may use backend/browser model fallback attempts. It is not awaited by the user reply path.
- **Summary:** direct extraction builds `ConversationSummary` locally from accepted claims; it does not call a second summary Provider. Group extraction has a separate `memory_extract`/summary call per batch.
- **Relation summary:** no separate normal-chat relation-summary Provider was found in this lifecycle. `compressedMemory` is an existing relationship field and is not written by the current direct canonical extraction path.
- **Knowledge extraction:** `MemoryService.extractMemories` parses and admits candidates in-process after the extraction Provider response.
- **Diary:** `maybeGenerateDiaryAfterChat` can launch one `diary_generate` call, fire-and-forget from the reply lifecycle.
- **Other post-reply AI:** inner voice is carried in the direct reply response; character phone/gallery and proactive appointment paths are local persistence. Group, proactive, Moments, Forum, Reading, Character Phone, and image generation are separate feature paths and are not direct-chat memory post-reply calls.
- **Logical request vs attempt:** one Ledger record represents the logical purpose request; provider attempts, browser/backend fallback, format/context repair and alias correction are counted inside its `providerRequestCount`/reason fields according to the existing accounting contract. There is no attempt-level durable log.

## Storage write inventory

| Record | Current owner | Order / transaction | Independent failure and retry | Write shape / idempotency |
|---|---|---|---|---|
| `KnowledgeClaim` | `characterKnowledgeRepository.appendMany` through `MemoryWriteCoordinator` | first; no transaction with projections | failure stops the bundle; automatic marker remains; manual retry re-runs | whole-array load/normalize/merge/write; ID and meaning dedup, claim status/revision semantics |
| `ConversationSummary` | `conversationSummaryRepository.appendMany` through coordinator | after claims | can fail after canonical commit; hook refuses cursor advance | whole-array normalized meaning merge; source claim/message IDs permit rebuild/staleness |
| legacy `MemoryItem` | optional `saveMemories` callback in coordinator / legacy callers | after summary when supplied | independent failure; current direct hook passes no legacy writer | whole-array compressed write; legacy IDs/content are less source-stable than claims |
| `Relationship` | App owner callback (`onSaveRelationships`/`updateRelationships`) | Cheap Filter cursor or post-extraction marker; offline transition after canonical bundle | independent; callback often returns void so failure is not surfaced | whole-state callback, relation ID match; last-write-wins per tab |
| `CharacterEvent` | `characterEventRepository` and event capture services | not part of normal direct memory extraction; offline completion may append event after sync | independent event capture; no direct reply rollback | append/load/merge with event idempotency key and dedup policy |
| `compressedMemory` | relationship/legacy/offline feature owners | not written by current direct extraction canonical path; read by prompt/offline paths | independent legacy/compatibility concern | scalar field on Relationship; no claim-linked revision in this lifecycle |
| `lastImmediateSummaryMsgId` | ChatSideEffectController / `useChatMemoryExtraction` | after Cheap Filter skip or successful extraction | may fail/lag; no transaction with claims | scalar cursor; stable message ID, but semantic name is broader than current guarantee |
| diary task/entry | diary repository | after reply side-effect scheduling, asynchronous | task can be failed and later manually retried; no durable scheduler | taskKey replacement for task; entry ID for entry; 24h/in-flight gates |
| OfflineStory snapshot/status | offline sync hook and exit finalizer | after claim+summary and relationship transition | failure is durable `failed`; story is retained for manual retry | story ID and synced message IDs; deterministic offline summary ID |

There is no multi-record transaction spanning claims, summaries, relationships, legacy memories, diary, events, or story snapshots. `writeJson` itself protects a single localStorage key with read-before-write, verification, and rollback, but that does not make a cross-key transaction.

## MemoryWriteCoordinator characterization

`commitMemoryWriteBundle` is a write-order/failure-boundary coordinator, not a unified Admission layer:

1. If claims exist, write claims first. Missing callback or failed/throwing canonical write returns `canonicalWritten=false` and does not attempt derived writes.
2. If canonical succeeds, write summary/summaries if present. Summary failure is recorded and does not erase claims.
3. If a legacy `memories` payload and writer are supplied, write it after summary. Legacy failure is recorded and does not erase claims or summary.
4. `complete` is true only when all requested layers succeeded. A missing optional layer is treated as not requested, not as a failure.

Consequences:

- canonical success + summary failure: possible; direct automatic/manual hook returns failure and leaves the cursor behind, so a later pass can rebuild the summary from claims/source messages.
- canonical success + legacy failure: possible; caller receives incomplete result. Current direct path has no legacy callback, so this case belongs to other callers.
- summary success + legacy failure: possible when canonical and summary succeeded; no rollback exists.
- duplicate write: repository normalizers dedupe claim IDs/meaning and summary meaning; whole-array writes still have a last-writer race across tabs.
- retry: stable claim IDs, source refs, summary meaning merge and deterministic offline summary ID make common retries idempotent, but there is no durable job record that proves a projection is pending.

## Immediate versus background classification

| Work | Classification now | Evidence / rationale |
|---|---|---|
| deliver generated chat messages | Immediate Required | user-facing reply cannot complete before delivery |
| persist the online chat message itself | Immediate Required | otherwise UI state/history is not durable |
| direct `memory_extract` after reply | Background Safe for normal send | controller schedules it and returns without awaiting; no reply correctness dependency |
| canonical claim commit for normal direct auto extraction | Background Safe in current behavior, but Immediate Preferred for a future explicit memory action | current reply already returned; manual archive waits and treats failure as action failure |
| summary projection | Derived/Rebuildable; Background Safe | built from accepted claims and source refs; hook currently waits before advancing marker for consistency |
| legacy Memory mirror | Compatibility / Background Safe | not used by current direct canonical write; readers remain, so migration must observe it |
| cursor update | Immediate Preferred after a successful extraction pass | prevents repeated work, but lag is recoverable; Cheap Filter skip also advances it |
| diary generation | Background Safe | coordinator never awaits it; durable task/entry can be absent/failed without changing reply |
| offline scene/story snapshot and handoff state | Immediate Required on Offline exit | exit finalizer awaits sync and then creates handoff; losing state would break return-to-online continuity |
| offline long-term claim/summary consolidation | Immediate Preferred today, Background Candidate later | current code waits for provider + storage; canonical-first redesign needs a durable pending marker/capsule first |

### Canonical-first feasibility

For online direct chat, the code already demonstrates that reply delivery can precede memory work. A future policy can safely commit a canonical `KnowledgeClaim` change (or a durable intake result) and then finish the action while summary, legacy mirror and indexes run later, provided retrieval treats missing/stale projections as cache misses and the cursor is defined as a source-processing cursor rather than a proof that every projection exists. Current repository writes are still whole-array and non-transactional, so this is a design target, not a ready-to-implement guarantee.

## Canonical taxonomy and summary audit

| Concept | Current role | Canonical / projection / compatibility | Rebuildability and retrieval |
|---|---|---|---|
| `KnowledgeClaim` | admitted, scoped, source-aware truth change | **canonical** target for Memory V2 | durable source; summaries can be rebuilt; direct Truth retrieval reads it |
| `CharacterEvent` | explicit life/relationship event stream | **canonical event stream** for event-producing features, not a replacement for claim extraction | append/dedup repository; relationship/moment/diary projections read it |
| `RelationshipState` | current relation state and fields | **canonical state** for relation settings/transitions; a projection may later be derived from events, but current state is authoritative for UI | scalar/object writes; not rebuilt automatically from claims |
| `MemoryItem` | old free-form memory vault and compatibility surface | **compatibility / legacy** record | can be retained/read during migration; not a safe sole source for V2 provenance |
| `ConversationSummary` | source-aware human-readable retrieval cache | **derived projection** from active claims and source messages | rebuildable; status can become stale/retracted |
| `compressedMemory` | relationship/character compact text | legacy **derived/compatibility projection** | not source-linked in current field; rebuild requires a policy and source claims |
| Offline summary | `ConversationSummary` with deterministic offline ID and offline generator | derived projection of offline canonical claims | rebuildable from claims/source story, but current exit waits for it |

Conversation summaries are generated locally from accepted claims in direct/offline V2 paths; they are not a second AI summary call. Group chat has a dedicated AI summary path that then becomes claims and summaries. Relationship summaries and `compressedMemory` remain separate legacy fields. Prompt retrieval currently combines canonical Truth adapters with selected legacy/fallback context in different features; this is why legacy readers cannot yet be removed.

### Legacy `MemoryItem` readers

The audit found active readers in: `chatTokenEstimate.ts` (fallback token estimate), direct-chat shadow diagnostics/comparison, offline handoff and offline member snapshots/repair policy, chat start/offline creation, group/private context adapters, Moments and Music context services, Forum and Forum Story context inputs, legacy migration runner, AppMemory UI/storage panel, delete/cleanup actions, and other feature-specific memory adapters. Some are test/debug or fallback-only, but they are production reachable. `memoryRepository.loadMemories` remains a live storage reader. This blocks an immediate background-only mirror retirement decision.

### Cursor semantic debt

`lastImmediateSummaryMsgId` is used as the boundary for “messages evaluated by the archive pass”. It advances on Cheap Filter skip, and after canonical claim + summary success in direct extraction; it does not prove that legacy Memory, relationship projection, diary, or every other side effect was persisted. In group/manual paths it similarly marks the processed batch. The name implies “summary completed”, while the actual contract is closer to `archiveProcessedThroughMessageId` with path-specific guarantees. This is a documented semantic debt; no rename was made.

## Failure and recovery characterization

1. **Extraction Provider failure:** automatic task returns `-1`, logs, sets a five-minute in-memory cooldown, and leaves the relationship cursor unchanged. Manual extraction returns failure feedback; chat remains delivered.
2. **Parse/local-ref/admission failure:** invalid candidates are rejected; if no valid claims remain, the extraction pass can complete with zero facts. The cursor is advanced for a successful pass, so the same source range is not repeatedly sent forever.
3. **Canonical claim write failure:** coordinator stops before summary/legacy, returns failure; cursor is not advanced by the direct hook. A later automatic/manual pass can retry, subject to in-memory cooldown/in-flight state.
4. **Summary write failure:** claims remain durable, summary is missing/stale; direct hook returns failure and does not advance cursor. Rebuilding summary from claims is possible, but no repair job is registered.
5. **Legacy mirror failure:** when a caller supplies the legacy writer, claims/summary can remain committed and mirror can be missing. There is no automatic mirror repair in the coordinator.
6. **Relationship write failure:** repository callback often returns void; the extraction result can be successful while the cursor is absent. Next pass re-evaluates the range; claim/summary dedup limits semantic duplication.
7. **Cursor update failure or stale callback:** same as above; marker lag is recoverable, but repeated Provider cost is possible after in-memory guards expire.
8. **App close/refresh mid-way:** normal direct extraction has no durable “pending extraction” record; a scheduled task can disappear before Provider call, during Provider call, or between claims and cursor. Claims/summary writes that already completed survive localStorage; cursor may lag. Offline sync differs: failed sync status and story are durably retained, enabling manual retry.

The current system therefore permits partial state (`claims=true, summary=false`, and in legacy callers `legacy=false`) and has recovery by re-running source extraction/manual repair, not by a durable projection queue. There is no cross-tab lease; module/ref guards are per JavaScript context.

## Idempotency, concurrency, and queue decision

- Claim IDs are stable within extraction construction (`claim:${baseId}:${index}`), source message IDs and evidence keys are retained, and repository conflict policy dedupes by ID/meaning. Repeating the same extraction can still produce a different `baseId` in some paths, so meaning-level dedup is an important second guard rather than a formal job identity.
- Conversation summaries merge by scope + normalized meaning and combine source IDs/claim IDs; deterministic offline summary IDs are stronger.
- Legacy MemoryItem whole-array writes do not have the same source-claim identity guarantees and can duplicate or overwrite under concurrent tabs.
- Relationship and cursor updates are last-writer-wins snapshots. Cheap Filter and extraction guards (`autoSummaryInFlight`, cooldown) are module memory only. Diary and offline sync use per-tab/module/ref guards; they are not durable leases.
- A future queue is justified only for work that must survive refresh, retry independently, or coordinate projections. No single universal queue object is supported by this audit. Candidate options are: raw source batch (re-extractible but expensive), extraction result (privacy-sensitive but avoids Provider repeat), `MemoryCandidate` (before admission), admission-approved canonical change (best for deterministic projections), and projection job (summary/mirror/index). These are distinct lifecycle concepts, not one “memory queue”.

### Intake versus Consolidation

The repository supports a useful split:

```text
MemoryIntake
  source refs -> extraction -> candidate parse -> admission -> canonical KnowledgeClaim commit

MemoryConsolidation
  canonical claims/events/state -> ConversationSummary -> legacy mirror -> indexes/derived views
```

`MemoryExtractor` already owns extraction/parsing/admission and has no storage side effects. `MemoryWriteCoordinator` currently straddles canonical and derived writes, so it is the seam to narrow later. It must not become a God Service that also owns Provider transport, queueing, Offline, relationship transitions, retry, and retrieval.

Conceptual future job types are `consolidate_summary`, `mirror_legacy`, `rebuild_index`, `merge_candidates`, and `offline_memory_delta`. Each job should have a bounded owner and source/canonical references; none is implemented in Stage 4C-9.

## Offline, Handoff Capsule, and MemoryDelta

Offline exit currently waits for: extraction Provider response(s), candidate admission, canonical claim write, ConversationSummary write, confirmed relationship transition, OfflineStory status/snapshot write, and then handoff capsule creation. Direct stories use one extraction call; group stories extract sequentially per participant and require all participant summaries/fallback checks before sync succeeds. This is the primary user wait path in the memory subsystem.

An eventual Offline exit could return after durable scene state plus a Handoff Capsule and a pending MemoryDelta stub, then consolidate claims/summaries in background. The current blockers are that `OfflineStory` completion is coupled to successful claim+summary writes, the handoff source selection reads sync markers, and no durable pending consolidation marker/lease exists.

`MemoryDelta` should represent change, not a copied transcript. Conceptual fields are `newFacts`, `newEvents`, `relationshipSignals`, `openThreads`, `emotionalResidue`, and `sceneOutcome`; current accepted claims, captured CharacterEvents, relationship transition output, and offline source refs can map into those concepts. No final schema is proposed here.

## Batching, retrieval duplication, and policy

- Current direct automatic extraction batches messages by configured `historyMemoryLimit` (clamped 10–200); each batch produces one `memory_extract` call and one claims/summary write sequence. N accepted candidates are normalized in one repository append, not N independent localStorage writes.
- Group offline extraction is currently one Provider operation per participant, sequentially; that is the clearest future batching opportunity, but participant scope and privacy must remain isolated.
- Multiple accepted claims and summaries already have `appendMany` interfaces. A future consolidation pass could merge writes per scope and projection, avoiding repeated load/serialize/write cycles.
- No current normal Direct Chat path was found that calls an AI once per candidate after extraction. Hidden sequential calls do exist in diary (one per qualifying relation), group/offline participant extraction, and unrelated feature runtimes; they are outside this stage’s direct-chat policy.
- Retrieval duplication risk remains: direct-chat Truth retrieval can use canonical claims/events while token estimation, offline handoff, group/private context, Moments/Music/Forum adapters and legacy migration still read `MemoryItem`/`compressedMemory`/summaries. If more than one projection is injected for the same fact, tokens and contradictory wording can be duplicated. This is a register item only; Stage 4B read-switch is not reopened.
- Online Direct Chat policy recommendation: deliver chat first; keep automatic extraction and derived consolidation background-capable, with canonical commit either background-safe as today or a future explicit intake acknowledgment. Offline Exit policy recommendation: persist scene/handoff state immediately, then move long-term consolidation behind a durable pending marker once proven.

## Future observability, privacy, and migration

Any future background job metadata should include `parentActionId`, `jobId`, `purpose`, canonical/source references, `status`, `attemptCount`, `lastErrorCode`, `createdAt`, and `completedAt`. It must not store full Prompt, full conversation, API key, Authorization, or complete AI response by default. Source refs and candidate/claim IDs should be sufficient for diagnosis; sensitive text belongs in existing user-controlled canonical records, not telemetry.

Crash recovery requires a durable state transition that is visible on startup: at minimum a source/canonical reference, projection kind, status, attempt count, and lease/updated time. Current in-memory guards cannot recover a task after refresh. Multi-tab safety requires compare-and-merge or a durable lease/version check around whole-array repositories; it cannot be assumed from `autoSummaryInFlight`, `autoDiaryInFlight`, or React refs.

Recommended conceptual architecture:

```text
Direct/Offline caller
  -> MemoryIntakeCoordinator
       -> extraction + admission
       -> canonical commit (KnowledgeClaim / event/state as appropriate)
       -> durable intake result or pending marker
  -> action can finish according to its policy
  -> MemoryConsolidationJob
       -> ConversationSummary
       -> legacy mirror
       -> indexes / derived views
```

Suggested migration order, subject to a separately approved stage:

1. keep this characterization and add failure/metric fixtures;
2. define canonical commit and cursor semantics without changing behavior;
3. define projection-job contracts and privacy metadata;
4. shadow-create job descriptions without executing them;
5. add a durable pending marker/queue with startup recovery and multi-tab guard;
6. move only ConversationSummary rebuild/consolidation first;
7. observe duplicate/failure rates and repair paths;
8. move legacy mirror and indexes one projection at a time;
9. revisit Offline exit after Handoff Capsule/MemoryDelta contract exists;
10. only then consider Admission cutover or legacy retirement.

## Required 70 answers

1. **Direct Chat memory lifecycle:** delivery → postReply → threshold/marker → Cheap Filter → delayed extraction → parse/admission → coordinator → claims → summary → optional legacy → cursor.
2. **Post-reply trigger:** `postReplyCoordinator.schedule` calls `chatSideEffectController.afterReplySuccess` after successful normal delivery; regenerate policies intentionally skip it.
3. **Extraction wait behavior:** normal direct reply does not await automatic extraction; manual archive and current Offline exit do.
4. **Extraction Provider calls:** direct auto extraction uses `memory_extract` through fallback; one call per configured batch, with provider attempts hidden inside the logical operation.
5. **Parse/repair behavior:** local source refs resolve before admission; malformed candidates are rejected; existing API fallback/repair stays request-local.
6. **KnowledgeClaim write owner:** `characterKnowledgeRepository.appendMany`, invoked first by `MemoryWriteCoordinator`.
7. **Summary write owner:** `conversationSummaryRepository.appendMany`, invoked after canonical claims.
8. **Legacy Memory write owner:** optional `saveMemories` callback in the coordinator and legacy callers; current direct hook does not pass it.
9. **Event write owner:** `characterEventRepository` and explicit event capture services; not part of normal direct extraction.
10. **Relationship write owner:** App-level relationship callbacks (`onSaveRelationships`/`updateRelationships`) and Offline transition code.
11. **Cursor write owner:** ChatSideEffectController or `useChatMemoryExtraction.markArchiveProgress`, through relationship/character callbacks.
12. **Write order:** canonical claims → derived summaries → optional legacy mirror → cursor (cursor is outside coordinator).
13. **Transaction boundary:** single localStorage key writes verify/rollback; no cross-record transaction.
14. **Partial commit possibilities:** yes; claims may exist without summary, legacy mirror or cursor.
15. **Canonical write failure behavior:** stop the bundle, skip derived writes, leave marker behind, report failure.
16. **Summary failure behavior:** claims remain; direct hook refuses cursor advance; no automatic repair job exists.
17. **Legacy failure behavior:** canonical/summary remain; mirror failure is recorded only for callers that supply it.
18. **Cursor failure behavior:** marker may lag; source is re-evaluated later and dedup limits duplicates.
19. **Retry behavior:** provider fallback and request-local repairs are existing; automatic extraction has an in-memory five-minute cooldown; manual retry is explicit; durable retry is absent.
20. **Idempotency by projection:** claims use ID/meaning dedup; summaries use meaning/source merge; offline summary IDs are deterministic; legacy whole-array writes are weaker.
21. **Canonical records:** KnowledgeClaim, CharacterEvent where an event is the owning domain stream, and RelationshipState for current relation state.
22. **Derived records:** ConversationSummary, relationship summaries, compressedMemory, indexes and other compact views.
23. **Compatibility records:** legacy MemoryItem and migration-shaped compressed memory.
24. **Rebuildable records:** ConversationSummary and most proposed indexes; legacy mirror is rebuildable only while canonical source/readers remain available.
25. **ConversationSummary semantics:** source-aware, scoped, claim-backed human-readable projection with active/stale/retracted state.
26. **compressedMemory semantics:** legacy scalar relationship/character compact text; not claim-linked in this lifecycle.
27. **Relationship summary semantics:** a relationship-scoped compact state/context field, separate from canonical claims and current direct summary projection.
28. **Offline summary semantics:** a ConversationSummary projection of offline accepted claims, with deterministic story ID and offline generator.
29. **Legacy Memory active readers:** chat token/fallback context, offline handoff/snapshot/repair, group/private context, Moments/Music/Forum adapters, migration/UI/cleanup and shadow diagnostics.
30. **`lastImmediateSummaryMsgId` actual semantics:** processed/archive boundary with path-specific guarantees, not proof that every projection completed.
31. **Naming debt:** yes; “summary” overstates Cheap Filter/claim-only completion. Do not rename in this stage.
32. **Synchronous user wait path:** normal chat reply generation, parse, delivery, and local postReply callbacks; not auto memory extraction.
33. **Background-capable path:** normal automatic extraction, summary projection, legacy mirror, diary and indexes, subject to durable recovery in a future design.
34. **Direct Chat policy recommendation:** deliver first; keep memory extraction/consolidation non-blocking, with explicit/manual archive allowed to wait.
35. **Offline exit current blockers:** provider extraction, sequential group extraction, claims+summary writes, relationship transition, story status/snapshot, and only then handoff creation.
36. **Offline immediate-save minimum:** scene/story durable state, source message refs, handoff capsule, and a pending MemoryDelta/consistency marker; current code instead requires claims+summary before completion.
37. **Handoff Capsule fit:** conceptually good; current source selection and sync markers make it a future boundary, not a drop-in change.
38. **MemoryDelta fit:** good conceptual envelope for accepted changes and relationship/scene signals; schema must be separately designed.
39. **Batching opportunities:** appendMany claim/summary writes, per-scope consolidation, group participant planning where privacy allows, and legacy/index projection batches.
40. **Sequential AI-call opportunities:** group/offline participant extraction and diary are visible opportunities; no direct candidate-by-candidate post-extraction call was found.
41. **Token duplication risks:** canonical Truth plus legacy MemoryItem, compressedMemory and summaries can overlap in different prompt adapters; register only.
42. **Queue necessary?:** not proven for normal Direct Chat yet; justified for crash-safe independent projections and Offline deferred consolidation.
43. **Queue object recommendation:** do not use one universal queue; distinguish source batch, extraction result, candidate, admission-approved change and projection job.
44. **Intake boundary recommendation:** source refs → extraction → parse/admission → canonical commit, with no summary/legacy/queue orchestration mixed in.
45. **Consolidation boundary recommendation:** canonical changes → summary/merge/mirror/index projections, independently retryable and rebuildable.
46. **Job types recommendation:** `consolidate_summary`, `mirror_legacy`, `rebuild_index`, `merge_candidates`, `offline_memory_delta` as bounded conceptual jobs.
47. **Crash recovery requirements:** durable pending state, source/canonical refs, status, attempt count, lease/version, startup scan and safe idempotent retry.
48. **Multi-tab/concurrency risks:** module/ref guards are per tab; whole-array read/merge/write is last-writer-wins; duplicate extraction and cursor races remain possible.
49. **Observability requirements:** parentActionId, jobId, purpose, refs, status, attempts, error code, created/completed timestamps; no body logging.
50. **Privacy constraints:** no full Prompt, transcript, response, API key or Authorization in job metadata/ledger.
51. **Production code changed?:** no.
52. **Provider calls changed?:** no; audit only.
53. **Storage changed?:** no schema or data changed; document only.
54. **Tests added:** no new characterization test; existing tests remain untouched.
55. **Total tests:** 557/557 at the Stage 4C-8 baseline; full suite rerun for this docs-only stage (see validation below).
56. **Lint:** rerun and required to pass.
57. **Dependency gate:** rerun against 105 allowlisted edges / 3 cycle baseline.
58. **Build:** Stage 4C-8 build baseline was pass; because this stage is docs-only, build is cited rather than used as a production-code gate unless the final verification reruns it.
59. **Smoke:** Stage 4C-8 smoke baseline was pass, with existing browser/runtime verification debt; no product behavior changed here.
60. **Commits:** one single-purpose documentation commit for this audit; no implementation commit.
61. **Final HEAD:** updated only by the documentation commit from `74b93a541354daa0abf715b21b6b2a8275dd708d`.
62. **Worktree status:** must be clean after the documentation commit; original repository remains clean.
63. **User data impact:** none; no runtime, storage, or migration operation was executed.
64. **Rollback:** revert the one documentation commit; production behavior is unchanged.
65. **Existing debts:** `DIRECT_CHAT_BROWSER_SMOKE`, `REAL_MEMORY_SHADOW_REPORTS_BLOCKED`, and `BUILD_RUNTIME_ASSERTION_WINDOWS_NODE` remain; this audit adds no code workaround.
66. **New debts:** cursor naming/contract ambiguity, no durable direct extraction pending marker, partial cross-record commits, weak multi-tab coordination, and legacy reader inventory still requiring migration.
67. **Recommended migration order:** characterize → define canonical/cursor boundary → define projection jobs/privacy → shadow jobs → durable pending/lease → move summary → observe → move mirror/index → Offline handoff/delta → later Admission/retirement.
68. **Durable background consolidation justified?:** architecturally plausible for derived projections and Offline deferred work, but implementation evidence is not yet sufficient for this repository’s cross-tab and crash-recovery guarantees.
69. **Admission cutover timing:** after a proven consolidation boundary and recovery/observability path, not before; Stage 4C-9 does not authorize cutover.
70. **Recommended Stage 4C-10:** do not start automatically. If approved later, begin with a small characterization/contract stage for cursor semantics, durable pending-state design, and projection failure telemetry—not a worker or broad production migration.

## Explicit decisions

### 当前 Memory write lifecycle 中，哪些步骤真正需要阻塞用户？

对 Normal Direct Chat：只有 `chat_reply` 的 request/parse、回复 bubble delivery，以及维持当前 UI/history 正确性的本地即时写入需要阻塞用户。`postReply` 的 memory threshold、Cheap Filter、自动 `memory_extract`、canonical claim/summary projection、legacy mirror、diary 和 index 都不应阻塞已经交付的普通回复；当前代码也已经让自动 extraction 和 diary 不阻塞。

对 Offline Exit：当前实现会阻塞在 extraction Provider、canonical claim + ConversationSummary persistence、relationship transition 和 OfflineStory snapshot，之后才创建 handoff。这是现状，不是最终推荐。未来至少应先阻塞 Scene/Handoff durable state；长期 memory consolidation 可在拥有 durable pending marker 和可恢复 contract 后后台化。

### 是否已经有足够证据进入 Background Consolidation 实现阶段？

**NO。**

已经有足够证据确认边界方向（canonical claim first、summary/legacy/index derived、Direct Chat 与 Offline 分开），但还没有足够证据安全实现：跨 localStorage key 的 partial commit recovery、刷新/崩溃恢复、multi-tab lease/version、cursor 语义收口，以及全部 legacy readers 的迁移。下一阶段若获批准，应先做小范围 contract/characterization，而不是直接创建 worker、queue 或修改 Offline/Admission 行为。

