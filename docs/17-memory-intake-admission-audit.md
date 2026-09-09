# Stage 4C-1 — Memory Intake & Admission 只读架构审计

审计基线：`6729c6f766201883f2274461f92d8dd6998a51f5`  
分支：`refactor/v2-architecture`  
日期：2026-09-09

本阶段只读检查真实代码，不改变 MemoryService、MemoryWriteCoordinator、extraction Prompt、阈值、provider、schema、migration、Prompt、read switch、legacy store 或用户数据。本文中的“建议/未来”不是本阶段批准的实现。

## 1. 结论摘要

当前系统有一条相对清晰的 canonical Truth 写入链，但没有统一、可持久化的 Memory Intake / Admission 层：

```text
source message / event / feature output
  -> capture（保留来源或 feature record）
  -> extraction（AI 或 deterministic 产生结构化候选）
  -> caller-side evaluateKnowledgeWrite（部分路径）
  -> MemoryWriteCoordinator（顺序协调，不做语义准入）
  -> KnowledgeClaim（canonical）
  -> ConversationSummary / legacy Memory / CharacterEvent 等 projection
```

因此当前事实是：**`Admission boundary currently implicit / missing`。**

`evaluateKnowledgeWrite` 提供了重要的 policy gate（scope、evidence、low-information、question/roleplay、offline boundary、truth/temporal normalization），但它不是统一 intake service，也没有把被拒绝候选作为可审计 pending 记录保存。调用方仍各自决定何时调用、传入何种候选以及是否生成 projection。`MemoryWriteCoordinator` 不会替调用方判断 authority、subjective 内容或 Scene。

当前 Memory 写入最大的问题不是完全没有校验，而是：**多个 producer 在不同层次做 capture、extraction、admission 和 projection，缺少统一的 admission 记录与跨 projection 的原子/版本边界。** 这造成同一来源可能有 claim、summary、legacy mirror、offline handoff/event 多种表示；canonical 已成功而 derived projection 失败时会留下部分状态；新增 producer 很容易绕过同一组问题定义。

## 2. 四种行为不能混称为 Memory write

| 行为 | 当前实现 | 是否等于长期 Memory write |
|---|---|---|
| Capture | 保存 chat/offline/reading/cinema/phone/diary 等原始或 feature-owned record；保存 source message/event IDs | 否，只是保留证据输入 |
| Extraction | `MemoryExtractor.extractMemories`、group summary、offline participant extraction、reading response candidate、Moment generator memory-shaped return | 否，产生结构化候选/摘要 |
| Admission | 部分调用方调用 `evaluateKnowledgeWrite`；manual 走 `createManualKnowledgeClaim`；offline 还有 `canSyncOfflineStoryToMemory` 与 `evaluateOfflineStoryReality` | **没有统一显式层**；没有 IntakeCandidate 状态、rejection ledger 或统一 admission repository |
| Projection | canonical claim 后写 `ConversationSummary`、有限 legacy `MemoryItem`；offline completion 后写 `CharacterEvent`；feature records 写各自 store | 是已准入内容的派生表示，不应反向升级 authority |

## 3. Memory Source Matrix（真实代码）

| Source | Trigger | Local/AI | Output | Canonical? | Repository/store | Scope | Projection | Failure behavior |
|---|---|---|---|---|---|---|---|---|
| Direct Chat automatic | 主回复成功 + 未归档消息达到 `summaryTriggerRound`（10–100，默认 50；消息数 rounds×2），且无 in-flight/cooldown | `memory_extract`，延迟 200ms | `KnowledgeClaim[]` + `ConversationSummaryRecord` | claims 先 canonical | `phone_character_knowledge_claims`、`phone_conversation_summaries` | active relation 的 character/relation/identity/conversation | summary；当前 hook 不写 legacy compatibility snapshot | 主回复已交付；失败返回 -1，marker 不前移并进入 5 分钟 cooldown |
| Direct Chat manual | Memory 面板/聊天记忆操作显式触发 | `memory_extract` | 同上，按 batch | claims 先 canonical | 同上 | direct relation exact scope | summary；当前 hook 不写 legacy Memory | UI 报错；失败 batch 不推进 marker，可再次执行 |
| Immediate summary | App“一键归档/立即总结” | `memory_extract` | claims + one summary | claims 先 canonical | claims + summaries | relation 必须存在；缺 relation 直接拒绝 | summary；不写 legacy Memory | canonical 失败显示错误；summary 失败保留 canonical并 warning |
| Group extraction | 群聊达到 threshold 或手动归档 | 每 batch 一次 `apiChat` | 一份群摘要，按 participant fan-out 成 scoped claims/summaries | 每 participant claim canonical | claims + summaries | participant relation/identity；`conversationId=group:<id>` | participant summary；不写 legacy snapshot | 任一 batch/写入失败返回 -1，不推进 marker |
| Offline single sync | 用户确认/设置同步；有未同步 source 且 `canSyncOfflineStoryToMemory` 通过 | 每 story 一次 `memory_extract`，可 fallback/repair/model fallback | accepted offline claims + stable summary | claims 先 canonical | claims + summaries；story metadata | story relation/character/identity/conversation | `offline-story-summary:<story>:<character>`；可能 CharacterEvent | provider/parse/zero claim/canonical/summary 失败：story 保留并标 failed，可手动重试 |
| Offline group sync | group story exit/manual sync | 每 participant 顺序一次 `memory_extract` | participant claims + stable participant summary | claims 先 canonical | claims + summaries；story | each participant relation/identity/conversation | participant summaries；不写 direct legacy | 缺 participant/summary/写入失败不标 synced |
| Offline handoff | offline 回 online；pending handoff 或已同步 summary | 无 provider 的 raw handoff；online read 可用 | legacy handoff `MemoryItem` 或 ephemeral summary adapter | 否，是 continuity bridge | OfflineStory store、legacy memory/summary read projection | relation/story；group fail-closed | online prompt 临时 timeline block；durable summary+回复数达标才 acknowledge | provider/summary 失败保留 raw pending；不阻塞已交付 online reply |
| Offline confirmed event | sync 成功且用户显式确认、source/reality policy 通过 | local deterministic | `CharacterEvent` | Event canonical（不是 Memory claim） | `phone_character_events` | relation/character/identity | relationship/life event projection | policy/append 失败不创建 event，不回滚已写 claim |
| Manual Memory add/edit | Memory Center 用户输入或编辑 | local | manual claim；编辑为 replacement/supersede | 是 | claims repository | relation/character/identity/conversation | 不自动生成 summary/legacy mirror | invalid scope/policy/write failure保留旧记录 |
| Manual delete/retract/recall | Memory Center 删除、撤回、关闭 recall | local | retract/remove/recallDisabled | canonical mutation | claims/legacy repository | exact relation where available | summary 可 stale-mark；legacy snapshot 过滤 | stale 标记失败不让 claim 重新可用 |
| Cinema save/archive | 用户显式保存或归档观影讨论 | local | manual claim | 是 | claims repository | discussion relation scope | 无自动 legacy write | claim/write 失败取消/保留讨论 |
| Reading AI candidate | AI response 含 validated `memoryCandidate` | AI + local validation | unpersisted `ReadingMemoryCandidate` | 否 | reading store until explicit confirm | reading room + book + relation/identity/conversation | `confirmReadingMemoryCandidate` 只创建 legacy-shaped `MemoryItem`；当前 AppReading 不自动调用 | malformed/anchor/source mismatch 拒绝 |
| Reading preserve | 删除房间时用户选择 preserve | local | 仅 user-authored comments → manual claims | 是 | claims repository | comment scope | 无 AI comment promotion | 缺 scope/写失败取消删除 |
| Moments generated post | Moment generation | one `moment_generate` | `Moment` + legacy-shaped `memory` return | Moment canonical；memory return 未准入 | `phone_moments_v3`；return 仅内存 | owner identity + optional relation | AppChat 只持久化 Moment，明确不写 relation Memory | guard/validation failure skip |
| Diary | lazy（≥20 relation messages 且近 24h 无角色日记；auto once/day）或 manual | one `diary_generate` | `DiaryEntry` + `DiaryGenerationTask` | Diary store only | `phone_diary_entries`、tasks | owner/relation/conversation | Diary cognitive context separate；不自动 Truth | 失败标 task failed，不逆转主回复 |
| InnerVoice | inline post-reply 或 refresh | one `inner_voice` | `InnerVoiceRecord` | feature record only | `phone_inner_voice_records` | relation/group/conversation + trigger message | 未发现自动 Truth/Memory projection | failure isolated |
| Character Phone | progression/generation | `character_phone_generate` | phone message/post/diary/note/todo/schedule/gallery/lifeEvent | phone state only | Character Phone repository/IndexedDB | phone/character | 未发现 MemoryService/KnowledgeClaim writer | feature-owned save/retry |
| Proactive | scheduler/catch-up/background pass 或 invitation | `proactive_message` 或 direct reply | messages/topics/appointments | feature state only | message/schedule/proactive topic stores | relation/identity | 未发现 Memory/Truth/Event writer | scheduler/pass failure isolated |
| Forum/Moment network | public post/comment/reply/like/story progression | feature-specific AI | public records/events | feature stores/events | forum/moment/story repos | public actor/network | public-safe projection，不写私有 Memory | feature guard/approval |

## 4. Direct/Group extraction audit

### 4.1 MemoryService 与 MemoryExtractor

`src/domain/memory/MemoryService.ts` 是 facade：retrieval、formatting、`extractMemories` delegation、legacy duplicate check/merge；它不直接写 repository。

`MemoryExtractor.extractMemories` 的真实顺序：

1. 将 `recentMessages` 序列化为带 id/role/text 的 history，character profile 截断至 6000 字符。
2. 调 `MemoryExtractionApi`，由 `apiExtractMemories` 发 `/api/extract-memories`。
3. backend 失败为 network 时走 browser-direct；direct 输出不合格时 `parseOrRepairKnowledgeExtractionOutput` 最多再发一次 repair。
4. `apiExtractMemoriesWithModelFallback` 在 primary 返回 error 且 fallback model 不同处再调整个 `apiExtractMemories`；每次 wrapper 都是新的 Ledger logical request。
5. `normalizeExtractedKnowledgeCandidate` 要求 statement/kind/subject/temporalStatus/sourceMessageIds/evidenceQuote，且 source IDs 必须来自输入。
6. chat 最多 5 条、offline 最多 8 条；`filterItems` 可更严格筛选。
7. evidence quote 必须出现在来源消息或 prompt 序列化文本；全为 user source 时用 quote，否则用 statement。
8. candidate 带完整 relation/character/identity/conversation、source kind/messageIds、producer `memory-extractor.<scenario>.v1`、evidenceKey、confidence、recordedAt、temporalStatus。
9. `evaluateKnowledgeWrite` 做 scope、evidence、low-information、question/roleplay、offline policy、truth/temporal normalization。
10. accepted claims 中 asserted/confirmed trusted subset才会生成 legacy-shaped `MemoryItem`；当前 chat/offline caller 只提交 claims+summary，因此该返回不自动保存。

### 4.2 输出分类

协议允许 `kind: fact|preference|plan|belief|hypothesis`、`subject: user|character|relationship|other`、`temporalStatus: past|present|future|timeless|unknown`。Prompt 要求计划用 plan+future、可能/假设用 hypothesis，问句/建议/括号动作/system instruction/roleplay 不输出；一条候选只表达一个命题。

这不是独立 event/scene 类型系统：过去事件仍是 `fact+past`，relationship 判断是 `subject: relationship`，belief/hypothesis 仍是 claim。短期情绪/当前 Scene 没有独立 canonical intake 类型。

### 4.3 Batching/threshold

`useChatMemoryExtraction` 以 `historyMemoryLimit` 为 batch size，clamp 10–200，逐 batch 顺序调用。自动路径是在 post-reply threshold 达到后把未归档消息交给 hook；手动路径可以显式传消息并 bypass marker。当前是 **threshold-triggered extraction + sequential batches**，不是 durable queue，也不是跨请求 true consolidation worker。

Group 每 batch 先生成一份 80–180 字摘要，再按 participant 构造 scoped claims/summaries；participant 不并发。Direct 每 batch 一次 structured extraction，再建 source-backed summary。

重复保护来自 marker、source message IDs/evidenceKey、claim id/meaning dedupe、summary meaning merge、offline stable summary ID、handoff state；没有统一 extraction-run idempotency record。Direct extraction 的 `existingMemories` 传入空数组，重跑由 repository meaning dedupe 吸收一部分重复，但 claim ID 会重新生成。

## 5. MemoryWriteCoordinator 深度审计

调用方：`useChatMemoryExtraction` direct/group、`App.tsx` immediate summary、`useOfflineStoryMemorySyncActions` single/group、`AppMemory`、`AppCinema`、`AppReading`。

`commitMemoryWriteBundle` 接收 claims、summary/summaries、完整 legacy memories snapshot，以及 write/append callbacks：

1. 有 claims 时先写 canonical；缺 writer、false、exception 返回 `canonicalWritten:false`，不执行 derived。
2. canonical 成功后写 summaries；失败只令 `summaryWritten:false`。
3. 最后写 compatibility memories；失败只令 `memoriesWritten:false`。
4. `complete` 是三者全成功；没有跨 repository rollback/transaction。

它是**写协调器，不是 admission**：不检查 scope、evidence、truthStatus、temporalStatus、subjective/Scene、importance 或 source refs。调用方负责 `evaluateKnowledgeWrite`/专用 policy；repository 负责 id/meaning dedupe、summary stale marking。canonical failure 阻断 projection，summary/legacy failure 不删除 canonical。重试由 caller 决定；localStorage whole-array read/merge/write 无 revision/CAS，跨 tab last-write-wins 仍存在。

## 6. AI Cost Map 与 logical request/attempt

| 用户/后台动作 | logical request | provider attempts/额外调用 |
|---|---:|---|
| Normal direct chat | `chat_reply=1` | backend 1；network/route missing 可 browser direct +1；4xx 不 browser fallback |
| Normal chat 达 threshold | 另有 `memory_extract=1/batch` | backend；network fallback；malformed direct repair；model fallback 重新建新的 logical envelope |
| Manual/immediate summary | `memory_extract=1/batch` | 同上 |
| Group reply + extraction | group reply 外另有 `memory_extract=1/batch` | 一份群摘要 request，fan-out 多个 participant claim/summary |
| Offline single exit | `memory_extract=1` | backend/direct/repair；model fallback可能新的 logical request |
| Offline group exit | 每 participant `memory_extract=1`，顺序 | 任一 participant/summary/write失败不标 synced |
| Diary eligible | `diary_generate=1` | 无独立 repair layer，失败为 task failed |
| Moment/Reading/Phone/InnerVoice/Proactive | 各自 purpose | 不应计入 Memory extraction |

Ledger 一条 record = 一个 logical AI request；`providerRequestCount` = 同一 session 中 `markAttempt` 次数。backend→browser fallback 是同一 request 的 multiple attempts。format/alias/context retry 如果重新调用 wrapper则是新的 logical request，可用相同 parentActionId 关联；当前 chat→memory→diary 的完整 follow-up lineage 尚未串联。provider/model/transport 字段表示最后一次 attempt 状态；没有逐 attempt record，也不保存 Prompt/response/API key/Authorization。

## 7. 0 Memory-AI 行为、candidate 与 admission

未达到 threshold 时，哈哈/嗯/emoji/sticker/简单确认通常不会触发 extraction；达到 threshold 后仍可能随 batch 送入 LLM，再由 low-information policy 拒绝。没有消息内容级 pre-LLM deterministic bypass。send-only、regenerate、仅保存消息、Diary/InnerVoice/Phone feature store 本身不产生 `memory_extract`。

真实候选概念：

- `ExtractedKnowledgeCandidatePayload`：AI JSONL candidate；
- `KnowledgeWriteCandidate`：交给 policy 的候选；
- `ReadingAiMemoryCandidate`/`ReadingMemoryCandidate`：带 reading scope/anchor 的未持久化候选；
- Moment generator 返回的 legacy-shaped memory（当前不写）；
- `MemoryExtractor.extractedMemories`：trusted claim 的兼容候选（当前 callers 不保存）；
- ConversationSummary 是 derived projection，不是 pending candidate；
- `offlineStory.onlineHandoff` 是 continuity capsule，不是 Truth candidate；
- Memory Center 的“候选”只是 UI 分类。

未来可统一的是带 exact scope/source refs/producer/kind/temporal/confidence 的 proposal；Moment/Reading/Offline handoff 仍需 feature-specific admission policy，不能只按字段名合并。

## 8. Scene、Relationship、Subjective pollution

### Scene

普通 extraction 禁止 roleplay/动作/问句；quote 必须有来源；有 temporalStatus。Offline Prompt 忽略衣着、姿势、逐句对白、转瞬场景；offline filter 删除代词、显式 screenplay detail 和确定方向事实；online sanitizer 把 handoff 变成事实摘要并移除对白/动作。保护不均匀：普通过去事件仍用 fact+past，没有独立 Scene admission；legacy Memory 仍可保存自由文本。因此这是弱于硬 schema 的防线。

### Relationship

普通 extraction 只写 claim，不直接修改 `CharacterRelationship`。唯一明确 mutation 是 offline 单角色 sync 后的 `applyConfirmedOfflineRelationshipTransition`：要求 active、offline_story、userConfirmed、asserted/confirmed、非 hypothetical/negated，且文本匹配显式关系确立表达。“你是我最重要的人”不会直接升级 partner。这是 hard separation，但 offline policy 是专门例外。

### Subjective

Diary、InnerVoice 不自动写 Truth；Moment public post 不自动写 private Memory；Reading candidate 需 explicit confirmation；belief/hypothesis可存为非权威 claim。最大风险是未来 caller 把 legacy-shaped candidate 或用户手工复制的 subjective 文本当作 authoritative claim，导致 provenance 丢失。

## 9. Provenance、temporal、scope、idempotency

| Path | provenance 当前有 | 明确缺口 |
|---|---|---|
| Chat | source kind、messageIds、authorship、producer、evidenceKey、scope | actor/target 不是一等字段；没有 admission decision record |
| Offline | source storyId/messageIds、offline producer、scope、confirmed policy | story-relative occurredAt 与 recordedAt 分离但无统一 contract |
| Manual | sourceRecordId、manual producer、full relation scope | 默认没有 occurredAt；用户 authority implicit in manual path |
| Cinema/Reading | discussion/comment/anchor/sourceRecordId、scope | AI candidate 在 confirm 前无统一 producer/admission state |
| Summary | sourceMessageIds/sourceClaimIds、generator、generatedAt、range | derived 状态与 canonical 不是同一事务 |
| Event | source key/story id、occurredAt/recordedAt、scope | source 是 compact string，非结构化 refs |
| Legacy Memory | 可选 source IDs/feature fields | schema 历史上允许弱 scope/provenance |

Claims 有 `occurredAt?`、`recordedAt`、`validFrom?`、`validTo?`、temporalStatus；summary 有 generatedAt/range；legacy Memory timestamp；Diary occurred/created/updated；Event occurred/recorded；appointment 另有 scheduled time。没有跨 producer 的统一 plannedFor/validUntil contract。

`evaluateKnowledgeWrite` 要求 relation/character/identity/conversation；Extractor 缺完整 scope 时拒绝 legacy output；Repository exact-match 不把缺 conversation 当 wildcard。Coordinator 不校验 scope。Claims 按 id/evidenceKey/meaning dedupe；summary 按 scoped meaning merge；offline summary ID 稳定；marker/in-flight/cooldown 防重复。跨 tab whole-array 写和重复 extraction 的新 claim ID仍是风险。

## 10. Offline 与 Online 链路

### Offline exit

```text
OfflineStory messages
 -> getOfflineMemorySourceMessages（排除 imported/narration/empty）
 -> resolve participant + relationship
 -> canSyncOfflineStoryToMemory
 -> MemoryService.extractMemories(scenario=offline)
 -> evaluateKnowledgeWrite
 -> commit claims -> summary
 -> single story: applyConfirmedOfflineRelationshipTransition
 -> mark story synced / persist
 -> optional confirmed CharacterEvent
 -> online pending handoff；durable summary + required replies 后 acknowledge
```

single story 等待 extraction 和 canonical+summary write 后才标 synced；group 逐 participant 等待所有 summary/write。失败保留 story、标 `memorySyncStatus=failed`、可重试。无 source message 可不调用 AI直接标 synced。Raw handoff 是短期 continuity fallback，不是 canonical admission。

### Online post-reply

```text
main reply delivered
 -> postReplyCoordinator.schedule(normal_send)
 -> chatSideEffectController.afterReplySuccess
    -> offline: append story only
    -> online threshold: schedule memory extraction after 200ms
    -> success updates summary marker; failure cooldown
    -> optional moments cover patch
 -> maybeGenerateDiaryAfterChat (relation, non-group, >=20 messages, daily guard)
    -> diary_generate -> task/entry store
```

Memory/Diary 不阻塞已交付主回复；coordinator 捕获 side-effect failure。Regenerate 使用 `regenerate_none`，不跑 normal Memory/Diary。InnerVoice、proactive appointment、offline handoff 等由 caller-owned callbacks 维护。

## 11. Failure Matrix

| Stage | Failure | Main reply affected? | Partial data? | Retry |
|---|---|---|---|---|
| main provider | backend network/timeout | 是（主请求）；side-effect 不受影响 | Ledger only | browser direct where allowed |
| memory extraction | provider error | post-reply 否；offline 是（返回/同步被阻塞） | 无 claim；offline story failed | cooldown/manual/offline retry；fallback/repair/model fallback |
| extraction parse | malformed | post-reply 否；offline 可失败 | 通常无 claim | direct repair once |
| canonical write | false/exception/quota | post-reply 否；offline not synced | summary/legacy 被阻断 | caller retry |
| summary write | false/exception | 否 | canonical 留下，summary 缺失 | chat marker 不前移；offline failed |
| legacy write | false/exception | 否 | canonical/summary 可能存在，legacy stale | compatibility/manual retry |
| Diary | provider/parse | 否 | failed task | later/manual eligible |
| CharacterEvent | policy/append | 否 | claims/summary 可已存在但无 event | no automatic rollback |
| storage unavailable | read/write failure | best-effort post-reply 不应反转；manual/offline 报错 | partial/in-memory | storage repair/manual retry |

## 12. Token waste、local filter、future design

潜在浪费：full extraction batches + 6000-char profile、group transcript fan-out、Truth+Summary+legacy/handoff duplicate、repair 重新发送原任务和最多 12000 字 invalid output、backend→browser duplicate transmission、model fallback、offline raw handoff、Diary/InnerVoice separate requests。仅记录，不优化。

现有数据支持未来在 LLM 前检查 empty/whitespace、emoji/sticker-only、low-information acknowledgement、system/narration marker、imported offline source、无新 source IDs、已成功 marker 的重复 batch；必须保守，短 preference/plan 不能按长度全拒。

未来最小 `MemoryCandidate`（设计草案，不建 production type）：

```text
candidateId
scope: relationId + characterId + userIdentityId + conversationId?
sourceRefs: messageIds/eventIds/storyId/sourceRecordId
sourceKind + authorship + actor/target（若可知）
producer/version
candidateKind: fact | event | preference | plan | belief | hypothesis | scene | subjective
statement/evidenceRef
occurredAt? / recordedAt / validFrom? / validTo?
confidence / importance?
admissionState: proposed | accepted | rejected | superseded
rejectionReason?/admissionReason?
idempotencyKey
```

Stage 4C-2 必须先回答：什么进 Truth、什么只做 Event/Topic/Scene；belief/hypothesis 如何保持非权威；什么绝不能进 Truth；AI 是否永远只能 propose；actor/recipient 如何防 pronoun reversal；importance/confidence 谁决定；future plan 如何过期；duplicate 如何 supersede/retract；subjective/offline/reading/public 内容何时必须显式确认；projection failure 如何 retry；跨 tab/model retry 的 stable idempotency key；parentActionId 如何连接 chat→memory→diary而不让 feature 依赖 monitoring implementation。

未来适合后台化的操作：online threshold extraction、summary rebuild、legacy projection、Diary、canonical event projection。Offline consolidation 仅可在保留显式 progress/失败状态后后台化；当前用户返回线上前仍等待 canonical+summary durable write。

## 13. Characterization 与验证

本阶段没有新增测试文件；既有测试已覆盖主要当前不变量：

- `scripts/memoryWriteCoordinator.test.ts`：canonical-before-summary/compatibility、canonical failure blocks projection、later failure leaves canonical；
- `scripts/characterTruthWritePolicy.test.ts`、`scripts/knowledgeWriteQuality.test.ts`：scope/evidence/low-information/question/offline/temporal；
- `scripts/characterTruthExtractionPipeline.test.ts`、`scripts/chatMemoryExtractionHook.test.ts`：source IDs、batch、marker、coordinator；
- `scripts/offlineStorySummary.test.ts`、`scripts/offlineRelationshipTransition.test.ts`：offline filtering、stable summary、relationship guard；
- `scripts/readingAiResponseProtocol.test.ts`：candidate validation/explicit confirmation；
- post-reply coordinator、Diary、Moment、InnerVoice、Character Phone tests：feature store 与非阻塞 side effects；
- `scripts/memoryExtractionModelFallback.test.ts`：repair/model fallback。

未新增 Browser debt。既有债务保留：`DIRECT_CHAT_BROWSER_SMOKE`、`REAL_MEMORY_SHADOW_REPORTS_BLOCKED`、`BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`。

## 14. 最终 49 项索引

1. 所有 Memory-producing paths：第 3 节。  
2. Source matrix：第 3 节。  
3. Capture/extraction/admission/projection：第 2 节。  
4. 真实 admission layer：隐式/缺失，第 1 节。  
5. Coordinator：第 5 节。  
6. MemoryService：第 4.1 节。  
7. Direct Chat trigger：第 3、4.3 节。  
8. Group trigger：第 3、4.3 节。  
9. Offline trigger：第 3、10 节。  
10. Manual writes：第 3 节。  
11. Moments candidate：第 3、7 节。  
12. Reading candidate：第 3、7 节。  
13. Diary：第 3、8、10 节。  
14. InnerVoice：第 3、8 节。  
15. Character Phone：第 3、8 节。  
16. Proactive：第 3、8 节。  
17. Per-path AI count：第 6 节。  
18. Attempts/fallback：第 4.1、6 节。  
19. Batching：第 4.3 节。  
20. Threshold：第 3、4.3、6 节。  
21. Candidate concepts：第 7 节。  
22. Scope ownership：第 9 节。  
23. Temporal ownership：第 9 节。  
24. Provenance completeness：第 9 节。  
25. Idempotency：第 4.3、9 节。  
26. Scene pollution：第 8 节。  
27. Relationship pollution：第 8 节。  
28. Subjective→Truth：第 8 节。  
29. Duplicate risk：第 4.3、9 节。  
30. Token waste：第 12 节。  
31. Local filters：第 12 节。  
32. Online post-reply：第 10 节。  
33. Offline exit：第 10 节。  
34. Current blocker：Offline canonical+summary durable write before synced，第 10 节。  
35. Failure matrix：第 11 节。  
36. Future async candidates：第 12 节。  
37. Minimum MemoryCandidate fields：第 12 节。  
38. Admission questions：第 12 节。  
39. Files added：仅本文档。  
40. Tests added：无；既有 characterization 见第 13 节。  
41. Total tests：`npm test` 549/549 passed。  
42. Lint：`npm run lint` passed。  
43. Dependency gate：passed，105 allowlisted boundary edges / 3 baseline cycles。  
44. Commit：本阶段唯一 docs commit，提交信息为 `docs: audit memory intake and admission boundaries`；最终 hash 以提交后 `git rev-parse HEAD` 为准。  
45. Final HEAD：提交后由 `git rev-parse HEAD` 确认；阶段报告记录最终完整 hash。  
46. User data impact：无；docs-only，不写 localStorage/IndexedDB。  
47. Rollback：revert 本阶段单一 documentation commit。  
48. Existing debts：`DIRECT_CHAT_BROWSER_SMOKE`、`REAL_MEMORY_SHADOW_REPORTS_BLOCKED`、`BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`；无新增 Browser debt。  
49. Stage 4C-2：先设计显式 candidate/admission/lineage/idempotency contract，再另行批准；本阶段不实现。

## 15. Stage boundary

Stage 4C-1 完成后停止。没有创建 `MemoryCandidate`、`MemoryIntakeEngine`、queue、worker、schema migration、Prompt/read switch、legacy cleanup 或 production behavior change。下一阶段必须单独批准。
