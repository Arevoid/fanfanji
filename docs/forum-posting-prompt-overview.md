# Forum 发帖与 Prompt 总览（当前实现）

> 用途：集中说明普通公开 Forum、Forum 私信与 ForumStory 的发帖/回复逻辑、可用数据、Prompt 入口和维护边界。
>
> 本文描述当前代码行为，不改变业务逻辑。

## 1. 先区分三套系统

| 系统 | 用户看到的内容 | 主要入口 | 数据域 | 是否可以读取当前关系私密内容 |
| --- | --- | --- | --- | --- |
| **公开 Forum** | 帖子、楼层、楼主更新、活动 | `AppForum.tsx` | `phone_forum_*` | **不可以**。仅公开投影 |
| **Forum DM** | 用户与论坛账号私信 | `forumDmService.ts` | `phone_forum_dm_*` | 真实关系角色可按精确关系读取；虚拟用户不可以 |
| **ForumStory** | 独立的论坛体故事 | `src/features/forumStory/` | `phone_forum_story_*` | **不可以**。严格 `story scope` |

普通公开 Forum 不等于朋友圈，也不等于 Chat：它面向论坛中的任意读者，因此关系、私聊、Memory、OfflineStory 原文默认不能直接进入公开帖或公开评论。

---

## 2. 普通公开 Forum 的内容模型

核心类型位于 [src/types.ts](../src/types.ts)。

| 类型 | 关键字段 | 作用 |
| --- | --- | --- |
| `ForumThread` | `publicAuthor`、`title`、`body`、`source`、`storyArc`、`ownerIdentityId` | 一篇帖子；主楼视为第 1 楼 |
| `ForumReply` | `threadId`、`floor`、`kind`、`replyToFloor`、`quotedText` | 楼层回复或 `author-update` 楼主更新；已删除楼层保留 tombstone，不重新编号 |
| `ForumPublicAuthor` | `displayName`、`avatar`、`kind`、`isAnonymous` | 页面可见作者快照。类型包括用户、匿名用户、关系角色、匿名角色、虚拟账号 |
| `ForumActorRef` | `relationship` / `virtual` | 内部路由身份；绝不能放进公开 Prompt 或分享快照 |
| `ForumActorState` | 最近回复、冷却时间、小时内发言时间 | 防止同一 NPC 连续刷屏或重复回复 |
| `ForumPendingActivityEvent` | `kind`、`actorSlotSnapshot`、`replyTarget`、`scheduledAt` | AI 规划后、尚未发布的论坛活动 |
| `ForumActivityTask` | `trigger`、`status`、`pendingEvents` | 活动生成任务和失败/重试状态 |
| `ForumUserProfile` | `ownerIdentityId`、`displayName`、`avatar` | 当前机主在普通 Forum 的可变资料；帖子/回复以 `authorUserId` 关联，展示时可解析最新资料 |

本地持久化的主键在 [src/core/storage/storageKeys.ts](../src/core/storage/storageKeys.ts)：

- `phone_forum_threads`、`phone_forum_replies`
- `phone_forum_generation_tasks`、`phone_forum_activity_tasks`、`phone_forum_actor_states`
- `phone_forum_profiles`、访问/点赞/通知数据
- `phone_forum_dm_conversations`、`phone_forum_dm_messages`、`phone_forum_dm_tasks`

读写和恢复校验集中在 [src/core/storage/repositories/forumRepository.ts](../src/core/storage/repositories/forumRepository.ts)。所有普通 Forum 记录都必须带 `ownerIdentityId`，因此不同机主身份的论坛列表互相隔离。

---

## 3. 普通 Forum 的业务流程

### 3.1 用户自行发帖

```text
用户填写标题、正文、匿名状态
  → AppForum 本地创建 ForumThread（source=user / user-anonymous）
  → ForumRepository 持久化
  → scheduleInitialForumReplies
  → planForumActivity 生成待发布回复
  → 按 scheduledAt 释放为 ForumReply
  → UI 刷新楼层、通知、回复数
```

- 用户的发帖和用户自己的回复是确定性本地写入，**不调用 AI**。
- 初始互动不是立即硬塞一批回复，而是生成 `pending` 活动后按延迟释放。

### 3.2 AI 自动发帖 / 刷新论坛

```text
AppForum 懒加载或用户刷新
  → generateForumThreads
  → 选关系角色或虚拟论坛账号
  → buildThreadPrompt
  → PublicForumPostPromptAdapter（如有 public context）
  → apiChat（history=[]）
  → JSON 解析、公开性校验、去重
  → ForumThread + 可选初始 ForumReply
  → ForumRepository
```

发帖者来源由 `forumPostAuthorPolicy.ts` 决定：

1. **关系角色**：真实联系人在论坛中的公开表达；可实名或匿名。
2. **虚拟论坛账号**：来自 `forumVirtualProfiles.ts`，只拥有虚拟公开风格。

关系角色的帖子保存内部 `privateAuthorRelationId` / `privateAuthorCharacterId`，用于后续精确路由；页面和 Prompt 只使用 `publicAuthor`。

### 3.3 AI 评论、楼中楼、楼主更新

```text
用户发帖、手动刷新某帖、或自动活动检查
  → planForumActivity 或 generateThreadActivity
  → 读取当前公开主楼、公开楼层、可用 actor slots
  → PublicForumReplyPromptAdapter / PublicForumActivityPromptAdapter
  → apiChat 生成 1–4 个候选活动
  → 校验 actor、目标楼层、相关性、重复、公开安全
  → pending event
  → releaseForumPendingEvents
  → ForumReply（reply 或 author-update）
```

- `replyToFloor` 只能引用现有楼层；不存在的楼层会被拒绝。
- `author-update` 是一条特殊 `ForumReply`，不是重写主帖正文。
- `storyArc` 仅是**普通 Forum 帖子的轻量公开连载元数据**，用于判断是否可安排楼主后续；它不等于 ForumStory。
- `ForumActorState` 保存每个 actor 最近的回复和冷却，限制重复话题与短时间连发。

### 3.4 自动活动

`useForumActivityEngine.ts` 触发 `forumActivityRuntime.ts`：

```text
定期检查 / 用户互动 / 手动刷新
  → 读取 ownerIdentityId 下的帖子、回复、任务、actor state
  → 频率与冷却判断
  → planForumActivity（一次 AI 规划）
  → pending events
  → 到期 releaseForumPendingEvents
```

活动规划是“先计划、后发布”。规划服务不直接写帖子；释放阶段才把合格事件落为 `ForumReply`。

### 3.5 Forum DM

```text
用户发送 Forum DM
  → Forum DM conversation/message 本地写入
  → requestForumDmReply
  → 真实关系角色：精确解析 relation → CharacterCognitiveContext → ForumDirectMessagePromptAdapter
  → 虚拟账号：仅论坛公开身份与 DM 上下文
  → AI 回复 → ForumDmMessage
```

Forum DM 是私信，不要把它和公开帖的 Prompt 混用。

---

## 4. 普通 Forum 的 Prompt 清单

| 生成动作 | 主要代码 | Prompt 输入 | 输出合同 |
| --- | --- | --- | --- |
| AI 新帖 | `forumGenerationService.buildThreadPrompt` | 话题池、角色公开投影或虚拟账号风格、公开历史去重提示 | 单一 JSON：`title`、`body`、`anonymous`、可选初始 `replies` |
| AI 回复 | `buildReplyPrompt` / `generateThreadActivity` | 主楼、最近公开楼层、回复目标、公开作者风格 | JSON 回复候选；可包含 `replyToFloor` |
| AI 楼主更新 | `generateThreadActivity` / `planForumActivity` | 当前公开故事线、已公开回复、楼主 actor | `author-update` 活动或回复 |
| 活动规划 | `forumActivityService.planForumActivity` | 公开帖子快照、公开楼层、actor slots、冷却状态 | `events[]`，每项有 actor、类型、正文、目标和延迟 |
| Forum DM | `forumDmService` | 对话、原始公开帖；关系角色另有精确私域认知投影 | 一条私信回复 |

### 4.1 公开 Prompt 的统一底线

`FORUM_PUBLIC_TEXT_RULES` 和各类 validator 共同要求：

- 只输出论坛纯文本；不输出动作旁白、内心独白、聊天时间标记、伪媒体、Markdown 图片或操作指令。
- 不暴露 `relationId`、`characterId`、`threadId`、`replyId` 等内部 ID。
- 不泄露未出现在公开主楼/公开楼层中的私人姓名、昵称、关系细节或可识别信息。
- 回应必须与主楼或指定楼层相关；无关私人故事会被丢弃。
- 解析、公开性检查或相关性检查失败时最多修正重试一次；仍失败则不写入。

### 4.2 Public Forum Cognitive Context

当前公开角色生成应通过以下 Adapter：

- [publicForumPostPromptAdapter.ts](../src/features/characterCognitive/promptAdapters/publicForumPostPromptAdapter.ts)
- [publicForumReplyPromptAdapter.ts](../src/features/characterCognitive/promptAdapters/publicForumReplyPromptAdapter.ts)
- [publicForumActivityPromptAdapter.ts](../src/features/characterCognitive/promptAdapters/publicForumActivityPromptAdapter.ts)

可进入公开 Prompt：

- 角色的公开 persona（姓名/公开人设/背景投影）。
- 显式标记为公开的 CharacterEvent。
- 显式标记为公开的 WorldBook 设置。
- 当前公开帖子、公开回复、公开历史与时间。
- 公共行为约束和重复提示。

绝对不能进入公开 Prompt：

- 私聊原文、Forum DM 原文、InnerVoice。
- 当前关系的 Memory、压缩关系摘要、私密 RelationshipState。
- OfflineStory 原文、导演模式、IF、未确认或 AI 推测事件。
- 其他机主身份、其他关系、其他角色的数据。

`safe` 不等于 `public`：即使一个事实已可供当前私聊角色认知使用，也必须有明确的公开授权/公开分类后才能进入 Forum。

### 4.3 当前兼容路径与维护提醒

`ForumRelationContext` 仍保留 `promptContext` 兼容字段。当前 `buildForumRelationGenerationContext` 已把关系摘要、聊天和 Memory 置空，只从公开可见 WorldBook 构造脱敏话题/风格。新代码应优先传入 `publicCognitiveContext` 并使用 Public Forum Adapter，不应继续扩展字符串 `promptContext`。

---

## 5. ForumStory：独立的论坛体故事系统

ForumStory 是独立 `story scope`，不能和普通 Forum 混写。

| 能力 | 主要对象 | 关键规则 |
| --- | --- | --- |
| 初始故事帖 | `ForumStory`、`StoryThread` | 由 `ForumStoryGenerationService` 创建；不是普通 `ForumThread` |
| 故事 NPC | `StoryCharacter` | 独立持久化；不是现实 `Character` |
| 吃瓜网友 | `StoryForumUser` | 独立匿名身份池；不是现实 User |
| 楼层 | `StoryReply` | 独立 `floorNumber`、`parentReplyId`、引用内容 |
| 连载 | `StoryUpdate`、`StoryEvent` | append-only event timeline，sequence/version 单调递增 |
| 自动推进 | Progression Policy/Executor/Runner/Scheduler Service | 决策、执行、日志分层，仍不可读取私域数据 |

ForumStory 的 Prompt Adapter 位于：

- `forumStoryPromptAdapter.ts`
- `forumStoryCommentPromptAdapter.ts`
- `forumStoryUpdatePromptAdapter.ts`

它们只允许故事主题、StoryThread、StoryCharacter、已发生 StoryEvent、故事内评论摘要和必要的 story 世界背景；禁止读取 Memory、Relationship、真实 Character、私聊、InnerVoice、OfflineStory 和用户私密数据。

---

## 6. 常见需求该改哪里

| 需求 | 首选修改点 | 不应修改点 |
| --- | --- | --- |
| 帖子更像真实论坛、更多话题/文风 | `buildThreadPrompt`、话题池、虚拟账号 `publicStyle`、去重策略 | Chat/Memory Prompt |
| 评论能追楼、讨论、争论 | `buildReplyPrompt`、`planForumActivity`、actor slots、冷却与回复目标 | 直接让评论读私聊 |
| 楼主能持续更新 | `storyArc`、`canScheduleStoryContinuation`、author-update Prompt | 把更新写回关系 Memory |
| 角色公开发帖更贴人设 | PublicForum Post/Reply/Activity Adapter，公开 persona 与公开世界书 | relation-private Memory / OfflineStory |
| 增加论坛 NPC 活人感 | `ForumVirtualProfile`、actor state、活动节奏 | 创建真实 Character / Relationship |
| 扩展论坛体故事 | `src/features/forumStory/` | 普通 `ForumThread` 存储或现实角色系统 |
| 调整用户资料展示 | `ForumUserProfile` + `authorUserId` resolver | `StoryForumUser` |

---

## 7. 最小验收清单

改动公开 Forum 前至少验证：

1. 不同 `ownerIdentityId` 的帖子、回复、点赞、通知、DM 不互见。
2. 关系角色只能使用自己的公开 persona / 公开候选，不能把私聊、关系摘要或线下剧情公开化。
3. 虚拟账号不会创建现实 Character、Relationship、Memory 或 CharacterEvent。
4. 回复 floor 单调递增；删除后不重排；引用不存在楼层被拒绝。
5. 活动任务失败不会写入半成品回复；pending 事件到期前不展示。
6. Story scope 与普通 Forum storage 完全分离。
7. 生成内容通过公开性、相关性、去重和时间线校验。

## 8. 关联文档

- [Forum 当前架构分析](./forum-architecture-analysis.md)
- [公开 Forum 认知上下文设计](./public-forum-cognitive-context-design.md)
- [ForumStory 系统设计](./forum-story-system-design.md)
- [ForumStory MVP 规划](./forum-story-mvp-plan.md)
- [ForumStory MVP 审计](./forum-story-mvp-audit.md)
