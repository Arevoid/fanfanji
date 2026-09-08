# Forum Story System 设计方案

> 设计依据：`docs/forum-architecture-analysis.md` 及当前 Forum 实现。  
> 本文是“论坛体故事 / NPC 事件论坛”的领域与系统设计，不是实现提交。  
> 设计日期：2026-08-06。  
> 本阶段不修改任何源码、不创建测试、不改变现有数据。

## 0. 设计目标与核心原则

论坛体故事不是“让 AI 多生成几条评论”，而是在现有公共论坛之上增加一个受控的故事层。故事层负责回答：

- 这条故事的起因是什么，当前进行到哪一幕？
- 哪些事情已经在故事世界中确认发生，哪些只是 NPC 的猜测或论坛传闻？
- 哪个 NPC 知道哪些信息，为什么会在此时发言？
- 一条公开帖子/回复是在陈述事实、表达立场，还是制造误导？
- 何时允许推进下一事件，何时必须等待用户参与，何时可以结局？

设计遵循以下原则：

1. **事件先于发言。** AI 先提出故事事件候选，经过状态、时间、可见性和因果校验后，才生成公开帖子或回复；不能把一段戏剧化文本直接当成已发生事实。
2. **故事事实与角色事实隔离。** 故事属于 Forum Story scope，不自动成为用户 Memory、Character Memory、Relationship 事实或 OfflineStory 事实。
3. **公开投影最小化。** AI 只接收当前故事允许公开的角色、事件、世界设定和楼层；不读取私聊 Memory、Relationship 私密数据、InnerVoice 或 OfflineStory 全文。
4. **NPC 状态由事件账本驱动。** NPC 的立场、知识、情绪和目标只能通过已确认事件或用户明确选择改变，不能每次 Prompt 临时重写。
5. **现实时间与故事时间分离。** `occurredAt` 表示故事内发生时间，`recordedAt`/`scheduledAt` 表示本地系统时间，二者不能互相替代。
6. **AI 只生成候选，系统决定提交。** AI 不直接写入 Thread、Reply、StoryEvent 或角色状态；所有写入经过幂等事务和安全验证。
7. **默认不写回 Truth Layer。** 只有用户明确授权、可见性明确、来源可追溯且可撤销时，才允许把故事中的公开事实投影到其他域。

## 1. 现有架构适配性

### 1.1 适合复用

| 现有能力 | 复用方式 | 复用边界 |
| --- | --- | --- |
| `ForumThread` | 作为故事的公开主楼、标题、正文、公开作者和论坛展示载体 | 不让 Thread 自己承担故事状态、因果和 NPC 长期记忆 |
| `ForumReply` | 作为评论、楼中楼、`author-update` 和结局公告的公开表现层 | 必须增加 StoryEvent/StoryUpdate 关联；楼层本身不是事件账本 |
| `ForumActivityTask` / PendingEvent | 承担“已批准的公开事件何时释放” | 不承担故事真相、前置条件、分支或长期状态 |
| `ForumActorRef` / Virtual Profile | 作为 StoryCharacter 的论坛 actor 映射 | actor 还需加入 `storyId` 作用域，不能只靠 `characterId` |
| `forumRepository` | 复用 LocalStorage 快照、身份隔离、校验、订阅和原子提交模式 | Story 数据需要独立 key、schema 版本和迁移，不混入普通 Forum 数组 |
| `forumContentSafety` | 复用公开文本清洗、私密姓名保护、引用和 JSON 校验 | 另增故事事实、剧透、证据和事件权限校验 |
| `PublicForumCognitiveContext` | 作为公开帖子/回复的最小认知投影 | 增加 StoryContext，但继续遵守 public visibility |
| `ForumStoryArc` | 作为兼容摘要或旧帖的只读视图 | 不继续堆字段；正式故事使用独立 Story Domain |
| `forumGenerationGuard` | 复用任务幂等、冷却、预算和失败重试思想 | 故事需要事件级幂等和跨阶段事务 |
| Forum Share / Chat bridge | 复用公开快照分享 | 只分享公开故事快照，不将故事自动变成 Chat 关系事实 |

### 1.2 需要扩展

1. **Thread 关联：**在不破坏旧帖子格式的前提下增加可选 `storyId`、`storyThreadRole`、`storyEpisode`、`storyEventIds` 或通过独立映射表关联。旧 Thread 的 `storyId` 为空时仍按普通论坛处理。
2. **Reply 关联：**增加可选 `storyUpdateId`、`causedEventIds`、`evidenceEventIds`，并保留原有 `floor`、`replyToFloor` 和公开快照字段。
3. **Activity 计划：**增加 `storyId`、`eventId`、`releasePolicy`、`requiredStateVersion`，让活动释放前再次验证故事版本。
4. **公开 Context：**加入故事当前幕、已确认公开事件、角色公开知识和禁止剧透边界；不得把 Story Domain 内部 ID 原样输出给模型。
5. **生成 Guard：**按 `storyId + phase + actorKey + triggerWindow` 建立幂等键，避免同一事件在不同入口重复生成。
6. **容量策略：**普通 Forum 任务可按原策略压缩；已确认 StoryEvent、结局和事件证据不能被普通活动任务的过期清理误删。

### 1.3 需要新增

| 新对象/模块 | 目的 |
| --- | --- |
| `ForumStory` | 故事的根实体、状态、种子、时间和权限 |
| `StoryThread` | 故事与一个或多个 ForumThread 的映射，可支持主楼、分支楼、结局楼 |
| `StoryCharacter` | 故事作用域内的 NPC 身份、背景、风格、知识和状态引用 |
| `StoryEvent` | 已发生/候选/拒绝的事件账本，记录因果、证据和可见性 |
| `StoryUpdate` | 将事件投影为楼主更新、评论或公告的发布记录 |
| `StoryTimeline` | 故事内时间、幕次、里程碑、触发条件和现实时间调度 |
| `StoryKnowledge` | NPC 对公开事件的 known/unknown/misunderstood 投影 |
| `StoryStateTransition` | 记录状态迁移前后版本，防止并发和人格漂移 |
| `ForumStoryContext` | 供生成服务读取的只读、带权限的故事上下文 |
| `ForumStoryPromptAdapter` | 把 Story Context 转成不同生成任务的最小 Prompt |
| `forumStoryEventLedger` | 事件确认、证据绑定、去重、撤销和时间线一致性 |
| `forumStoryScheduler` | 现实时间/故事时间、前置条件、预算和结局触发 |

### 1.4 结论

现有 Thread/Reply 适合作为**故事公开表现层**，不能直接作为唯一故事载体。现有 Activity 适合做**已批准事件的延迟发布队列**，不适合作为事件真相数据库。当前 NPC 可作为一次性发帖者/评论者，但不具备故事级长期身份、知识、目标和状态迁移能力。正式扩展应采用“Story Domain + Forum 投影”的双层结构。

## 2. Forum Story Domain

### 2.1 `ForumStory`

故事根实体，代表一个连续事件而不是一条帖子。

| 字段 | 作用 | 生命周期 | 与现有 Forum 的关系 |
| --- | --- | --- | --- |
| `id` | 故事唯一 ID | 创建后永久不变 | 被 StoryThread/Event/Character 引用 |
| `ownerIdentityId` | 身份隔离 | 创建后永久不变 | 与所有 Forum 数据相同的第一层隔离 |
| `title` / `premise` | 公开标题和起因摘要 | seed 时生成，可由系统更新摘要 | 投影到主 Thread 标题/正文 |
| `seed` | 用户或系统提供的故事种子、题材、限制 | `draft → seeded` 后冻结原始版本 | 只把允许公开部分交给 AI |
| `source` | `user-seeded` / `system-seeded` / `template` | 创建时确定 | 决定是否需要用户确认起因 |
| `status` | `draft`、`active`、`paused`、`resolved`、`abandoned`、`archived` | 由状态机迁移 | 不等同于 Thread 的删除状态 |
| `currentEpisode` | 当前幕/章节 | 事件确认后递增 | 供 StoryContext 和 StoryThread 显示 |
| `timelineId` | 故事内时间线引用 | 创建后不变 | 连接 StoryTimeline |
| `canonicalThreadId` | 主故事楼 ID | 初始帖子生成后写入 | 指向现有 `ForumThread.id` |
| `visibility` | 故事内容默认可见范围 | 创建时设置，收紧优先 | 控制公开投影，不能扩大私密范围 |
| `pacingPolicy` | 更新节奏、最小间隔、每天上限 | 可配置但须版本化 | 约束 Activity 调度 |
| `endingPolicy` | 结局条件、允许的结局类型、是否需用户确认 | active 前确定 | 控制结局生成与防提前泄露 |
| `stateVersion` | 乐观并发版本 | 每次确认事件/状态迁移递增 | Activity 释放时校验 |
| `createdAt` / `updatedAt` | 本地写入时间 | 持久化 | 不作为故事发生时间 |
| `resolvedAt` / `archivedAt` | 结束/归档时间 | 结束后写入 | 用于清理和历史展示 |

**建议：**`ForumStory` 只保存摘要和策略，不保存完整聊天 Memory；完整事件放入 Event Ledger。

### 2.2 `StoryThread`

故事与 ForumThread 的关联对象，允许一个故事拥有主楼、分支楼、结局楼。

| 字段 | 作用 | 生命周期 | 与现有 Forum 的关系 |
| --- | --- | --- | --- |
| `id` | 映射记录 ID | 永久 | Story Domain 内部主键 |
| `storyId` | 所属故事 | 永久 | 关联 `ForumStory` |
| `threadId` | Forum 帖子 ID | 帖子创建后写入 | 关联 `ForumThread` |
| `role` | `main`、`branch`、`recap`、`ending` | 创建时或分支时确定 | 决定公开展示位置 |
| `episode` | 该楼对应的故事幕次 | 发布时冻结 | 可映射 `ForumThread.storyArc` 兼容字段 |
| `isCanonical` | 是否为主线 | 分支时确定 | 影响后续事件选择 |
| `openedAt` / `closedAt` | 该故事楼开放/关闭时间 | 由状态机维护 | 不删除原 ForumThread |
| `stateVersion` | 关联时的故事版本 | 发布时写入 | 便于检测过期事件 |

一个 StoryThread 不是评论容器；具体评论仍写入 `ForumReply`，并通过 `StoryUpdate`/`evidenceEventIds` 关联故事事件。

### 2.3 `StoryCharacter`

故事内 NPC 的稳定身份，不等同于关系角色或普通虚拟论坛用户。

| 字段 | 作用 | 生命周期 | 与现有 Forum 的关系 |
| --- | --- | --- | --- |
| `id` / `storyId` | 故事作用域内身份 | 创建后稳定 | 所有 actor 引用必须带 story scope |
| `actorRef` | 关系 actor 或 virtual actor 的内部映射 | 故事创建时绑定 | 对外只投影 public profile，不公开内部 ID |
| `publicName` / `avatar` | 论坛可见身份 | 故事内可更新但保留历史快照 | 写入 `ForumPublicAuthor` |
| `storyRole` | 楼主、目击者、调查者、反对者等 | 初始 seed 确定，可由事件改变 | 影响发言权限和触发器 |
| `personalitySummary` | 故事范围内人格摘要 | 版本化 | 进入 Story Prompt 的安全投影 |
| `backstory` | 故事背景 | seed 时冻结或经状态机更新 | 仅允许公开部分进入 Prompt |
| `relationshipToStory` | 与起因、其他 NPC、用户的故事关系 | 事件驱动更新 | 不是 Relationship 模块的私密关系事实 |
| `speechStyle` | 词汇、语气、口癖、发帖习惯 | 版本化 | 进入发言 Prompt |
| `goals` / `constraints` | 当前目标和不能做的事 | 事件驱动 | 约束生成，不作为现实角色意愿 |
| `knowledgeStateId` | 故事知识快照 | 每次知识变化生成新版本 | 连接 StoryKnowledge |
| `stateId` | 公开状态快照 | 事件后递增 | 连接 StoryActorState |
| `status` | active、silent、removed、resolved | 状态机维护 | 控制是否可生成发言 |

### 2.4 `StoryEvent`

故事事实的核心账本；公开帖子/回复只是它的一个表达结果。

| 字段 | 作用 | 生命周期 | 与现有 Forum 的关系 |
| --- | --- | --- | --- |
| `id` | 事件唯一 ID | 永久；撤销不复用 | 被 Reply/Update 作为证据引用 |
| `storyId` / `sequence` | 故事和线性顺序 | 确认后固定 | 形成因果和去重基础 |
| `kind` | meet、discovery、conflict、reveal、decision、ending 等 | 候选生成时提出 | 决定允许的 StoryUpdate 类型 |
| `occurredAt` | 故事内发生时间 | 候选可调整，确认后冻结 | 不直接等于 `ForumReply.createdAt` |
| `recordedAt` | 本地写账时间 | 写入时确定 | 诊断和排序，不代表剧情发生 |
| `actorIds` | 参与者 | 确认后固定 | 映射 StoryCharacter，不输出内部 ID |
| `facts` | 原子事实集合 | candidate/confirmed/rejected | 只允许 confirmed 事实进入后续 Context |
| `preconditionIds` / `causedByIds` | 前置和因果 | 确认后固定 | 阻止跳过前置事件 |
| `publicVisibility` | `public`、`partial`、`private`、`unknown` | 默认 `unknown`，确认时决定 | 控制 Forum 公共投影 |
| `knowledgeRecipients` | 哪些 StoryCharacter 知道 | 事件确认时计算 | 驱动 NPC 知识边界 |
| `evidence` | Thread/Reply/用户选择等证据 | 发布/确认后追加 | 关联 `ForumThread.id`/`ForumReply.id` |
| `source` | `user`、`story-system`、`npc-candidate`、`forum-observation` | 生成时确定 | 不等同于现实 Truth source |
| `confidence` | 候选可信度 | candidate 可变，confirmed 应达阈值 | 只作为内部决策，不直接告诉 NPC |
| `status` | candidate、confirmed、rejected、retracted | 状态机迁移 | rejected/retracted 不进入正常 Prompt |
| `idempotencyKey` | 事件去重 | 创建时计算 | 防止 Day3 事件重复写入 |
| `revision` | 事件版本 | 发生纠正/撤销时递增 | Reply 引用应保存版本快照 |

### 2.5 `StoryUpdate`

把一个或多个已确认事件投影成论坛公开内容的发布记录。

| 字段 | 作用 | 生命周期 | 与现有 Forum 的关系 |
| --- | --- | --- | --- |
| `id` / `storyId` | 发布记录身份 | 永久 | 与故事绑定 |
| `eventIds` | 该次发言依据的事件 | 发布前必须已校验 | 写入 `ForumReply.evidenceEventIds` |
| `threadId` / `replyId` | 公开目标 | 生成/释放后写入 | 关联现有 Thread/Reply |
| `updateKind` | initial-post、comment、author-update、recap、ending | 生成时确定 | 映射 Reply.kind 或主楼 |
| `authorStoryCharacterId` | 故事作者 | 发布时固定 | 投影为 `ForumPublicAuthor` |
| `visibility` | 公开/部分公开 | 发布前确定 | 不能高于事件可见性 |
| `scheduledAt` / `publishedAt` | 计划/公开时间 | Activity 释放后写入 | 分别对应调度时间和 Reply.occurredAt |
| `status` | candidate、scheduled、published、cancelled | 状态机维护 | 与 ActivityTask 状态分离 |
| `spoilerLevel` | none、hint、reveal、ending | 发布前校验 | 防止提前泄露结局 |
| `contentFingerprint` | 文本语义去重键 | 创建时计算 | 避免同一事件多次改写 |

### 2.6 `StoryTimeline`

把故事内时间、幕次、里程碑和现实调度分开。

| 字段 | 作用 | 生命周期 | 与现有 Forum 的关系 |
| --- | --- | --- | --- |
| `id` / `storyId` | 时间线身份 | 永久 | 供 Story/Event/Character 引用 |
| `storyEpoch` | 故事 Day1 的起点 | 创建时确定 | 不依赖设备时区显示 |
| `currentStoryAt` | 当前故事时间 | 事件确认后推进 | 供 Prompt 使用 |
| `currentEpisode` | 当前幕次 | 里程碑完成后递增 | 对应 StoryThread.episode |
| `milestones` | Day1、Day3、Day7、ending 等计划节点 | 创建时生成，可调整 | 触发 Scheduler |
| `scheduledTransitions` | 条件/时间/用户触发器 | 运行期间消费 | 映射 ForumActivityTask |
| `lastAdvancedAt` | 最近推进时间 | 持久化 | 现实时间诊断 |
| `clockMode` | realtime、accelerated、user-driven | 故事创建时确定 | 决定自动更新策略 |
| `pausedReason` | 需用户选择、预算、冲突等 | pause 时写入 | 防止继续生成垃圾内容 |

### 2.7 辅助对象

- **`StoryKnowledge`：**`storyId + characterId + eventId` 的 known/unknown/misunderstood/rumor 状态，记录获得方式和版本。
- **`StoryActorState`：**立场、情绪、目标进度、关系阶段、活跃窗口和冷却；必须由事件事务更新。
- **`StoryStateTransition`：**`fromVersion → toVersion`、触发事件、变更字段、校验结果，作为并发和调试依据。
- **`StoryBranch`：**分支起点、用户选择、互斥事件集合、canonical 标记；没有分支时可为空。
- **`StoryGenerationTask`：**seed/post/comment/update/advance/ending 任务的幂等、重试和预算记录；不替代 Event Ledger。

## 3. 故事生命周期与职责分配

### 3.1 状态机

```text
draft
  └─(种子校验/用户确认)→ seeded
                         └─(初始帖子发布)→ active
                                              ├─(用户暂停)→ paused
                                              ├─(达到结局前置条件)→ ending
                                              │                       └─(结局确认并发布)→ resolved
                                              ├─(超过有效期/用户放弃)→ abandoned
                                              └─(分支选择)→ active(branch)
resolved / abandoned
  └─(保留历史快照)→ archived
```

状态迁移由系统状态机完成；AI 只能提出“建议迁移”，不能直接把故事置为 resolved。`ending` 是防止结局泄露的独立阶段：可以生成结局候选，但在满足条件和必要的用户确认前不公开。

### 3.2 标准流程

```text
Story Seed
   ↓  系统规范化：题材、起因、参与方式、时间策略、边界
ForumStory(draft → seeded)
   ↓  AI 生成初始帖子候选
事件候选校验 + 确认 Event(seed/opening)
   ↓
StoryThread(main) + ForumThread(initial-post)
   ↓
用户评论 / NPC 评论 / 楼中楼
   ↓  仅把公开回复作为观察证据，必要时生成候选事件
StoryEvent(conflict/discovery/decision)
   ↓  StoryActorState、StoryKnowledge、Timeline 事务更新
StoryUpdate(author-update / recap / reply)
   ↓  ActivityTask 延迟释放
下一幕（Day3 / Day7 / branch）
   ↓
ending candidate → ending validation → ending update
   ↓
ForumStory(resolved) + 结局 Event + 冻结公开快照
```

### 3.3 创建阶段

**系统控制：**

- 生成唯一 `storyId`、scope、schema version 和默认时间线。
- 校验 seed 长度、主题、内容边界、是否需要用户确认。
- 创建初始 StoryCharacter、公开事件权限和 pacing policy。

**AI 生成：**

- 把 seed 扩展为起因、公开冲突、第一幕目标和不可提前揭示的信息。
- 生成初始帖子候选，不生成完整结局、不写入私人角色事实。

**用户参与：**

- 可提供起因、风格、故事参与方式、是否允许自动推进、是否允许分支。
- 对含有用户明确选择的 seed，用户确认后才进入 `seeded`。

### 3.4 互动与推进阶段

- **普通评论：**先作为 ForumReply 写入；只有满足事件触发器时才提出 StoryEvent 候选。
- **用户关键选择：**用户明确选择可直接成为 `source=user` 的故事事件候选，系统确认后推进分支。
- **NPC 发言：**AI 只能从 StoryCharacter 的公开状态和已知事件生成，不允许自由添加关键事实。
- **楼主更新：**必须绑定一个或多个已确认事件，`updateKind=author-update`，不可凭空推进。
- **时间推进：**Scheduler 根据 story clock 和最小间隔生成 advance 任务；没有前置条件时不能只因“时间到了”跳过剧情。

### 3.5 结局阶段

结局至少需要满足：

1. 主线前置事件全部 `confirmed`。
2. 没有未解决的必答分支或待用户选择。
3. 结局候选引用的事实均在其可见范围内。
4. 与已有结局 fingerprint 不重复。
5. 结局不会在普通回复中提前出现；`spoilerLevel=ending` 只能由结局发布器处理。
6. 发布成功后系统再将 Story 状态迁移为 `resolved`，而不是先标记结束再生成文本。

### 3.6 AI / 系统 / 用户职责表

| 环节 | AI 可做 | 系统必须做 | 用户可做 |
| --- | --- | --- | --- |
| Seed | 补全起因、提出角色和节奏候选 | 安全校验、权限和种子确认 | 提供/确认/修改 seed |
| 初始帖 | 写公开叙事文本 | 确认 opening event、落库、去重 | 选择是否启动 |
| 评论 | 生成候选观点和语气 | 校验引用、角色权限、事件证据 | 发表评论、删除自己的内容 |
| NPC 参与 | 选择公开表达 | 校验知识、状态、时间和重复 | 可通过互动触发/暂停 |
| 楼主更新 | 根据 confirmed event 写更新 | 绑定事件、安排发布时间 | 可要求继续或暂停 |
| 事件推进 | 提出候选事件 | 状态迁移、因果、版本和可见性 | 关键节点作选择 |
| 结局 | 提出有限候选 | 前置条件、剧透、发布和 resolved 迁移 | 确认或选择结局（如开启） |

## 4. NPC 机制设计

### 4.1 Story NPC 与普通 Forum 用户的区别

普通 Forum actor 解决“谁来发一条公开内容”；Story NPC 解决“一个有目标、知识边界、立场变化和故事关系的角色，为什么在此时以这种方式发言”。因此 Story NPC 必须是故事作用域对象，不应仅复用一个 displayName。

### 4.2 NPC 所需能力

| 能力 | Story NPC 设计 | 不能替代的模块 |
| --- | --- | --- |
| 身份 | `StoryCharacter.id`、publicName、avatar、actorRef、storyId | 不直接暴露 relationId/characterId |
| 性格 | `personalitySummary`、speechStyle、稳定口癖 | 不读取角色私密 Memory/InnerVoice |
| 背景 | 故事范围的 backstory 和公开动机 | 不复制 Relationship 私密设定 |
| 与故事关系 | storyRole、relationshipToStory、目标、立场 | 不写入真实 Relationship 事实 |
| 发言风格 | 词汇、长度、态度、引用习惯、禁用表达 | 仍需经过 forumContentSafety |
| 长期状态 | `StoryActorState`、StoryKnowledge、goal progress | 不用 Chat Memory 作为隐式状态 |
| 行动资格 | 当前幕、前置条件、活跃窗口、冷却 | 由 Scheduler/StateMachine 决定 |
| 记忆 | 只记故事中被授权的公开事件、误解和传闻 | 不是 Character Memory |

### 4.3 `Story NPC Context`

`StoryNpcContext` 是只读投影，推荐字段如下：

```ts
interface StoryNpcContext {
  story: {
    storyId: string;             // 供系统关联，不输出给模型
    title: string;
    premise: string;
    currentEpisode: number;
    currentStoryAt: number;
    phase: "opening" | "rising" | "conflict" | "reveal" | "ending";
  };
  actor: {
    publicName: string;
    publicProfile: string;
    storyRole: string;
    publicPersonality: string;
    speechStyle: string;
    goals: string[];
    constraints: string[];
  };
  knownEvents: Array<{
    summary: string;
    occurredAt: number;
    certainty: "confirmed" | "rumor" | "misunderstood";
  }>;
  publicActors: Array<{ publicName: string; role: string; relation: string }>;
  openThreads: string[];
  allowedActions: string[];
  forbiddenKnowledge: string[];
  currentPublicThread: string;
  recentPublicReplies: string[];
}
```

规则：

- `knownEvents` 只来自 confirmed 且允许该 actor 知道的 StoryEvent；rumor/misunderstood 必须标注为不确定，不能写成事实。
- `forbiddenKnowledge` 明确列出结局、幕后身份、未公开事件和其他 NPC 私密信息。
- `publicActors` 使用公开关系描述，不带内部 actor ID。
- 用户输入的评论可作为当前公开文本，但不能自动变成 NPC 私密记忆。
- 关系角色参与时，也只能使用 `public` Story Context；不得因为 `actorRef.kind=relationship` 就读取 Relationship 私密数据。

### 4.4 NPC 状态迁移

NPC 状态变化必须由事件事务驱动：

```text
候选 Event(conflict)
  → 校验 actor 权限/前置条件
  → confirm Event
  → StoryStateTransition
       ├─ ActorState：立场/目标/情绪/关系阶段
       ├─ StoryKnowledge：哪些 NPC 知道/误解
       └─ Timeline：下一次允许行动时间
  → 生成公开 StoryUpdate
```

如果 AI 的文本暗示了未登记的新能力、新关系或新事实，验证器应拒绝、降级为不影响状态的观点，或要求生成新的事件候选；不能静默把它写入 NPC 状态。

## 5. 与 Truth Layer 的关系

### 5.1 Forum Story 的事实范围

Forum Story 属于 **fictional public-story scope（论坛故事公共叙事域）**。它可以拥有自己的 canonical facts，但这些事实只对该 Story 和被授权的公开投影成立。

| 事实域 | 示例 | 默认是否互通 | 说明 |
| --- | --- | --- | --- |
| Forum Story canonical | “Day3 调查者在车站发现蓝色伞” | 只在同一 story 内 | 由 StoryEvent 账本确认 |
| Forum public observation | “楼主说自己看到了蓝色伞” | 只作为公开发言 | 可能是误述，不能自动提升为 canonical |
| Story NPC knowledge | “NPC A 知道车站线索” | 只对该 NPC context | 不等于所有 NPC 都知道 |
| 用户 Memory | 用户与角色真实互动、线下经历 | 不互通 | Forum Story 不得自动写入 |
| Character Memory | 角色私密认知 | 不互通 | 除非明确授权的投影流程 |
| Relationship fact | 真实关系阶段、承诺、私密状态 | 不互通 | 故事角色名相同也不能合并 |
| OfflineStory | 线下剧情中的已发生事件 | 不互通 | 不读取全文、不反向污染 |

### 5.2 禁止的默认写回

以下动作默认禁止：

- 把 StoryEvent 自动写成用户 Memory 或 Character Memory。
- 把 NPC 在故事中的“喜欢/讨厌/承诺”写入真实 Relationship。
- 把论坛故事角色与同名真实角色自动合并。
- 把用户在 Forum 里的评论当成 Chat/OfflineStory 中真实发生的行为。
- 把 Forum Story 的结局同步到 Diary、Moment 或其他应用的事实库。

### 5.3 可选授权桥接

如果未来产品需要“把故事中的公开事件加入角色公共认知”，必须使用显式桥接命令，而不是隐式同步：

```text
用户确认桥接
  → 选择目标角色/关系和可见范围
  → 显示待写入的事实、来源 Thread/Reply、storyId、eventId
  → 检查来源为 confirmed + public
  → 写入带 source=forum-story-public 的独立 CharacterEvent
  → 可撤销/可追溯，不直接覆盖原 Memory
```

桥接记录应包含 `sourceScope`、`storyId`、`eventId`、`evidence`、`authorizedBy`、`createdAt` 和 `revokedAt?`。没有授权时，Forum Story 永远停留在 story scope。

## 6. AI 生成架构设计

### 6.1 新的 Context 层次

```text
ForumStoryContext（故事只读投影）
        │
        ├─ ForumStoryPromptAdapter（故事 seed/事件/连载任务）
        │
        └─ PublicForumPromptAdapter（公开帖子/回复/活动文本）
                 │
                 ▼
           apiChat / JSON validator

CharacterCognitiveContext
        └─ 仅用于现有关系 Chat/受控 DM；不作为 Forum Story 默认输入
```

`ForumStoryContext` 是 Domain 级上下文，不是 CharacterCognitiveContext 的别名。它包含故事内公开真相和 NPC 状态，但不包含 Chat Memory、Relationship 私密事实或完整 OfflineStory。

### 6.2 `ForumStoryPromptAdapter`

建议按任务拆分适配器，而不是一个无限增长的 Prompt：

| Adapter | 输入 | 输出 | 禁止内容 |
| --- | --- | --- | --- |
| `StorySeedPromptAdapter` | seed、题材、边界、节奏 | opening candidate、角色候选、初始事件候选 | 结局全文、私密角色资料 |
| `StoryOpeningPostPromptAdapter` | confirmed opening event、主角公开资料 | 初始 Thread 候选 | 未确认事实、真实关系信息 |
| `StoryCommentPromptAdapter` | 当前幕、公开楼层、NPC Context | comment/reply candidate | 事件状态直接变更、幕后真相 |
| `StoryEventPromptAdapter` | timeline、前置条件、未解决线索、用户输入 | StoryEvent candidate | 直接写库、跳过前置条件 |
| `StoryUpdatePromptAdapter` | confirmed event、楼主公开身份、story state | author-update/recap candidate | 无证据的剧情推进 |
| `StoryAdvancePromptAdapter` | 到期 milestone、stateVersion、可行动 NPC | next-event candidates | 自动结束或提前结局 |
| `StoryEndingPromptAdapter` | ending prerequisites、已确认事件、结局 policy | 有限结局候选 | 未满足前置条件时透露结局 |

每个 Adapter 都应返回：

- `contextVersion` 和 `storyStateVersion`。
- `allowedEventKinds`、`allowedUpdateKinds`。
- `knownFacts` 与 `forbiddenFacts` 分离。
- `outputSchemaVersion`。
- `visibility`、`spoilerLevel` 和 `evidenceRequired` 约束。

### 6.3 AI 调用链

```text
Scheduler/用户动作
  → 读取 ForumStory + StoryTimeline + confirmed EventLedger
  → 读取 StoryCharacter/Knowledge/ActorState 的公开投影
  → ForumStoryContextBuilder
  → ForumStoryPromptAdapter
  → apiChat（严格 JSON）
  → parse + schema validation
  → 事件/因果/时间/角色权限/剧透/文本安全验证
  → EventLedger candidate 或 confirmed
  → StoryStateTransition（乐观版本校验）
  → StoryUpdate candidate
  → PublicForumPromptAdapter 生成可见文本（如需要）
  → ForumActivityTask.pendingEvents
  → releaseDueForumActivity
  → ForumThread/ForumReply + evidence
```

关键顺序是 **Event → State → Update → Release**。如果公开文本生成失败，可以保留已确认事件并重试 Update；如果事件确认失败，不能发布看似已经发生的楼层。

### 6.4 输入 Context 读取矩阵

| 数据 | Story Event Prompt | Story NPC Prompt | 公开帖子/回复 | 禁止默认读取 |
| --- | --- | --- | --- |
| Story confirmed events | 是，按 visibility | 是，按 actor knowledge | 是，当前公开事件 | 未公开/被撤销事件 |
| Story NPC profile | 是，候选 actor | 是自身投影/公开他人 | 是公开作者 | 私密真实角色资料 |
| Forum public Thread/Reply | 作为证据和上下文 | 是最近公开楼层 | 是 | 删除/私有内容 |
| User Forum reply | 可作为触发或观察 | 作为当前公开输入 | 是 | 自动变成 Memory |
| Chat Message | 否 | 否 | 否 | 全部原文 |
| Memory | 否 | 否 | 否 | 全部 |
| Relationship private data | 否 | 否 | 否 | 全部 |
| CharacterEvent | 仅显式授权的 public bridge | 仅经 Story scope 投影 | public candidate 才可 | safe 不等于自动公开 |
| WorldBook | 仅 public Story world 条目 | 仅公开条目 | public candidate | 未分类条目 |
| CharacterCognitiveContext | 否 | 否 | 否 | 不把 Story 当 Chat |
| InnerVoice / OfflineStory 全文 | 否 | 否 | 否 | 全部 |

### 6.5 输出验证与失败策略

AI 输出必须经过：

1. JSON/schema 解析和长度限制。
2. `storyId`、`stateVersion`、actor slot 白名单检查。
3. 事件类型、前置条件、时间顺序和冲突检查。
4. `publicVisibility`、NPC knowledge 和 spoiler level 检查。
5. 事件 fingerprint、内容 fingerprint、引用楼层和语义去重。
6. `forumContentSafety` 公开文本清洗及私密姓名/ID 检查。
7. evidence 必须存在；没有证据的内容只能成为 `candidate`，不能成为 `confirmed` 或 `ending`。

失败时按以下优先级处理：

- 仅文本失败：保留已确认事件，重新生成 StoryUpdate。
- 事件候选冲突：丢弃候选，写入失败原因，不改变状态。
- 版本冲突：重新读取最新 StoryContext，最多重试一次。
- 重复事件：标记 duplicate，不再发布。
- 剧透风险：降级为 hint 或等待前置事件，不向用户显示原始输出。

## 7. 连载机制设计

### 7.1 现实时间与故事时间

连载必须使用双时钟：

| 时钟 | 字段示例 | 用途 | 不能做什么 |
| --- | --- | --- | --- |
| 故事时钟 | `StoryTimeline.currentStoryAt`、`StoryEvent.occurredAt` | 决定 Day1/Day3/Day7、角色年龄/间隔、剧情顺序 | 不用于判断浏览器是否在线 |
| 系统时钟 | `createdAt`、`recordedAt`、`scheduledAt`、`publishedAt` | 延迟释放、重试、预算、诊断 | 不直接表示故事中事情发生的时间 |

`clockMode` 可选：

- `realtime`：故事时间跟随现实时间，适合“每天更新”的帖子。
- `accelerated`：用户每次互动可推进一小段故事时间，但每步仍需事件校验。
- `user-driven`：系统不自动推进，等待用户评论、选择或手动继续。

暂停、浏览器关闭或 API 失败只影响系统调度，不会偷偷推进 `currentStoryAt`。恢复时应先读取最后一个确认事件，再计算可用的下一步。

### 7.2 Day1 / Day3 / Day7 示例

| 节点 | 故事内目标 | 允许的生成 | 触发条件 | 状态要求 |
| --- | --- | --- | --- | --- |
| Day1 | 起因公开、楼主求助、第一批 NPC 观点 | 初始帖、2–3 条评论、一个未解决线索 | seed 确认 | 只能确认 opening/observation |
| Day3 | 线索被验证或出现冲突 | 楼主更新、NPC 争论、调查事件 | `storyAt >= Day3` 且 Day1 线索存在 | 不能直接进入结局 |
| Day7 | 反转/真相揭示 | reveal、阵营改变、结局候选 | 反转前置事件均 confirmed | `spoilerLevel=reveal`，按公开权限投影 |
| Ending | 解决主要冲突 | ending update、结局公告、收束评论 | ending prerequisites 完成 | 只能由 Ending Service 提交 resolved |

这只是模板，不应强制所有故事使用相同节奏。每个节点要通过 `milestoneId + stateVersion` 幂等，节点已消费后不能重复生成。

### 7.3 更新触发条件

故事更新由多个信号联合决定：

1. **时间触发：**达到 milestone 的最早故事时间，并满足现实最小间隔。
2. **互动触发：**用户回复了指定楼层、选择了分支、提出了与线索相关的问题。
3. **事件触发：**某个前置事件 confirmed，解锁下一事件。
4. **NPC 触发：**StoryCharacter 到达可行动时间且目标未完成。
5. **楼层触发：**公开讨论达到阈值，但仅能作为候选信号，不能自动证明事件发生。
6. **手动触发：**用户点击继续/请求更新；仍受状态和冷却限制。

触发器应存为结构化记录：`triggerType`、`sourceId`、`requiredStoryTime`、`requiredStateVersion`、`consumedAt?`。不使用自然语言标题判断触发是否已消费。

### 7.4 调度与释放

```text
每次可见 tick / 用户互动
  → releaseDueStoryUpdates（只释放已批准 Update）
  → 读取到期 Timeline milestone
  → 检查 story status / stateVersion / budget / cooldown
  → 生成 StoryEvent candidate
  → 验证并确认 Event
  → 生成 StoryUpdate candidate
  → 验证并写入 StoryUpdate
  → 创建 ForumActivityTask（带 storyId/eventId）
  → scheduledAt 到期
  → 再次验证 stateVersion 和 visibility
  → 写入 ForumReply/Thread
```

故事任务与普通 Forum 自动活动共用底层调度能力，但不共用幂等键、状态机或事件事实。故事更新在浏览器关闭时保留 `pending`，恢复后继续；没有服务端时不承诺真正后台运行。

### 7.5 防重复生成

必须同时使用四层去重：

| 层 | Key/规则 | 解决的问题 |
| --- | --- | --- |
| 触发去重 | `storyId + milestoneId + stateVersion` | 同一节点多次 tick |
| 事件去重 | `storyId + eventKind + canonicalFactsHash + causedByIds` | 同一事件被不同 Prompt 改写 |
| 发布去重 | `storyId + eventId + updateKind + visibility` | 同一事件重复发帖/回复 |
| 文本去重 | normalized semantic fingerprint | 文案近似但事实相同 |

`candidate` 可以被多次生成但不应多次确认；`confirmed`、`published` 和 `resolved` 记录必须幂等。发生版本冲突时只允许基于新版本重算，不合并两个未知版本的状态。

### 7.6 角色知识与剧透锁

每个 StoryCharacter 都维护独立知识投影：

```text
Event confirmed
  ├─ publicVisibility=public → 可进入公开论坛上下文
  ├─ knowledgeRecipients=A   → 只进入 A 的 StoryNpcContext
  ├─ rumor                   → 进入 A，但标记为 rumor
  └─ private/unknown          → 不进入公开 Prompt
```

结局和反转事件在达到 `revealGate` 前，即使已经在系统内部生成 candidate，也不能进入普通评论 Prompt。模型收到的是“未知/禁止透露”约束，而不是结局正文。

## 8. 风险分析与防护

| 风险 | 成因 | 防护设计 | 失败时的安全结果 |
| --- | --- | --- | --- |
| 随机生成垃圾故事 | 没有 seed 目标、节奏和结束条件；每次 tick 都让 AI 自由创作 | Story Seed、阶段目标、事件账本、预算、最小间隔、用户驱动模式 | 暂停故事或等待用户，不发布无证据内容 |
| NPC 人格漂移 | 每次从全量文本临时推断；状态没有版本 | StoryCharacter 固定 persona/style，StoryActorState 事件驱动，状态版本校验 | 拒绝违反约束的候选，保留上一版本 |
| 故事与现实角色混淆 | 同名角色、relation actor 直接复用、Memory 自动注入 | story-scoped actorKey；公开投影；禁止默认 Truth bridge | 只显示虚构故事身份，不写其他域 |
| 论坛内容重复 | 只做标题/正文简单 fingerprint | 事件级 idempotency、causal hash、文本语义 fingerprint、已消费 milestone | 标记 duplicate，不创建新楼层 |
| AI 提前泄露结局 | Prompt 同时包含全部事件和结局；NPC 不区分知识 | StoryKnowledge、forbiddenFacts、revealGate、spoilerLevel | 降级为 hint/拒绝发布，原始候选不展示 |
| AI 把传闻当事实 | 公开回复无 certainty 标识 | `confirmed/rumor/misunderstood` 分离，evidence 强制绑定 | 只能作为观点或传闻，不能推进状态 |
| 评论无限推动剧情 | 每条回复都被当成事件 | 事件触发器白名单，关键事件需前置条件/用户确认 | 仅保存普通 Reply，不改变 StoryState |
| 结局卡死 | 必须等待不存在的事件或用户选择 | timeline checkpoint、可解释 blocked 状态、手动跳过/放弃策略 | 进入 paused/abandoned，不随机补结局 |
| 角色跨身份泄露 | 只按 characterId 查找 NPC | 所有 key 以 `ownerIdentityId + storyId` 开头，关系再校验 relationId | 拒绝加载或丢弃越权候选 |
| 删除/归档后幽灵任务 | ActivityTask、StoryEvent、Reply 分散存储 | 删除事务、story tombstone、任务取消、证据保留策略 | 不再释放，历史快照显示已归档 |
| LocalStorage 丢失/容量不足 | 事件账本增长、普通压缩误删 | 独立 schema/version、事件保留策略、容量告警、导入导出设计 | 故事暂停并保留可恢复状态 |
| 多标签页并发 | 无服务端分布式锁 | stateVersion、generation guard、commit 时重新校验 | 一个事务成功，其他候选丢弃/重算 |

### 8.1 事实等级建议

故事内容至少分为：

```text
candidate   AI 提议，未被系统接受
observed    论坛中有人声称/用户回复，可能不真实
confirmed   满足事件规则和证据条件的故事事实
published   已投影到公开 Thread/Reply 的事实
retracted   被故事状态机撤回，不能继续进入 Prompt
```

`published` 不自动等于用户或角色现实世界中的 `true`。它只表示“故事公共叙事中已经发布”。

### 8.2 失败与人工恢复

所有 Story 任务应可解释：保存 `blockedReason`、`lastCandidateSummary`（去除敏感内容）、`retryAfter`、`stateVersion` 和引用证据。恢复动作包括继续、重试文本、拒绝候选、回滚到上一个确认事件、暂停、放弃和归档；不允许无提示地自动改写已确认事实。

## 9. 整体架构与数据流

### 9.1 整体架构图

```text
┌────────────────────────────────────────────────────────────┐
│                         Forum UI / AppForum                │
│  浏览帖子 · 回复 · 继续故事 · 暂停 · 选择分支 · 查看结局      │
└──────────────────────────────┬─────────────────────────────┘
                               │ user intent / public view
                               ▼
┌────────────────────────────────────────────────────────────┐
│                    Forum Story Application Layer            │
│ Story commands · Story scheduler · Story update release      │
└───────────────┬─────────────────────────┬──────────────────┘
                │                         │
                ▼                         ▼
┌────────────────────────┐   ┌─────────────────────────────┐
│      Story Domain       │   │       Existing Forum         │
│ Story/Event/State/Time  │   │ Thread/Reply/Activity/DM     │
│ state machine + ledger  │   │ public safety + sharing     │
└──────────────┬─────────┘   └──────────────┬──────────────┘
               │ read-only projection       │ public projection
               └──────────────┬──────────────┘
                              ▼
               ┌───────────────────────────┐
               │ ForumStoryContextBuilder  │
               │ + ForumStoryPromptAdapter │
               │ + PublicForum adapters    │
               └──────────────┬────────────┘
                              ▼
                    ┌──────────────────┐
                    │ AI Provider      │
                    │ candidate JSON   │
                    └────────┬─────────┘
                             │ validate
                             ▼
               ┌───────────────────────────┐
               │ Event Ledger Transaction  │
               │ Event → State → Update    │
               └──────────────┬────────────┘
                              ▼
                    ForumActivityTask
                              │ scheduled release
                              ▼
                  ForumThread / ForumReply
```

### 9.2 故事数据流

```text
Story Seed / 用户选择
  → ForumStory + StoryTimeline
  → StoryCharacter 初始状态
  → StoryEvent(opening, confirmed)
  → StoryThread(main) + ForumThread

公开评论/楼中楼
  → ForumReply（观察记录）
  → 触发器匹配
  → StoryEvent(candidate)
  → 校验/确认
  → StoryKnowledge + StoryActorState + Timeline
  → StoryUpdate
  → ActivityTask
  → Reply 发布 + evidence

所有分支
  → ownerIdentityId 隔离
  → Story scope 内持久化
  → 默认不写 Memory / Relationship / OfflineStory
```

## 10. 未来实现步骤（本阶段不执行）

以下是建议的实现顺序，不代表本次已经修改：

### Phase 0：边界和开关

1. 确认产品定义：故事是否只由用户创建，是否允许系统种子，是否允许自动推进。
2. 确认 Truth Layer 政策：默认 story-only，授权桥接是否首期禁用。
3. 增加 feature flag 和 schema version 设计；旧 Forum 行为保持不变。
4. 固定故事模板、内容安全级别、每日预算和默认 `clockMode`。

### Phase 1：Domain 与存储

1. 新增 `forumStoryTypes`、StoryEvent Ledger、Timeline、Character、Knowledge 和 StateTransition 类型。
2. 新增独立 Story repository 与 LocalStorage keys，提供 identity snapshot、版本迁移和清理接口。
3. 实现事件幂等、状态机、证据引用、删除/归档和容量策略。
4. 让旧 `ForumThread.storyArc` 只作为兼容摘要，不迁移旧 Reply 为事件。

### Phase 2：Context 与 AI

1. 实现 `ForumStoryContextBuilder`，只输出带权限的 confirmed/public 投影。
2. 实现分任务 `ForumStoryPromptAdapter` 和严格 JSON schema。
3. 接入 candidate → validation → confirm → update 的事务边界。
4. 将事件生成与公开文本生成分离，失败可重试而不重复确认事件。

### Phase 3：Forum 投影与调度

1. 增加 StoryThread/ForumThread 映射和 Reply evidence 关联。
2. 扩展 ActivityTask 支持 storyId/eventId/stateVersion，释放前再次校验。
3. 增加 Day/milestone scheduler、手动继续/暂停、分支和 ending gate。
4. 接入通知、分享和翻译时的公开快照；不改变 Chat Memory 行为。

### Phase 4：可观测性与质量门槛

1. 记录候选拒绝原因、重复命中、版本冲突、剧透拦截和任务饥饿。
2. 增加生成预算、超时、恢复和导入导出策略。
3. 建立事件顺序、权限、身份隔离、NPC 状态稳定、结局门控和删除清理测试。
4. 在小范围 feature flag 下验证，再考虑 UI 展示和模板市场。

## 11. 设计验收标准

在未来实现前，至少满足以下不变量：

1. 普通 Forum Thread/Reply 在 `storyId` 为空时行为完全不变。
2. 每个 StoryEvent 有唯一 `idempotencyKey`，同一事件最多确认一次。
3. 公开 Reply 没有对应 confirmed/public Event 时，只能作为普通论坛内容，不得推进故事状态。
4. 所有 NPC 发言都能追溯到一个 StoryCharacter、一个 Context 版本和一个公开知识集合。
5. 角色不能知道超出 `StoryKnowledge` 的事件；结局在 reveal gate 前不可进入普通 Prompt。
6. Story Domain 不读取 Chat Memory、Relationship 私密数据、InnerVoice 或 OfflineStory 全文。
7. `ownerIdentityId + storyId` 是所有故事数据和任务的隔离前缀；关系 actor 还需 `relationId + characterId` 校验。
8. 事件确认、状态更新、公开 Update 关联和 Activity 调度具备幂等/版本校验。
9. 生成失败不会产生“看起来已经发生但没有账本证据”的楼层。
10. 故事结局发布成功后才迁移 `resolved`；暂停、放弃和归档均保留可追溯历史。
11. 故事内容不会自动写入用户 Memory、Character Memory、Relationship、Diary、Moment 或 OfflineStory。
12. 删除角色/身份/故事时，Thread、Reply、Event、Update、Task、Knowledge、ActorState 和 Share 的清理策略明确且可恢复。

## 12. 结论

论坛体故事应被实现为“独立 Story Domain + 现有 Forum 公共投影”，而不是给 `ForumThread` 增加更多 Prompt 字段。`ForumThread`/`ForumReply` 继续负责可见的楼层体验，`StoryEvent` 负责可验证的故事事实，`StoryCharacter` 和 `StoryKnowledge` 负责 NPC 的长期一致性，`StoryTimeline` 和 Scheduler 负责 Day1/Day3/Day7 的节奏，`StoryUpdate` 和 ActivityTask 负责把已确认事件安全地发布出来。

最重要的安全边界是：故事可以在自己的 scope 内“真实”，但它不因此成为用户与现实角色之间的真实事实。没有明确授权和可追溯桥接，故事永远不会污染 Memory、Relationship 或其他应用的 Truth Layer。
