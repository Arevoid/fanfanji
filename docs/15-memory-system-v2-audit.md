# Stage 4A — Memory System V2 只读架构审计

审计基线：`494292449980f701c3cddffa9bd1971d899eed3c`（`refactor/v2-architecture`）

本文件是 Stage 4A 的只读审计与 V2 设计输入。它不批准、也不实施 Stage 4B 的生产代码改造；文中 `should`/`建议` 均为后续设计，不是当前行为。

## 1. 审计范围与结论

### 1.1 覆盖范围

审计了 Memory/Truth、Conversation Summary、legacy `MemoryItem`、关系 `compressedMemory`、CharacterEvent/RelationshipState、Diary、User Memo、OfflineStory/handoff、Moments、Forum、Music、Character Phone/Proactive、Reading memory candidate、OOC/Behavior Correction、Cognitive Context/Prompt Adapter、所有对应 localStorage/IndexedDB repository，以及 direct chat / regenerate / after-reply 的 AI 调用入口。

### 1.2 结论

当前系统不是单一 Memory store，而是多个并存的事实、摘要、事件和连续性投影。最可靠的边界是：

- Truth Layer 的 claim 有完整 `characterId + relationId + userIdentityId + conversationId` 作用域、来源、truth/temporal status，并由 `truthRetrievalService` 作为 direct-chat 的事实权威。
- CharacterEvent/RelationshipState 是关系生命周期投影，不等价于 Memory；Diary adapter 明确不投影用户私有 Memory。
- legacy `MemoryItem` 仍存在于用户 Memory vault、离线 handoff 和部分 feature compatibility 路径；其文本自由度、来源可追溯性和写入校验弱于 Truth。
- `compressedMemory` 是关系/角色级旧摘要，现被标记为 weak reference 或迁移到 Summary；它不是当前 Scene，也不是可验证 Truth。
- Offline→Online 有较强的 pending handoff 和 source-message 过滤，但 durable summary 失败时仍依赖原始 handoff 的短期连续性；这是安全的 best-effort 设计，同时也是必须单独建模的跨运行时边界。
- 主要风险不是“完全没有隔离”，而是不同 projection 同时注入时的重复、来源强度不一致、历史事实/当前场景混淆，以及部分 feature 仍从 legacy Memory 读取。

综合风险：**scope isolation 中高；provenance/temporal semantics 中低；cross-projection duplication 中高；offline continuity 中高但复杂；整体高风险（若直接继续堆叠更多 Memory 写入）**。

## 2. 统一分类（当前事实与目标词汇）

| 类别 | 当前实现 | 允许表达 | 当前禁止的推断 |
|---|---|---|---|
| Truth / Fact | `KnowledgeClaim`；Canonical `MemoryRecord` 是域词汇/转换层，不是独立持久化表 | 已确认/陈述/偏好/计划/信念/假设/争议/旧数据待核验 | 把 plan/hypothesis/legacy 当作已发生事实 |
| Event | `CharacterEvent`，如 relationship-created、confirmed offline-story completed | 有作用域、时间、来源的生命周期事件 | 用事件替代关系内部状态或 Memory |
| Episodic Memory | legacy `MemoryItem`、offline handoff、summary projection | 受限的过去连续性/可检索兼容内容 | 直接当作 Truth；把当前 prompt 当作历史 |
| Relationship State | `RelationshipState`/timeline read-only projection；Relationship 自身仍持久化 | stage、tone、open loops、boundaries、milestones | 当作永久 Memory 或跨关系状态 |
| Belief / Impression | Truth claim kind `belief`/`hypothesis`、行为分析、短时 emotion | 显式标记为弱/短时信号 | 写成事实、关系变更或 CharacterEvent |
| Summary | `ConversationSummaryRecord`、`compressedMemory`、offline canonical summary | 可重建压缩缓存 | 覆盖 source claim、制造细节 |
| Diary / private reflection | `DiaryEntry`/generation task | 角色私密反思、受 relation scope 保护 | 作为用户 Truth 或通用 Memory 回写 |
| Scene | 当前 chat history、OfflineStory transcript、WorldBook/场景 prompt | 当前/临时叙事上下文 | 把场景设定自动写入长期事实 |

关键不变量：`Memory != Scene != RelationshipState`；过去 Event 不等于当前 Scene；Summary/Diary/Belief 不等于 Truth；所有 relation-private 数据必须同时匹配 character/relation/identity，缺失 relation 不可作为 wildcard。

## 3. 数据与存储清单

| 数据 | 类型/入口 | 存储 | 作用域与审计结论 |
|---|---|---|---|
| Truth claims | `KnowledgeClaim` | `characterKnowledgeClaims` localStorage | exact relation/character/identity/conversation；有 source、status、temporalStatus、supersedes |
| Conversation summaries | `ConversationSummaryRecord` | `conversationSummaries` localStorage | exact scope；通过 sourceClaimIds 可验证 stale；derived cache |
| Behavior corrections | `BehaviorCorrectionRecord` | `behaviorCorrections` localStorage | relation-private rule；不应与事实混存 |
| Legacy Memory | `MemoryItem` | `phone_memory_vault_items` localStorage（压缩内容） | character/relation 可选；读侧不把缺失 relation 当全局，但写侧仍可误标 |
| Character compressed memory | `Character.compressedMemory` | character/relationship repository | 旧摘要，来源弱；迁移为 summary projection，当前仍有兼容读取 |
| Character events | `CharacterEvent` | `phone_character_events` localStorage | exact relation/character/identity；repository 去重、支持 retract |
| Relationship/timeline | `CharacterRelationship` + read-only projection | `characterRelationships` localStorage | 关系状态本体与事件投影，不是 Memory |
| Diary | `DiaryEntry`, tasks, shares, translations, drafts | diary localStorage keys | owner/relation/conversation scoped；Diary cognitive context 不读 Memory |
| User memo/todo | `phone_memo_notes`, `phone_memo_todos`, mention ledger | localStorage | owner/private-life context；load 时按 relation ledger 节流；不是 Truth |
| OfflineStory | `OfflineStory` | legacy IndexedDB + optional split DB，App fallback localStorage | story/relation/character/member scope；含 imported context、handoff、sync markers |
| Moments/Forum/Reading/Music/Phone | feature-specific records | moments/forum/reading/music/phone stores | 大多是 feature state；部分可生成 Memory candidate 或读取 relation Memory，尚未全部 canonicalize |

## 4. 写入路径审计

| 写入路径 | 触发/类型 | AI 是否参与 | 阻塞/失败 | 去重/来源/时间 | 结论 |
|---|---|---|---|---|---|
| Chat automatic/manual extraction | summary threshold、手动归档、immediate summary | `MemoryService.extractMemories` → backend；browser fallback/repair；可 model fallback | normal reply 后 200ms 调度；不阻塞已交付回复；失败返回 -1、5 分钟 cooldown | Truth first → summary → legacy compatibility；claims 带 message IDs/producer/temporal status | 主路径已有 canonical write boundary；AI output 仍需继续加强证据与并发审计 |
| Group extraction | 每批 transcript，按 participant 生成 scoped claim/summary | 每批一次 `apiChat` | group participant 顺序执行；失败不应部分标记 synced | participant relation scope | 不进入本阶段 direct chat V2；需保持 group 隔离 |
| Immediate summary | UI/关系 marker 触发 | 同上 | App handler await；不写 legacy Memory | summary marker after canonical/summary success | 可作为 archival projection，不应成为 prompt Truth |
| Offline exit sync | explicit user confirmation；continue、single character、relation、user-authored message | per relation/member extraction + fallback/repair | exit finalization await sync；失败保留 story 并标 failed | stable offline summary ID、source story、confirmed facts/event | 强边界但复杂；AI summary 与 deterministic filtering 需独立 provenance |
| Offline handoff | story exit creates pending handoff | no provider for raw handoff; later extraction optional | raw pending survives until durable summary + replies；主聊天不应等待 provider | story/message IDs；2h freshness；3 replies default | 目前最清晰的 Scene→continuity bridge |
| OOC/behavior correction | user correction | no required provider | synchronous local write | relation source, status | 是 rule，不应混入 fact Memory；旧错误不会自动 supersede |
| Manual Memory/Truth | Memory page/knowledge UI | no | local write | user-authored; relation required in newer UI | legacy store compatibility remains weakly typed |
| Relationship created / offline completed event | explicit relationship creation / explicit confirmed sync | no | local append; failure should not block reply | deterministic IDs; event policy/reality policy | CharacterEvent is lifecycle truth, not a Memory card |
| Diary | lazy after ≥20 relation messages and ≥12/24h policy，or manual | one `diary_generate` request | scheduled after reply; catches failure into task status; never throws to main reply | taskKey relation+day+trigger, diary id | background reflection; must not become Truth automatically |
| Moments | approved character post generation | one generation request; may return legacy Memory candidate | generation guard; persistence separate | sourceMomentId + relation/owner; legacy random IDs remain | public Moment ≠ private Memory；candidate should require future explicit admission |
| Reading candidate | structured AI response `memoryCandidate` | reading provider | validation; app-owned decision | source reading IDs | candidate is not automatically a chat Truth without policy |
| Music | recommendation reads relation Memory/messages | optional AI recommendation | fallback local; no Memory write | relation state | context consumer, not Memory writer |
| Phone/proactive | phone state, topics, routine, background work | feature-dependent | feature-owned | feature stores | exclude from Direct Memory repository unless explicit source policy |

### 4.1 生产语义

当前 `MemoryWriteCoordinator` 的顺序是 canonical claims → derived summaries → legacy compatibility。canonical failure 会阻断后续 projection；summary failure 不删除 canonical，compatibility 可独立失败。这是必须保留的写入不变量。回调应保持幂等，但 localStorage array write 仍缺 revision/CAS。

### 4.2 AI 调用与最坏情况

目前已识别的 Memory-related provider purposes：

- `memory_extract`：每个 extraction batch 一次 backend request；backend network fallback 可能追加一次 browser direct；格式修复可能追加一次 repair；model fallback 可能再进行一次选择模型请求。最坏情况下，一次逻辑 extraction 会有多次 provider attempts，但 Ledger 仍按一个逻辑 request 记录并累加 `providerRequestCount`。
- `diary_generate`：一次 diary JSON request；失败只标 task failed。
- `summarize-personality`：archive/personality summary，属于 memory-like 但不是 Truth claim。
- Moments/Reading/Music 等各有 feature AI request，不应被误计为 direct chat Memory extraction。

普通 direct chat 的 Memory side effect 是阈值触发的后台 extraction，不是每条消息必发；正常 direct reply 本身 provider request count 不因 Memory 读取增加。Offline→Online 退出可能等待一次或多次 memory sync，但正常在线聊天只消费已经持久化/临时 handoff。

## 5. 读取与 Prompt 注入管线

### 5.1 Direct chat / regenerate

```text
用户消息先持久化（normal send）
  → AppChat/controller 收集 relation/identity/time/history/feature material
  → buildDirectChatContextSnapshot（历史去重、current/older budget、cross-day boundary）
  → Truth retrieval（exact scope；claims > corrections/summary；live-message duplicate suppression）
  → legacy/offline handoff / Moments / Music / Forum / Diary shares / User Memo / WorldBook 各自 producer
  → buildDirectChatSystemInstruction（既定 block order）
  → PromptComposer / existing request executor
  → parse + sequential candidate delivery
  → PostReplyCoordinator：normal send 的 best-effort side effects；regenerate none
```

Regenerate 先删除目标 AI message，使用前一条 user message 作为 target/history boundary，复用 direct history snapshot 和 system instruction builder；它保留 compact time-log、OOC correction、regeneration candidate IDs 与 `regenerate_none` post-reply policy。当前仍存在 feature material 在 AppChat/regenerate caller 中分别收集的重复，Stage 4A 不修改它。

### 5.2 Truth retrieval

`retrieveTruthForPrivatePrompt`：

1. exact `relationId + characterId + userIdentityId (+ conversationId)`；public scenario 隐藏 claims；
2. temporal active、status active、未 superseded、未 recallDisabled；
3. rank by query text、truth/source quality、importance、confidence、recency；
4. 先选 claims，再 corrections，再不重复 sourceClaim 的 derived summaries；
5. source message 已在 live prompt 时抑制同一 claim/summary；
6. prompt budget 默认 Truth 6000 chars，整体 long-term recall limit 由 caller 控制。

Truth prompt 明确把 plan、hypothesis、disputed、legacy 标出 caution；summary 明确为 non-authoritative cache。

### 5.3 Legacy Memory / compressedMemory / offline

legacy `MemoryRetriever` 仍有独立的 keyword/token similarity + importance/recency + 4800-char budget 路径；在 canonical mirrors 可用时部分 caller 会排除镜像，但不是所有 feature 都完全切换。关系 `compressedMemory` 进入 Cognitive Context 的 `legacySummary`，再由 prompt adapter 以 weak reference 形式展示。Offline handoff 可在 semantic recall 未命中时作为时间线/立即返回锚点强制加入，并明确“不是当前场景、不得补写缺失细节”。

### 5.4 重复/冲突矩阵

| 输入对 | 当前处理 | 残余风险 |
|---|---|---|
| Truth claim + source live message | source message IDs/text dedup | message text 与 claim 表达不完全相同会残留重复 |
| Truth claim + ConversationSummary | sourceClaimIds 抑制 | 无 sourceClaimIds 的 migrated summary 仍是弱摘要 |
| Truth + legacy Memory mirror | caller 可选 `excludeCanonicalMirrors` | feature caller 若未开启会重复 |
| Truth + compressedMemory | 不全局去重，legacy summary 以 weak reference 注入 | 同一事实可能二次出现，来源强度不同 |
| Offline canonical summary + legacy handoff | summary/memory marker 选择与 replacement | 迁移/修复窗口可能同时可见两份 |
| RelationshipState/Event + Memory | cognition adapter 分 block | 相同事件可能同时表现为 event 与 memory；语义需保持“event ≠ fact card” |
| User Memo/Diary + Truth | 独立 private-life block | 用户手工记录不应自动升级 Truth |

## 6. 作用域、时间和 provenance 审计

写入侧已要求 extraction context 缺失 relation/identity/conversation 时拒绝生成 legacy compatibility；KnowledgeClaim 也要求完整 scope。读取侧严格 exact-match，`isMemoryRecordVisibleToRelation` 对 identity-scoped record 不允许 fallback；CharacterCognitive Context 对 memories/events/timeline 同时过滤 relation/character/identity。

不足：legacy `MemoryItem` schema 仍允许缺 relation/identity，Memory repository 不验证 relation 属于 character/identity；`compressedMemory` 仍是旧文本字段；部分 Moment/reading/feature candidate 仍可先生成 legacy-shaped object；localStorage whole-array 写入没有跨 tab revision。时间字段在不同记录中混合“发生时间/记录时间/生成时间/更新时间”，需要未来统一 temporal contract。

## 7. Online ↔ Offline 连续性

### 7.1 Online → Offline

- `useChatStartOfflineFromMessage` 以当前 relation/character/identity 创建 story snapshot，复制受限的 manual Memory/knowledge snapshot 与 worldBook/context；它不是新的 Truth 写入。
- 生成阶段保留 story-local transcript；imported context、narration、markers 与真实 source message 有明确区分。
- story exit finalization 先持久化 story，再按 policy 决定是否 memory sync/handoff；workspace exit await 持久化、清 session、导航回 online。

风险：offline snapshot 仍可能同时携带 legacy Memory、compressedMemory、knowledgeSnapshot，造成 duplicate source；snapshot 是当时视图，不是 canonical repository revision。

### 7.2 Offline → Online

- `createPendingOfflineHandoff` 记录 source message IDs、时间窗口、pending 状态；source filter 排除 imported/narration/empty text。
- `buildPendingOfflineHandoffPromptBlock` 在 immediate return 直接提供最多 40 条（15 first + 25 last，单条 800 chars）原始、带 speaker 的隐藏上下文，并可附 durable summary。
- `recordOfflineHandoffDelivery` 只有 durable summary ready 且达到 required replies（默认 3）才 acknowledge；否则保留 raw handoff，避免 provider failure 让连续性丢失。
- 2 小时 freshness/query overlap 与 relation/story exact scope 限制旧 handoff；完成 summary 后可生成 ephemeral summary Memory adapter，但不必重新持久化 legacy Memory。

优点：阻塞边界、pending 保留、消息主体标注、时间线规则、明确禁止输出内部 marker。缺点：原始 handoff 可能暂时比 Truth 更强地影响 prompt；summary readiness 与 reply count 是经验阈值；没有独立 Handoff record/revision/attempt lineage；AI extraction 失败时 raw transcript 仍是临时安全 fallback。

## 8. 其他 memory-like feature 审计

- **Diary**：独立 owner/relation store；`buildDiaryCognitiveContext` 输入 `memories: []`，只接受 safe CharacterEvents、relationship projection、boundary/routine/time。生成失败只标 task，不影响主回复。Diary body 是 private reflection，不应自动进入 Truth。
- **User Memo/To-do**：用户主动记录，按 relation ledger 节流，在 direct prompt 以“私人生活上下文”注入；不是事实认证，也不应自动同步 Memory。
- **CharacterEvent/Relationship timeline**：relationship-created 与 user-confirmed offline completion 是 deterministic/lifecycle events；state 是 read-only projection，不替换 Relationship 或 Memory。
- **Moments**：公开内容生成有 public cognitive boundary；service 仍可返回带 `sourceMomentId` 的 legacy Memory candidate，当前应视为 candidate 而非自动 Truth。其公开可见性和私有 relation memory 必须继续分开。
- **Forum**：公共故事/评论 prompt 明确禁止读取真实 Memory/Relationship/InnerVoice；其 `memory` 词只代表协议/安全文本，不能按名称误判为写入 long-term memory。
- **Music**：推荐读取当前 relation 的 messages/memories，写入 relation music state；没有 Memory write。
- **Character Phone/Proactive**：写 phone state、topic/routine/continuity 等 feature state；proactive adapter 不读取 legacy compressedMemory，open context 为空；不得自动变成 direct chat Truth。
- **Reading**：structured `memoryCandidate` 带 source reading IDs，必须由 reading policy 决定是否进入 canonical Truth；不能因为 AI 输出字段叫 memory 就直接进入聊天 Memory。
- **InnerVoice**：`InnerVoiceRecord` 独立存储，当前未发现自动转 Message/Memory 的路径；用户手工复制后则失去可辨识 provenance，这是未来 intake 的已知边界。

## 9. 后续只读架构设计（不在 Stage 4A 实施）

### 9.0 跨运行时与 feature runtime 的最小形状

这些是未来的 data contract 草案，不是本阶段要创建的空壳文件：

```ts
type HandoffCapsule = {
  id: string; scope: ExactRelationScope; storyId: string;
  sourceMessageIds: string[]; startedAt: number; endedAt: number;
  durableSummaryId?: string; status: "pending" | "acknowledged";
  provenance: ProvenanceRef; // no raw prompt/response in monitoring
};

type MemoryDelta = {
  scope: ExactRelationScope; additions: IntakeCandidate[];
  supersedes: string[]; sourceRecordIds: string[]; producedAt: number;
};

type BackgroundConsolidationJob = {
  id: string; parentActionId?: string; purpose: "memory_extract" | "summary" | "diary";
  scope: ExactRelationScope; inputRefs: string[]; state: "queued" | "running" | "succeeded" | "failed";
  retryCount: number; bestEffort: true;
};
```

`HandoffCapsule` 负责 Offline→Online 的时间线交接，不是 Truth；`MemoryDelta` 是候选/已准入记录的增量，不是直接 Prompt 文本；`BackgroundConsolidationJob` 负责可重试、可观测的后台工作，不阻塞已交付 direct reply，也不拥有 provider 实现。三者都必须 exact scope、幂等 key、source refs、status 和 parent action attribution。

未来 feature runtime 的边界建议如下：

- **OfflineThread/Scene Runtime**：只保存 story-local messages、participants、scene metadata 和 handoff refs；scene 结束前不写 Truth。`OfflineStory` 现有 `importedContext`、narration/marker 过滤和 `memorySyncStatus` 可作为兼容输入。
- **Topic Runtime**：从 recent messages/approved events 得到短期 topic hints、repetition/cooldown；只影响 candidate-topic guidance，不写 Memory、不抑制用户消息、不改变事实。
- **Emotion Runtime**：保存 request-scoped/short-term emotion snapshot 与 decay；只作 soft prompt guidance，明确禁止转 Memory、Relationship fact 或 CharacterEvent（当前 adapter 已有该规则）。
- **Character Life/Growth Runtime**：以 CharacterEvent → RelationshipState/timeline 的可重建 projection 为核心；只接收 deterministic/confirmed lifecycle events，不能把 Diary/Memory/Scene 自动升级为 growth fact。

这些 runtime 都不应被 `DirectReplyUseCase` 直接拥有；它只消费已准备的 view 或调度 coordinator。

### 9.1 Canonical Character Memory Repository

建议一个逻辑 repository（底层可分表/分 key，先不迁移）：

```text
CharacterMemoryRepository
  ├─ TruthRecord / KnowledgeClaim (authoritative claims)
  ├─ EventRecord (lifecycle events)
  ├─ EpisodicRecord (confirmed episodic facts)
  ├─ RelationshipProjection (derived, rebuildable)
  ├─ SummaryRecord (derived cache)
  └─ IntakeCandidate (unadmitted proposal)
```

所有 record 需要 `scope`, `kind`, `temporalStatus`, `provenance`, `confidence`, `visibility`, `status`, `supersedes`；repository 只负责 validate/scope/append/retract/revision，不能负责 prompt formatting 或 provider calls。当前 `KnowledgeClaim` 可作为第一实现，`MemoryRecord` 作为统一 vocabulary；不要在 Stage 4A 假称已经有独立 canonical table。

### 9.2 Multiple Context Views

同一 repository 产生只读 view：

- `DirectChatContextView`：当前 relation Truth + bounded episodic + fresh offline handoff + history boundary；Scene 与 Truth 分栏。
- `RegenerateContextView`：同一 view，额外 target/history boundary/OOC correction，post-reply disabled。
- `DiaryContextView`：safe CharacterEvent/relationship/time/routine；明确排除 private Memory/Truth。
- `OfflineHandoffView`：pending source IDs/raw transcript + durable summary，短期 freshness。
- `ProactiveContextView`：relationship projection/events/topics/routine，默认无 private Memory。
- `PublicMoment/ForumView`：仅 public/candidate-approved material，不读取 relation-private stores。

### 9.3 Memory Intake pipeline

建议 `MemoryIntake` 五步：`capture source → normalize/evidence → classify (fact/event/plan/belief/scene) → policy/admission → canonical write`。AI 只能产生 `IntakeCandidate`；必须带 source record/message IDs、actor/recipient、temporal status、scope、producer、confidence、reason for admission/rejection。用户 explicit confirmation、deterministic event、manual entry 和 AI inference 的 admission policy 应分开。

### 9.4 Retrieval / token governance

先做 deterministic exact scope，再做 source/status/temporal/recency/importance/query score；Truth claims 优先于 summaries/legacy mirrors；同 source claim 只保留一个 prompt representation。每个 view 有总 token/character budget、per-category budget、oversize first-record rule 和 selected/dropped diagnostics；不得让多个 caller 各自再加一份 global budget。

### 9.5 Observability / Ledger attribution

不记录正文。为每次逻辑 AI request 记录：`parentActionId`, `purpose`, `scope IDs`, `providerRequestCount`, `selectedSourceIds/counts`, `droppedReasonCounts`, `viewVersion`, `provenance classes`。provider attempt 仍只计数，不在本阶段扩展 attempt-level telemetry。`memory_extract`、`diary_generate`、`offline_handoff` 等应可与 direct reply parent action 关联；跨 memory/diary 的完整 lineage 仍是已知缺口，必须在后续独立设计。

### 9.6 Safe migration

建议顺序：

1. 只读 shadow projection：从现有 claims/summaries/legacy/events 生成 view，不改 Prompt；
2. provenance/temporal/scope validation metrics；
3. feature-by-feature candidate intake（先 manual/explicit offline，再 chat inference）；
4. dual-read compare selected/dropped/Prompt equivalence；
5. stable idempotency/revision + backup/rollback；
6. 最后才考虑 legacy Memory store retirement。

禁止先清空 legacy、先迁 schema、或用新摘要覆盖旧事实来“整理干净”。

## 10. Stage 4A characterization tests

新增 `scripts/memorySystemV2Characterization.test.ts`，只调用既有生产纯函数/服务，不修改生产逻辑，覆盖：

- canonical MemoryRecord 的 relation/identity exact isolation；
- Truth claim 优先、source-backed ConversationSummary 抑制和 prompt 标注；
- Diary projection 不包含私有 Memory；
- Offline source filter 排除 imported/narration；pending handoff 在 durable summary 前不 acknowledge，达到阈值后幂等 acknowledge；
- offline handoff sanitizer 保留可替换 marker、移除 screenplay/私密对白。

已有测试继续覆盖 `MemoryService`（AI-only inference 不写 legacy）、`memoryWriteCoordinator`（canonical→summary→compatibility 失败边界）、`characterCognitiveContext`（relation/event isolation）、Truth retrieval、offline repair、post-reply coordinator 和 CharacterEvent idempotency。该测试集合是行为锁定，不声称已经证明所有跨组件运行时路径。

## 11. 未来 DirectReplyUseCase 边界（仅设计建议）

应进入的最小 orchestration：已准备好的 direct context/prompt → request executor → parse/candidate delivery result → post-reply coordinator scheduling metadata。应继续独立的 service：Truth retrieval、Memory repository/intake、Diary generation、Offline sync/handoff、Relationship/Event projection、PromptComposer/WorldBook、provider retry/fallback。应留在 UI/controller：input、typing、scroll、modal、selection、navigation、message persistence adapter。明确不接管：group chat、proactive jobs、payment/red-packet、voice/image generation、Forum/Moments/Reading/Character Phone background jobs。

当前 afterReplySuccess：

- normal online reply 后调度 auto summary（200ms，threshold/cooldown），不阻塞 reply；
- offline reply 只追加 story messages；
- Diary 由 coordinator 单独 schedule，lazy path 有 relation/day guard，provider 失败只写 task failed；
- relationship/cover、pending handoff delivery 等由 caller-owned adapter/feature service 完成；
- regenerate 的 policy 为 `regenerate_none`，不执行 normal post-reply Memory/Diary side effects。

因此 DirectReplyUseCase 不应包含 3000 行 AppChat 搬运；它只协调 lifecycle，不拥有所有 side effects。

## 12. 已知债务与阶段结论

- `DIRECT_CHAT_BROWSER_SMOKE`：浏览器运行 smoke 尚未在此环境完成。
- `BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`：Vite 编译后 Windows/Node runtime assertion debt；Stage 3B-8 已验收，不能在本审计中把它误报为新代码回归。
- Memory legacy/Truth dual-read 与 `compressedMemory` duplicate：已知架构债务。
- AI action lineage across follow-up background tasks（chat_reply → memory_extract → diary_generate）尚未完整串联；本阶段不修改。
- legacy Memory whole-array localStorage revision/CAS、alias/barrel dependency 盲区不属于本阶段。

Stage 4A **不建议直接批准“大规模 Memory V2 重写”**。若批准下一小阶段，建议只做一个可回滚的 Stage 4B-1：建立 read-only `CharacterMemoryRepository` facade + selected/dropped diagnostics，并对 direct-chat/diary/offline views 做 shadow comparison；在没有 Prompt/数据迁移等价证据前，不改变任何生产写入或 Prompt。

## 13. 数据影响、回滚与验证

- 本阶段只新增审计文档和 characterization test；不写用户 localStorage/IndexedDB，不改 schema、Prompt、Provider、Retry/Fallback 或 UI。
- 回滚只需 `git revert` 本阶段新增 commit；原始 `4942924...` baseline 不受影响。
- 预期测试总数从 546 个测试文件增至 547 个（实际以完整 runner 输出为准）；现有测试不删除、不跳过、不弱化。
- 应执行：focused characterization test、`npm run lint`、`npm test`、dependency gate；无生产代码变化时 build 复用 Stage 3B-8 已通过且已登记的 baseline，若需要重新运行只作环境验证，不因 Windows runtime assertion debt 修改代码。

## 14. 回答 Stage 4A 验收问题（索引）

1. 全部 Memory-like 数据、分类与来源：第 2–4、8 节。
2. 每个 write path 的 trigger/type/store/scope/AI/blocking/best-effort/retry/duplicate/provenance/temporal：第 4、6 节。
3. Memory-related AI 次数与 Offline wait：第 4.2 节。
4. read/retrieval/prompt 注入和 duplication matrix：第 5 节。
5. storage ownership、Truth/legacy/compressedMemory：第 3、5、6 节。
6. Online↔Offline、handoff 强弱：第 7 节。
7. HandoffCapsule/MemoryDelta/BackgroundConsolidationJob/OfflineThread/Scene/Topic/Emotion/Character Life 目标设计：第 9 节（以对应 view/intake/repository/job 边界实现，不在本阶段创建空壳）。
8. canonical repository、views、intake、ranking、token、observability、ledger attribution、migration：第 9 节。
9. characterization tests、gate、data impact、rollback、Stage 4B recommendation：第 10、12、13 节。
