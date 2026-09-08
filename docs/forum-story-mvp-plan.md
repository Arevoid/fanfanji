# ForumStory MVP 实现规划

> 设计依据：`docs/forum-story-system-design.md`、`docs/forum-architecture-analysis.md`。  
> 目标：在现有 Forum 上实现最小可用的单主线论坛体故事。  
> 本文只规划实现，不修改源码、不创建测试、不改变现有数据。  
> 设计日期：2026-08-06。

## 0. MVP 定义

### 0.1 必须支持

1. 创建一个故事种子并生成 StoryThread 的初始论坛帖子。
2. 使用现有 ForumThread/ForumReply 展示主楼、评论和楼中楼。
3. 允许最少量的故事 NPC 参与评论。
4. 用户评论可以产生故事观察事件，并触发下一次楼主更新候选。
5. 楼主根据已确认事件发布 `author-update`。
6. 故事状态按 `draft → active → waiting_update → active/completed` 推进。
7. 满足结束条件后生成结局更新并将故事标记为 `completed`。

### 0.2 明确不做

- 复杂分支、互斥世界线和回滚选择。
- 多故事并行世界、跨故事 NPC 社会关系。
- 用户直接改写故事事实或编辑 AI 已确认事件。
- 自动写入用户 Memory、Character Memory、Relationship、CharacterEvent、Diary、Moment 或 OfflineStory。
- 正式 Truth Layer 桥接。
- 完整 NPC 情绪、好感、作息、长期人格成长系统。
- 服务端同步、浏览器关闭后的真正后台推进。
- 自动无限连载；MVP 以手动“继续故事”为主。

### 0.3 MVP 简化决策

| 维度 | MVP 决策 | 原因 |
| --- | --- | --- |
| 并行故事 | 每个 `ownerIdentityId` 最多一个 `active/waiting_update` 故事；其他故事只能 `draft/completed` | 避免多故事调度和 UI 选择复杂度 |
| StoryThread | 一个故事只有一个主楼 `role=main` | 暂不实现分支楼、回顾楼、结局楼分离 |
| NPC | 仅使用故事虚拟 NPC；关系角色只允许作为明确的公开投影参与 | 避免读取关系私密数据 |
| 更新触发 | 用户评论产生观察信号；用户手动点击“继续故事”生成更新 | 不依赖新增后台调度器 |
| 定时 | 只保存 `nextUpdateAt` 作为资格时间，不自动调用 AI | 复用现有 Activity 引擎前先验证故事账本 |
| 事件 | 线性事件序列，无复杂分支 | 支持起因、冲突、更新和结局即可 |
| 结局 | 达到固定事件数或 seed 指定条件后结束 | 保持可解释、可去重 |

## 1. MVP 数据模型

### 1.1 `ForumStory`

故事根实体。它描述“论坛体故事正在发生什么”，不替代现有 `ForumThread`。

| 字段 | 类型/枚举 | 作用 | 生命周期 |
| --- | --- | --- | --- |
| `id` | `string` | 故事唯一标识 | 创建后不变 |
| `ownerIdentityId` | `string` | 手机身份隔离 | 创建后不变；所有读写必须校验 |
| `title` | `string` | 故事标题，可同步到主楼标题 | `draft` 创建；MVP 不支持随意编辑 |
| `seed` | `string` | 用户/模板提供的起因或主题 | 创建时写入，进入 `active` 后冻结 |
| `premise` | `string` | 经过安全处理的公开起因摘要 | 初始帖生成时确认 |
| `status` | `"draft" \| "active" \| "waiting_update" \| "completed"` | 故事状态机当前状态 | 由系统迁移，AI 只能提出建议 |
| `mainThreadId` | `string?` | 关联 StoryThread ID | 初始帖成功创建后写入 |
| `currentEpisode` | `number` | 当前线性幕次，MVP 从 1 开始 | 每次确认推进事件时递增或保持 |
| `currentStoryAt` | `number` | 故事内部时间戳/Day 值 | 事件确认时更新 |
| `nextUpdateAt` | `number?` | 下一次允许更新的最早系统时间 | 可选资格门槛，不自动执行 |
| `lastUserReplyAt` | `number?` | 最近一次用户评论时间 | 评论写入后更新 |
| `confirmedEventCount` | `number` | 已确认故事事件数量 | 事件确认时递增 |
| `endingCondition` | `string` | MVP 的简单结束条件摘要 | 创建时冻结；不保存完整隐藏结局 |
| `stateVersion` | `number` | 乐观并发版本 | 每次状态/事件事务递增 |
| `createdAt` / `updatedAt` | `number` | 本地写入时间 | 持久化 |
| `completedAt?` | `number` | 故事完成时间 | 完成时写入 |

**MVP 状态含义：**

- `draft`：已有 seed，尚未成功发布初始帖。
- `active`：初始帖已发布，故事可以接受评论和 NPC 互动。
- `waiting_update`：存在用户评论或待推进事件，等待用户手动继续；不代表 AI 正在后台运行。
- `completed`：结局更新已经成功发布，禁止继续生成新剧情。

### 1.2 `StoryThread`

故事域到现有 Forum 主楼的映射记录。

| 字段 | 类型 | 作用 | 生命周期 |
| --- | --- | --- | --- |
| `id` | `string` | StoryThread 映射 ID | 创建后不变 |
| `storyId` | `string` | 所属 ForumStory | 永久关联 |
| `forumThreadId` | `string` | 现有 `ForumThread.id` | 初始帖子写入后确定 |
| `role` | `"main"` | MVP 只支持主楼 | 创建后不变 |
| `episode` | `number` | 主楼当前故事幕次 | 更新时同步 |
| `status` | `"open" \| "closed"` | 是否接受评论/更新 | 故事完成时关闭 |
| `createdAt` / `updatedAt` | `number` | 映射记录时间 | 持久化 |

StoryThread 不复制帖子正文；正文和评论仍由 `ForumThread`、`ForumReply` 保存。故事域通过 `forumThreadId` 关联，并通过 StoryUpdate/Event 保存“这条楼层为什么存在”。

### 1.3 `StoryCharacter`

MVP 的最小 NPC 模型。它是故事内身份，不是完整论坛用户系统，也不是现实 Relationship。

| 字段 | 类型 | 作用 | 生命周期 |
| --- | --- | --- | --- |
| `id` | `string` | 故事内 NPC ID | 创建后不变 |
| `storyId` | `string` | 作用域隔离 | 创建后不变 |
| `identity` | `{ publicName: string; avatar?: string; actorKey: string }` | 论坛公开身份和稳定 actor key | 创建时确定；头像可保持不变 |
| `persona` | `string` | 该故事范围内的性格/说话基调 | 创建时生成并冻结 |
| `role` | `string` | 楼主、目击者、同事、质疑者等故事角色 | 创建时确定 |
| `knowledge` | `string[]` 或 `{ eventId: string; certainty: "confirmed" \| "rumor" }[]` | NPC 已知的故事事件 | 只能由确认事件事务更新 |
| `isAuthor` | `boolean` | 是否可以发布楼主更新 | 创建时确定 |
| `status` | `"active" \| "silent" \| "removed"` | 是否允许生成新发言 | 状态机维护 |
| `createdAt` / `updatedAt` | `number` | 本地时间 | 持久化 |

MVP 不保存：复杂情绪曲线、好感、长期目标树、跨故事关系、现实角色私密背景、Chat Memory、InnerVoice。

### 1.4 `StoryEvent`

线性故事事件账本。普通论坛评论不是自动事件，只有经过规则确认的事件才影响剧情。

| 字段 | 类型/枚举 | 作用 | 生命周期 |
| --- | --- | --- | --- |
| `id` | `string` | 事件 ID | 永久保留，撤回不复用 |
| `storyId` | `string` | 所属故事 | 永久关联 |
| `sequence` | `number` | 线性顺序 | 确认时分配 |
| `kind` | `"opening" \| "observation" \| "conflict" \| "reveal" \| "decision" \| "ending"` | 事件类型 | 候选生成时提出，确认后固定 |
| `summary` | `string` | 原子、可验证的故事事实摘要 | candidate/confirmed 时保存 |
| `actorIds` | `string[]` | 参与 NPC ID | 确认时固定 |
| `source` | `"seed" \| "user_reply" \| "npc_candidate" \| "story_system"` | 事件来源 | 创建时确定 |
| `evidenceReplyIds` | `string[]` | 支持事件的 ForumReply ID | 观察/评论事件写入 |
| `status` | `"candidate" \| "confirmed" \| "rejected"` | 是否改变故事状态 | 只有 confirmed 可推进 |
| `occurredAt` | `number` | 故事内部时间 | 确认后冻结 |
| `recordedAt` | `number` | 写入时间 | 创建时确定 |
| `idempotencyKey` | `string` | 防止同一评论/事件重复确认 | 创建时计算 |
| `stateVersion` | `number` | 生成候选时读取的故事版本 | 确认时必须匹配 |
| `createdAt` | `number` | 本地记录时间 | 持久化 |

MVP 默认把 confirmed 事件视为“仅在该 ForumStory 内成立”；不设置跨域 Truth Layer 写入。

### 1.5 `StoryUpdate`

把确认事件转换成可见论坛内容的发布记录。

| 字段 | 类型/枚举 | 作用 | 生命周期 |
| --- | --- | --- | --- |
| `id` | `string` | 更新 ID | 永久保留 |
| `storyId` | `string` | 所属故事 | 永久关联 |
| `eventIds` | `string[]` | 更新依据的 confirmed Event | 发布前必须存在 |
| `storyThreadId` | `string` | 目标 StoryThread | MVP 只指向主楼 |
| `forumReplyId` | `string?` | 对应已发布 `ForumReply.id` | 发布成功后写入 |
| `updateKind` | `"initial-post" \| "author-update" \| "ending"` | 公开表现类型 | 生成时确定 |
| `authorCharacterId` | `string` | 发布者 NPC；初始帖可为系统故事作者 | 发布时固定 |
| `bodyFingerprint` | `string` | 去重和重复检测 | 生成时计算 |
| `status` | `"candidate" \| "published" \| "cancelled"` | 更新是否已公开 | 状态机维护 |
| `scheduledAt?` | `number` | 可选延迟释放时间 | MVP 可为空/立即发布 |
| `publishedAt?` | `number` | ForumReply 写入时间 | 发布后写入 |
| `createdAt` / `updatedAt` | `number` | 本地时间 | 持久化 |

StoryUpdate 是故事域的发布账本；`ForumReply.kind="author-update"` 是它的公开投影，不是 StoryUpdate 的替代品。

### 1.6 关系图

```text
ForumStory 1 ───── 1 StoryThread ───── 1 ForumThread
     │                                      │
     ├──── * StoryCharacter                 └──── * ForumReply
     │                                                │
     ├──── * StoryEvent ◄──────── evidenceReplyIds ───┘
     │          ▲
     └──── * StoryUpdate ───────────────► forumReplyId
```

### 1.7 MVP 存储边界

建议新增独立 LocalStorage key，不把故事事实塞进普通 Forum 数组：

```text
phone_forum_stories
phone_forum_story_threads
phone_forum_story_characters
phone_forum_story_events
phone_forum_story_updates
```

所有记录均以 `ownerIdentityId` 过滤。仓库应提供 `getForumStorySnapshot(ownerIdentityId)`、原子 mutation、schema version、身份删除清理和订阅能力；现有 `phone_forum_threads`、`phone_forum_replies` 继续保存公开论坛内容。

## 2. 与现有 Forum 集成方案

### 2.1 可直接复用的能力

| 现有对象/服务 | MVP 复用方式 |
| --- | --- |
| `ForumThread` | 主楼公开内容、标题、作者、时间、点赞、回复统计 |
| `ForumReply` | 用户评论、NPC 评论、楼主更新、结局公告；楼层仍由 Forum 维护 |
| `ForumPublicAuthor` / Virtual Profiles | StoryCharacter 的公开作者投影；不暴露内部 story actor ID |
| `forumData.ts` | Thread/Reply 构造、追加、楼层分配、删除和指标 |
| `forumRepository.ts` | 公开 Forum 数据提交、快照、订阅、身份隔离 |
| `forumContentSafety.ts` | 公开文本清洗、敏感姓名/内部标记/媒体内容检查 |
| `forumValidation.ts` | AI JSON、楼层引用、文本长度和时间线校验 |
| `forumGenerationGuard.ts` | 生成幂等、重试、in-flight 防护思路 |
| `AppForum.tsx` | 现有帖子详情、评论、通知、刷新和状态订阅入口 |
| `ForumActivityTask` | 可选的延迟公开队列；MVP 默认只使用立即发布或手动更新 |

### 2.2 需要新增的领域能力

- `src/domain/forumStory/forumStoryTypes.ts`：五个 MVP 模型和枚举。
- `src/domain/forumStory/forumStoryStateMachine.ts`：状态迁移、结束条件、版本校验。
- `src/domain/forumStory/forumStoryEventLedger.ts`：候选/确认/拒绝、事件去重、证据绑定。
- `src/domain/forumStory/forumStoryData.ts`：创建、查询、更新、删除和投影辅助函数。
- `src/core/storage/repositories/forumStoryRepository.ts`：Story 快照和 LocalStorage 提交。
- `src/features/forum/services/forumStoryGenerationService.ts`：初始帖、评论、楼主更新和结局候选生成。
- `src/features/characterCognitive/promptAdapters/forumStoryPromptAdapter.ts`：故事安全投影；不复用私密 CharacterCognitiveContext。

不建议首期改造 `ForumThread.storyArc` 以承载全部 Story 状态；可在未来通过 `storyId` 可选关联，旧帖子保持完全兼容。

### 2.3 Post / Comment / Thread / User 对应关系

| 概念 | 现有实现 | MVP 处理 |
| --- | --- | --- |
| Post | `ForumThread` | 作为 StoryThread 的主楼公开帖子 |
| Comment | 没有独立 Comment 类型，使用 `ForumReply` | 继续使用 Reply；额外写入 StoryEvent/evidence |
| Thread | `ForumThread` + 回复集合 | ForumThread 是展示线程；StoryThread 是故事域映射 |
| User | `ForumUserProfile` / 当前 identity | 用户可发主楼评论；不是 StoryCharacter，除非评论成为 `source=user_reply` 观察事件 |
| NPC | 当前 relationship/virtual actor | MVP 使用 StoryCharacter + public author 投影；禁止直接把关系私密数据作为 NPC context |

### 2.4 创建与评论的集成顺序

**创建 StoryThread：**

```text
用户/模板提供 seed
  → createForumStory(draft)
  → 生成 StoryCharacter 初始资料
  → StoryOpeningPrompt
  → 校验 opening Event candidate
  → 确认 opening Event
  → createForumThread
  → create StoryThread(main)
  → create StoryUpdate(initial-post, published)
  → commit Story + ForumThread + StoryThread + Event + Update
```

**用户发表评论：**

```text
用户在现有 AppForum 发 ForumReply
  → commit ForumReply
  → 若属于 StoryThread：记录 user_reply observation candidate
  → 依据简单触发器判断是否需要故事更新
  → 没有触发时：Story 保持 active
  → 有触发时：Story 迁移 waiting_update，等待“继续故事”
```

评论写入和观察事件最好在一个 story-aware mutation 中完成；若不能跨仓库原子提交，至少使用 `replyId + storyId` 幂等键，重试不会重复创建观察事件。

### 2.5 楼主更新与结束集成

```text
用户点击继续故事
  → load story snapshot
  → status 必须是 waiting_update
  → load confirmed events + StoryCharacters + public replies
  → StoryUpdatePrompt
  → 生成 update candidate
  → 确认 conflict/reveal/ending Event
  → 生成 author-update 或 ending ForumReply
  → commit Event + StoryUpdate + Reply + Story state
  → active（普通更新）或 completed（结局）
```

若 StoryUpdate 文本生成失败，故事保持 `waiting_update`，不提前写入 `completed`；可重试文本，不重复确认同一事件。

## 3. AI 生成链路

### 3.1 `ForumStoryContext`

MVP Context 是一个只读、story-scoped、public-safe 的投影：

| Context | 内容 |
| --- | --- |
| `story` | title、premise、status、currentEpisode、currentStoryAt、endingCondition |
| `confirmedEvents` | 当前故事已确认的线性事件摘要，按 sequence 排序 |
| `openObservations` | 用户评论对应的候选观察，标记为 user observation，不是事实 |
| `characters` | NPC public identity、persona、role、knowledge 摘要 |
| `mainThread` | 主楼标题、正文和最近有效 ForumReply |
| `allowedActions` | 当前可生成 comment、author-update、ending 的白名单 |
| `forbiddenFacts` | 未确认事件、隐藏结局、关系私密事实、其他角色未知信息 |
| `stateVersion` | 生成时读取的故事版本 |

Context 不携带完整 `ForumStory` 的内部字段、LocalStorage key、relationId、characterId、actorKey、任务 ID 或用户私密数据。

### 3.2 Prompt Adapter

MVP 只需要三个适配器，初始帖与结局可以通过任务参数区分：

| Adapter | 输入 | 输出 | 使用场景 |
| --- | --- | --- | --- |
| `ForumStoryOpeningPromptAdapter` | seed、公开故事规则、初始 NPC、opening schema | 初始帖 + opening event candidate | `draft → active` |
| `ForumStoryCommentPromptAdapter` | confirmed events、当前主楼、最近评论、NPC knowledge | 1 条 NPC comment candidate；可附 observation suggestion | 首次互动/手动更新时 |
| `ForumStoryUpdatePromptAdapter` | confirmed events、已确认观察、current episode、endingCondition | `author-update` 或 `ending` candidate + event candidate | `waiting_update → active/completed` |

适配器输出严格 JSON，示例结构：

```json
{
  "event": {
    "kind": "conflict",
    "summary": "楼主在旧照片中发现了与失踪日期矛盾的时间标记",
    "actorIds": ["story-character-1"],
    "evidenceReplyIds": []
  },
  "update": {
    "kind": "author-update",
    "body": "……我又翻了一遍那张照片，发现右下角的时间标记不对。",
    "replyToFloor": 1
  },
  "nextStatus": "active"
}
```

`actorIds`、`replyToFloor` 和 `nextStatus` 必须由系统白名单校验；AI 不能直接提交任意 ID 或状态。

### 3.3 输入和禁止读取

| 数据 | MVP 是否读取 | 处理方式 |
| --- | --- | --- |
| Story seed / confirmed StoryEvent | 是 | 仅当前 `ownerIdentityId + storyId` |
| ForumThread / ForumReply | 是 | 只取当前主楼的公开内容和最近楼层 |
| StoryCharacter persona/role/knowledge | 是 | 只取故事内最小公开投影 |
| 用户当前 ForumReply | 是 | 作为公开观察或触发信号，不自动升级为现实事实 |
| Memory | 否 | 不传入，不写回 |
| Relationship 私密数据 | 否 | 不传入；关系 actor 只可使用公开故事角色投影 |
| CharacterCognitiveContext | 否 | ForumStory 不使用 Chat/DM 认知上下文 |
| Private Context / InnerVoice | 否 | 永久禁止 |
| OfflineStory 全文 | 否 | 永久禁止 |
| CharacterEvent | 否 | MVP 不接 Truth Layer；未来授权桥接另行设计 |
| WorldBook 私密条目 | 否 | 只允许明确 public story setting；MVP 可先不接 |

### 3.4 初始帖子生成

```text
createForumStory(seed)
  → 规范化 seed（系统）
  → 生成 opening candidate（AI）
  → 校验 opening event：必须有起因/冲突，不得包含隐藏结局（系统）
  → 确认 opening event（系统）
  → 生成 initial-post 文本（同一次候选或独立文本阶段）
  → createForumThread + StoryThread + StoryUpdate
```

初始帖失败时，保持 `draft`；不得创建空 Thread，也不得写入半成品 StoryEvent。

### 3.5 评论生成

MVP 不让 AI 为每一条用户评论自动调用一次模型。推荐两种入口：

1. 用户发帖后由现有 Forum 初始活动机制生成最多一条 Story NPC comment；
2. 用户点击“继续故事”时，由 `ForumStoryCommentPromptAdapter` 生成一条必要 NPC 评论或直接生成楼主更新。

评论候选必须：

- 引用真实存在的楼层或主楼。
- 只能表达 NPC 已知事实、观点或标记为 rumor 的信息。
- 不得单独确认新的重大事件；重大事件先进入 Event candidate。
- 不得改变 Story status，状态由系统根据 event/update 结果决定。

### 3.6 楼主更新与结局生成

楼主更新必须绑定至少一个 `confirmed` Event；若生成结果是 `ending`，还必须满足：

- endingCondition 已满足。
- 当前没有待处理的必需观察或用户选择。
- 结局 fingerprint 未发布过。
- `nextStatus=completed` 只能由状态机在 Reply 成功写入后设置。

AI 可提出 `nextStatus`，但系统必须重新计算并覆盖它。模型输出的结局不能直接写入 `ForumStory.completed`。

## 4. 故事推进机制

### 4.1 状态迁移表

| 当前状态 | 触发 | 系统动作 | 下一状态 |
| --- | --- | --- | --- |
| `draft` | opening 事件和初始帖提交成功 | 创建 StoryThread/Update，设置 episode=1 | `active` |
| `draft` | AI/校验失败 | 保存错误，不发布公开内容 | `draft` |
| `active` | 普通用户评论 | 写 ForumReply；可写 observation candidate | `active` |
| `active` | 评论满足更新触发器 | 写 observation candidate，设置 pending | `waiting_update` |
| `waiting_update` | 用户点击继续且通过 cooldown | 生成/确认 Event，发布 NPC/楼主更新 | `active` 或 `completed` |
| `waiting_update` | 用户取消/暂停 | 不生成，保留观察和状态 | `waiting_update` |
| `completed` | 任意评论/刷新 | 只允许普通论坛互动，不生成故事事件/更新 | `completed` |

### 4.2 更新触发策略

**MVP 主触发：手动。** 用户点击“继续故事”是唯一保证会调用 Story AI 的入口。这样可以避免每条评论造成大量生成，也不依赖页面后台运行。

**事件触发：受限。** 用户评论写入后，系统只做确定性判断：

- 评论属于当前 StoryThread。
- 评论不是删除/tombstone。
- 尚无同一 `replyId` 的 observation event。
- 故事未 completed。
- 评论数量或关键字满足 seed 中允许的简单触发器（MVP 可先使用“每 1 条用户评论最多产生一个待更新标记”）。

满足时迁移 `active → waiting_update`，不自动生成内容。

**定时触发：只做资格检查。** `nextUpdateAt` 可由初始 seed 或上次更新设置，用于判断用户点击继续是否过早；MVP 不让定时器自动调用 AI。后续可以把它接到现有 `useForumActivityEngine`，但必须使用 StoryEvent/stateVersion 事务。

### 4.3 线性推进规则

1. 每次继续最多确认一个主事件，并发布一条 NPC 评论或楼主更新。
2. 事件 `sequence` 必须是 `confirmedEventCount + 1`，禁止跳号。
3. 下一事件只能使用当前以及之前的 confirmed Event。
4. 同一用户回复不能重复产生 observation Event。
5. 普通评论不自动推进 episode；楼主更新/关键事件确认时才更新 episode。
6. 达到 `endingCondition` 后进入 ending candidate；结局发布成功才进入 completed。
7. completed 故事保留公开帖子和只读故事摘要，但不再调用故事生成服务。

### 4.4 结束条件

MVP 结束条件采用“可解释的固定规则 + seed 摘要”：

- `confirmedEventCount >= maxEvents`，默认 3–5 个；或
- 已确认的 event kind 包含 `reveal`，且存在至少一个 `conflict`；或
- seed 明确指定的 `endingCondition` 已由系统规则匹配。

不能只依据 AI 返回的“故事结束了”字符串完成；必须由状态机和事件账本计算。

## 5. NPC 最小模型

### 5.1 最小字段

```text
StoryCharacter
  ├─ identity: publicName / avatar / actorKey
  ├─ persona: 一段稳定的故事人格摘要
  ├─ role: 在本故事中的角色
  ├─ knowledge: 已知 confirmed event 的 story-scoped 列表
  ├─ isAuthor: 是否可发楼主更新
  └─ status: active / silent / removed
```

### 5.2 NPC 生成约束

- 每个 NPC 只能从自己的 `knowledge` 生成事实性发言。
- NPC 不知道 `knowledge` 之外的 confirmed Event，也不知道任何 private/unknown 内容。
- `persona` 在故事创建后默认冻结；MVP 不实现人格成长。
- `role` 决定是否可发楼主更新、是否可评论以及允许的观点范围。
- `identity.actorKey` 只在 Story Domain 内使用；ForumPublicAuthor 只保留公开姓名和头像。
- NPC 回复必须关联 `storyCharacterId` 和当前 `stateVersion`，便于追溯。

### 5.3 关系角色的限制

MVP 默认不把真实 Relationship 角色作为故事 NPC。若产品必须使用关系角色，只能：

1. 先创建一个独立的 StoryCharacter；
2. 由用户提供/确认公开 persona 和公开姓名；
3. 只传 StoryCharacter 的公开资料给 AI；
4. 不读取 Relationship 私密数据、Memory、Chat 历史或角色心声；
5. 不把故事内事件写回真实角色状态。

这样可以保留未来扩展空间，同时保证故事身份和现实角色隔离。

## 6. 安全边界与 Truth Layer

### 6.1 事实范围

ForumStory 的事实域是 `story scope`：

```text
ownerIdentityId + storyId + story stateVersion
```

在这个范围内，`StoryEvent.status=confirmed` 表示故事内部确认发生；它不代表用户现实世界、Chat 关系或角色私密记忆中的事实。

### 6.2 明确禁止

ForumStory MVP 不得：

- 读取用户 Memory 并把它当作故事起因或 NPC 背景。
- 读取/写入 Relationship 事实、关系阶段或角色私密状态。
- 读取/写入 CharacterEvent。
- 读取 Chat/Forum DM 的私密原文。
- 把用户评论转写为用户在现实世界“做过”的动作。
- 把 StoryCharacter 同名映射为真实 Character。
- 将故事帖子分享给 Chat 时自动创建关系记忆。
- 让已完成故事继续生成新的故事事实。

### 6.3 公开 Forum 仍需的安全校验

故事文本进入 `ForumThread`/`ForumReply` 前，继续复用现有安全层：

- JSON/schema 解析、长度和字段白名单。
- 私密姓名、内部 ID、动作旁白、媒体标记和 Prompt 注入清洗。
- 引用楼层存在性与 reply timeline 校验。
- NPC actor 必须属于当前 StoryCharacter 白名单。
- 更新 body 必须有 `confirmedEventIds`，并检查 event visibility 为 story-public。
- 事件指纹、更新指纹和用户回复幂等键去重。

### 6.4 分享/删除边界

- 分享到 Chat 时只创建现有 `ForumThreadPublicSnapshot`，不附加 StoryEvent 内部字段、NPC knowledge 或隐藏结局。
- 删除 ForumReply 不删除已确认事件；证据变为 unavailable/tombstone，事件仍保留以保证故事顺序可追溯。
- 删除故事时取消未发布 StoryUpdate、标记 StoryEvent 为 archived/retracted（按产品策略），并清理映射和任务；普通 Forum 帖子是否保留必须由用户确认。

## 7. 实现步骤拆分

以下是建议的开发顺序。每一步都应先完成类型/接口和验收条件，再进入下一步；本次不执行任何步骤。

### Step 1：Domain Types

**目标：**建立 MVP 的纯类型和确定性规则，不接 UI、不调用 AI。

建议新增：

```text
src/domain/forumStory/
├─ forumStoryTypes.ts
├─ forumStoryStateMachine.ts
├─ forumStoryEventLedger.ts
└─ forumStoryData.ts
```

内容：

- 定义 ForumStory、StoryThread、StoryCharacter、StoryEvent、StoryUpdate。
- 定义状态、事件类型、更新类型、source 和 schema version。
- 实现状态迁移、endingCondition、sequence、idempotencyKey 和 stateVersion 规则。
- 实现从 Story domain 到 `ForumPublicAuthor`/公开 Update 的纯投影函数。

完成标准：

- 不需要 React/LocalStorage/AI 即可构造合法对象。
- 非法状态迁移、越权 actor、重复 sequence 会被拒绝。
- Story domain 类型不引用 Memory、Relationship 私密类型或 CharacterCognitiveContext。

### Step 2：Storage

**目标：**让五个 Story 对象可按身份持久化、订阅、恢复和清理。

建议新增：

```text
src/core/storage/storageKeys.ts                     # 增加 phone_forum_story_* keys
src/core/storage/repositories/forumStoryRepository.ts
```

内容：

- 新增独立 LocalStorage keys 和 schema version。
- 提供 `getForumStorySnapshot(ownerIdentityId)`。
- 提供 `commitForumStoryMutation`，同时提交 Story/Event/Update/Character/StoryThread。
- 以 `ownerIdentityId` 做加载、写入、订阅和清理边界。
- 处理旧数据缺失、坏数据修复、重复记录和容量上限。
- 角色/身份删除时取消 Story tasks 并清理对应映射。

完成标准：

- 刷新页面可恢复故事状态、事件顺序和主楼映射。
- 同一个 `idempotencyKey` 重放不会产生重复 Event/Update。
- 任何 snapshot 不会混入其他 identity 的记录。

### Step 3：Story 生成

**目标：**从 seed 生成初始 StoryThread 和公开主楼。

建议新增：

```text
src/features/forum/services/forumStoryGenerationService.ts
src/features/characterCognitive/promptAdapters/forumStoryPromptAdapter.ts
```

内容：

- 构建最小 `ForumStoryContext`。
- 调用 `ForumStoryOpeningPromptAdapter`。
- 解析 opening Event 和初始帖候选。
- 经过安全、长度、重复、状态和私密边界校验。
- 先确认 opening Event，再创建 ForumThread/StoryThread/StoryUpdate。
- 生成失败保持 `draft`，不写半成品公开内容。

完成标准：

- 给定同一 seed 和同一 stateVersion，重复任务可幂等恢复。
- 初始帖只引用 story scope 内容，不读取 Memory/Relationship/Private Context。
- 初始帖子成功后状态准确为 `active`，主楼映射可追溯。

### Step 4：Comment 生成

**目标：**让用户评论后有受控的 NPC 讨论，不把每条评论都变成剧情事实。

内容：

- 在现有 AppForum 用户回复成功后识别所属 StoryThread。
- 写入唯一的 user observation candidate（按 `replyId + storyId` 去重）。
- 使用 `ForumStoryCommentPromptAdapter` 生成最多一条 NPC comment candidate。
- 校验 NPC knowledge、回复楼层、公开文本和事件权限。
- 普通评论只创建 `ForumReply`；重大事实保持 candidate，不能自动 confirmed。
- 发布后保留 StoryUpdate 记录，便于追溯。

完成标准：

- NPC 不会引用不存在的楼层或未知事件。
- 用户评论重复提交/跨页面重试不会重复生成回复。
- 没有明确事件证据时，NPC 只能讨论/猜测，不会改变故事状态。

### Step 5：Update 推进

**目标：**手动继续故事，确认事件并生成楼主更新或结局。

内容：

- 提供 `requestStoryUpdate(storyId)` command；仅允许 `waiting_update`，或明确允许首个 active 手动继续。
- 读取最新 Story snapshot，校验 `stateVersion`、cooldown、endingCondition 和未处理 observations。
- 调用 `ForumStoryUpdatePromptAdapter`。
- 先写/确认 StoryEvent，再创建 StoryUpdate candidate。
- 生成 `ForumReply(kind="author-update")` 或 ending Reply。
- 普通更新后回到 `active`；结局 Reply 成功写入后才迁移 `completed`。
- AI 失败、版本冲突或安全失败时保留 `waiting_update`，记录可重试状态。

完成标准：

- 每次手动继续最多确认一个主事件和一个公开更新。
- 不会跳过事件 sequence 或提前生成结局。
- 更新正文、事件证据和 ForumReply 可以互相追溯。

### Step 6：UI 接入

**目标：**在现有 Forum 页面暴露最小故事入口，不重新设计完整论坛 UI。

建议增量接入：

- Forum 首页/创建入口：创建 Story seed，并显示生成中/失败/草稿状态。
- Thread 详情：显示这是 StoryThread、当前状态、episode 和“继续故事”按钮。
- 评论提交后：只更新故事状态提示，不额外增加复杂可见反馈。
- 楼主更新/结局：继续使用现有 Reply 卡片和 author-update 样式。
- completed 后显示只读故事标记，隐藏继续生成入口。

完成标准：

- 普通 Forum 帖子行为不变。
- 页面刷新/切换身份后 Story 状态和主楼映射一致。
- UI 不直接修改 StoryEvent；所有动作走 domain/service command。

## 8. MVP 任务与接口边界（规划）

以下是实现阶段建议的接口形状，不是本次代码：

```text
createForumStory(input, context)
  → ForumStory(draft)

generateStoryOpening(storyId, context)
  → { storyThread, forumThread, openingEvent, initialUpdate }

recordStoryUserReply(storyId, forumReplyId)
  → { observationEvent?, nextStatus }

generateStoryComment(storyId, context)
  → { forumReply, storyUpdate }

requestStoryUpdate(storyId, context)
  → { event, storyUpdate, forumReply, nextStatus }

completeForumStory(storyId, endingEventId, forumReplyId)
  → ForumStory(status="completed")
```

边界规则：

- `AppForum` 只调用 command，不拼接 Prompt、不直接改 Story 状态。
- `forumStoryGenerationService` 只返回候选或经过验证的领域结果，不直接绕过 repository。
- `forumStoryRepository` 不调用 AI，只负责 schema、身份、快照和提交。
- `ForumStoryPromptAdapter` 不访问 LocalStorage，不知道 React/UI，也不读取私密上下文。
- `ForumReply` 的创建仍通过现有 `forumData`/repository 规则，避免楼层和点赞逻辑分叉。

## 9. MVP 风险与取舍

| 风险/取舍 | MVP 处理 |
| --- | --- |
| 评论太少导致故事停滞 | 提供手动继续；没有评论时只生成基于已确认事件的保守更新，不凭空扩展 |
| 评论太多导致 AI 成本上升 | 只记录观察，按一次继续最多生成一条 NPC/楼主更新 |
| 定时连载不稳定 | `nextUpdateAt` 只做门槛；先不启用后台自动生成 |
| NPC 活人感有限 | 固定 persona/role/knowledge，优先一致性而不是复杂情绪 |
| AI 生成错误事件 | candidate/confirmed 分层，事件先写账本再发布楼层 |
| 旧 Forum 数据兼容 | `storyId` 可为空，旧帖子继续走原流程 |
| 多身份串数据 | 每个 repository API 必须显式接收 ownerIdentityId 并校验 |
| 故事结局提前出现 | endingCondition、event sequence、forbiddenFacts 和 completed 状态机共同拦截 |
| 用户误以为是真实角色记忆 | UI/分享文案需标注“论坛故事”；MVP 不做 Truth Layer 桥接 |

## 10. MVP 验收清单

### 数据与存储

- [ ] 五个 MVP 模型有独立 schema version 和 identity 隔离。
- [ ] StoryThread 能稳定映射到一个 ForumThread。
- [ ] Event/Update 有 evidence、sequence、stateVersion 和 idempotencyKey。
- [ ] 删除/归档策略不会留下可释放的幽灵任务。

### 生成与互动

- [ ] seed 可生成初始帖子，失败时保持 draft。
- [ ] 用户评论继续使用现有 ForumReply 和楼层规则。
- [ ] 每个用户回复最多对应一个 observation candidate。
- [ ] NPC 评论只使用 StoryCharacter 的 persona/role/knowledge。
- [ ] 楼主更新绑定 confirmed Event，不允许无证据推进。

### 状态与结局

- [ ] 状态只允许 draft/active/waiting_update/completed 的合法迁移。
- [ ] 继续故事不会重复确认同一事件。
- [ ] 结局由系统条件计算，AI 不能直接完成故事。
- [ ] 结局发布成功后才设置 completed，completed 后不再生成剧情。

### 安全边界

- [ ] Prompt 不读取 Memory、Relationship、Private Context、CharacterEvent、InnerVoice 或 OfflineStory 全文。
- [ ] StoryEvent 不写入用户 Memory、Character Memory、Relationship 事实。
- [ ] 分享只使用公开 Forum 快照，不泄露事件账本和 NPC knowledge。
- [ ] 同名角色不会自动与真实角色合并。

## 11. 结论

ForumStory MVP 的核心不是新 UI，而是建立一个很小但完整的闭环：

```text
Story seed
  → opening Event + ForumThread
  → ForumReply 评论
  → observation / NPC comment
  → 手动确认 Event
  → author-update
  → ending Event + ending Reply
  → completed
```

实现时应坚持“Story Domain 记录事实、Forum 负责展示、AI 只产候选、系统负责确认”的边界。先完成线性单故事和 story-only 隔离，再评估自动定时、复杂分支、跨应用公共事实桥接和长期 NPC 状态；这些都不属于本 MVP。
