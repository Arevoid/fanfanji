# Forum 模块完整架构分析

> 审计范围：当前工作区 `fanfanji` 的 Forum 相关实现。  
> 审计日期：2026-08-06。  
> 本次仅新增本报告，不修改任何源码、配置或现有数据。

## 0. 结论摘要

当前 Forum 是“小手机”中的本地化公共社交层：用户在一个按身份隔离的论坛空间里浏览帖子、发帖、回复、点赞、分享和私信；AI 负责生成虚拟论坛用户、关系角色的公开发帖/回复，以及延迟释放的论坛活动。

架构的关键特征：

- 公开内容的主模型是 `ForumThread` + `ForumReply`，没有独立的 Comment 表；评论、楼中楼、楼主更新都落在 `ForumReply` 上。
- 所有 Forum 数据以 `ownerIdentityId` 隔离，使用 LocalStorage 持久化；没有服务端论坛数据库或跨设备实时同步层。
- AI 生成分为“帖子生成”“回复/楼主更新生成”“批量活动计划”“Forum 私信回复”“翻译”五类链路。
- 自动活动不是每次到期都重新调用 AI：AI 先返回批量事件，系统将事件写入 `ForumActivityTask.pendingEvents`，再由运行时按 `scheduledAt` 释放。
- 公开 Forum 使用 `PublicForumCognitiveContext` 及 Post/Reply/Activity Adapter；它不应直接接收 Chat Memory、私聊原文、InnerVoice 或 OfflineStory 全文。
- Forum DM 是独立的私信边界，使用独立 DM 历史，并对关系角色附加经过安全投影的认知上下文；当前明确不读取 Memory 原文。
- 已有一个有限的 `ForumStoryArc`，只对 AI/虚拟帖子按主题关键词推断连载类别；它不是完整的事件账本、因果图或 NPC 长期状态系统。

因此，当前实现适合作为“公共帖子 + NPC 互动模拟”的基础，但还不是完整的“论坛体故事 / NPC 事件论坛”：缺少显式故事事件、角色状态迁移、剧情分支、事件可见性级别、语义去重、跨页面/离线调度持久化等能力。

## 一、模块定位

### 1.1 产品定位

Forum 解决的是公开社交和旁观式叙事需求：

1. 给用户一个与 Chat 不同的公共空间，允许用户看到虚拟网友、AI 角色和其他公开身份围绕主题发言。
2. 把角色的公开表达与私聊人格区分开，角色可以以实名或匿名方式参与公共讨论。
3. 通过帖子、楼层、通知、私信和分享，把公共内容连接回 Chat，但不把公共内容自动当成关系事实或记忆。
4. 为后续“论坛体故事”提供现成的帖子、楼层、作者、时间、活动队列和连载元数据。

### 1.2 与其他应用的关系

| 应用 | 当前关系 | 数据是否自动互写 | 说明 |
| --- | --- | --- | --- |
| Chat | Forum 分享可以生成一条带 `forumShareId` 的 Chat `Message`；用户也可以从帖子/回复打开 Forum DM | 分享会写入 Chat 消息和 ForumShare；普通发帖/回复不会写 Chat | 共享的是公开快照，不是 Chat 全部上下文 |
| Moment | 没有直接调用链 | 否 | Moment 有自己的帖子/评论/生成任务；Forum 不读取 Moment 原文 |
| Diary | 没有直接调用链 | 否 | Diary 不作为 Forum 记忆或公开内容源 |
| OfflineStory | 公开 Forum 不读取线下剧情全文；Forum DM 的关系认知上下文只可能接收被标记为 safe 的 `offline_story_completed` CharacterEvent 摘要 | 否 | Forum 不把论坛活动写入 OfflineStory 或线下剧情 |
| Memory | 公开生成函数虽然接收 `memories` 参数，但公开投影明确传入空 Memory；DM 构建 CognitiveContext 时也使用 `memories: []` | 否 | 当前 Forum 不写角色 Memory |
| WorldBook | 公共生成会筛选 public 场景可见的 WorldBook；显式公开 WorldBook 候选通过 PublicContext 进入 Prompt | 否 | 需要继续保持 public visibility 边界 |
| Character/Relationship | 用于选择关系角色、公开 persona、DM actor 校验及关系安全上下文 | 不写关系状态 | `ownerIdentityId + relationId + characterId` 是主要隔离条件 |

### 1.3 当前支持的用户行为

- 浏览当前身份的帖子列表，并按 `lastActivityAt` 排序。
- 创建实名帖子或匿名帖子。
- 打开帖子详情、分页查看楼层。
- 发布实名/匿名回复。
- 回复指定楼层，保存引用楼层、作者和引用文本。
- 点赞/取消点赞帖子或回复。
- 删除自己的帖子；删除自己的回复采用 tombstone，不重新编号楼层。
- 手动刷新帖子活动。
- 新建帖子后等待 NPC 初始回复。
- 从帖子或回复打开私信（仅对可解析的公开 AI/虚拟作者开放）。
- 分享帖子到某个关系角色的 Chat，会生成冻结的公开快照。
- 阅读历史、点赞历史、通知、论坛个人资料。
- 对当前公开帖子/回复请求翻译，结果写入独立翻译缓存。
- 通过应用级活动引擎接收延迟释放的 NPC 回复和楼主更新。

当前没有“编辑用户帖子”业务流程；“楼主更新”是 AI 生成的 `ForumReply(kind="author-update")`，不是修改 `ForumThread.body`。

## 二、代码结构

### 2.1 入口与总体目录

```text
src/
├─ App.tsx                                  # 应用路由、全局 Forum 活动引擎、角色删除清理
├─ components/
│  └─ AppForum.tsx                           # Forum 页面、交互编排、状态订阅
├─ types.ts                                  # Forum 全部持久化/运行时类型
├─ core/storage/
│  ├─ storageKeys.ts                         # LocalStorage key
│  └─ repositories/
│     ├─ forumRepository.ts                  # Forum 主数据仓库、校验、快照、原子提交
│     └─ forumTranslationRepository.ts       # 翻译缓存仓库
├─ domain/forum/
│  ├─ forumData.ts                            # Thread/Reply 创建、列表、点赞、删除、指标
│  ├─ forumValidation.ts                      # AI JSON 解析、候选结构和时间线校验
│  ├─ forumContentSafety.ts                   # 公开文本清洗、私密姓名/内容、相关性校验
│  ├─ forumGenerationGuard.ts                 # 生成任务幂等、概率、冷却、失败重试
│  ├─ forumActivity...                        # 见 features/forum/services/forumActivity*
│  ├─ forumPostAuthorPolicy.ts                # NPC/关系作者权重及发帖冷却
│  ├─ forumVirtualProfiles.ts                 # 固定虚拟论坛账号和头像种子
│  ├─ forumStoryArc.ts                        # 主题推断和有限连载状态
│  ├─ forumDmData.ts                          # Forum DM 会话/消息/参与者解析
│  ├─ forumShare.ts                            # 分享目标和公开快照
│  ├─ forumProfileData.ts                     # 资料、浏览史、点赞史、通知
│  ├─ forumCapacity.ts                         # 容量上限、压缩和过期清理
│  └─ forumCleanup.ts                          # 按身份清理 Forum 数据
├─ domain/prompt/
│  ├─ forumContext.ts                         # Chat 中使用 Forum 分享上下文
│  └─ forumDmPrompt.ts                        # Forum DM 基础 Prompt
├─ domain/publicCognitive/
│  ├─ publicContextBuilder.ts                 # PublicForumCognitiveContext 构建
│  ├─ publicVisibilityPolicy.ts               # CharacterEvent/WorldBook public 筛选
│  └─ publicForumCognitiveTypes.ts            # 公开认知类型
├─ features/forum/
│  ├─ components/
│  │  ├─ ForumAvatar.tsx
│  │  ├─ ForumThreadCard.tsx
│  │  ├─ ForumSnapshotDetail.tsx
│  │  ├─ ForumShareCard.tsx
│  │  ├─ ForumDmList.tsx
│  │  └─ ForumDmConversation.tsx
│  ├─ hooks/useForumActivityEngine.ts         # 周期性活动检查
│  └─ services/
│     ├─ forumGenerationService.ts            # 帖子/回复/楼主更新 AI 生成
│     ├─ forumActivityService.ts              # 批量活动 Prompt、计划、释放、限流
│     ├─ forumActivityRuntime.ts              # 活动队列持久化和运行时调度
│     ├─ forumDmService.ts                    # Forum DM AI 回复
│     ├─ forumShareService.ts                 # 分享操作消息构建
│     └─ forumTranslationService.ts           # 公开内容翻译和缓存
└─ features/characterCognitive/
   └─ promptAdapters/
      ├─ publicForumPostPromptAdapter.ts
      ├─ publicForumReplyPromptAdapter.ts
      ├─ publicForumActivityPromptAdapter.ts
      └─ forumDirectMessagePromptAdapter.ts
```

### 2.2 文件职责、输入、输出、调用方

#### 页面与组件

| 文件 | 作用 | 输入 | 输出/副作用 | 主要调用方 |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | 把 Forum 挂载到应用路由；向 `AppForum` 传角色、关系、消息、Memory、WorldBook、设置；在应用级运行 `useForumActivityEngine` | 全局 React 状态、当前身份 | 渲染 Forum；角色删除时清理 Forum 关系数据 | 应用根组件 |
| `src/components/AppForum.tsx` | Forum 主页面和全部用户交互编排 | `activeIdentity`、characters、relationships、messages、memories、worldBookEntries、settings、Chat 回调 | 调用 domain/service；提交仓库；展示列表、详情、DM、通知、翻译 | `App.tsx` |
| `ForumAvatar.tsx` | 根据公开作者显示真实/匿名/虚拟头像 | `ForumPublicAuthor` | React 头像节点 | `AppForum`、Thread/DM 组件 |
| `ForumThreadCard.tsx` | 首页帖子卡片 | `ForumThread`、指标、点赞状态、打开/点赞回调 | 帖子摘要 UI | `AppForum` |
| `ForumSnapshotDetail.tsx` | 展示分享出去的只读快照 | `ForumThreadPublicSnapshot` | 只读公开内容 UI | `AppForum` |
| `ForumShareCard.tsx` | Forum 分享消息/卡片展示 | 分享快照 | 分享卡片 UI | Chat 或 Forum 相关展示 |
| `ForumDmList.tsx` | DM 会话列表 | `ForumDmConversation[]`、消息 | 会话列表 UI | `AppForum` |
| `ForumDmConversation.tsx` | DM 消息详情和输入框 | 会话、消息、发送状态、回调 | DM UI | `AppForum` |

#### Domain 与存储

| 文件 | 作用 | 输入/输出 | 主要调用方 |
| --- | --- | --- | --- |
| `forumData.ts` | Thread/Reply 本地确定性业务规则 | 身份、Thread、Reply 集合；输出新集合和指标 | `AppForum`、runtime、测试 |
| `forumValidation.ts` | 解析 AI 返回 JSON；限制候选文本、楼层引用和生成时间线 | AI 文本/候选；输出结构化候选或异常 | `forumGenerationService`、`forumActivityService` |
| `forumContentSafety.ts` | 清洗角色扮演旁白、媒体标记、内部 ID、私密姓名；检查公开相关性；修复存量数据 | Thread/Reply/角色保护名 | 生成服务、仓库安全加载、备份恢复 |
| `forumGenerationGuard.ts` | 生成任务 key、in-flight 锁、冷却、概率和失败重试 | `ForumGenerationTask[]`、时间、触发器 | `AppForum` 的刷新/懒加载/点赞活动 |
| `forumPostAuthorPolicy.ts` | 决定帖子作者是虚拟账号还是关系角色；限制关系角色发帖频率 | 最近自动帖子、关系 ID、随机数 | `generateForumThreads` |
| `forumVirtualProfiles.ts` | 固定虚拟账号、公开风格和稳定头像 | thread/批次 seed、索引 | 帖子/回复/活动/DM actor 解析 |
| `forumStoryArc.ts` | 对 AI/虚拟帖子按标题正文推断故事类别；更新 episode/status/recap | Thread、author-update Reply、当前时间 | AI 帖子创建、活动释放 |
| `forumDmData.ts` | 公开作者到内部 actor 的安全解析；会话、消息、删除 | 公共 Thread/Reply、关系/角色、DM 集合 | `AppForum`、`forumDmService` |
| `forumShare.ts` | 关系分享目标、公开快照、幂等和角色删除清理 | Thread/Reply/关系 | `forumShareService`、`App.tsx`、`AppForum` |
| `forumProfileData.ts` | Profile、访问记录、点赞快照、通知 | 公开 Thread/Reply 和身份 | `AppForum`、仓库 |
| `forumCapacity.ts` | 历史/点赞/通知/DM/任务容量及 30 天任务清理 | Forum State | 压缩、容量测试、仓库工具 |
| `forumCleanup.ts` | 清理某身份的 Thread/Reply/Share/GenerationTask | Forum 集合、身份 | 清理流程 |
| `forumRepository.ts` | LocalStorage 读写、类型验证、identity snapshot、订阅、原子提交 | ForumStateMutation | 所有 Forum 业务入口 |
| `forumTranslationRepository.ts` | 翻译缓存读写、hash、30 天/500 条裁剪 | Translation key/entry | `forumTranslationService`、`AppForum` |
| `storageKeys.ts` | 维护 `phone_forum_*` 和 `phone_forum_translations` key | 无 | 仓库层 |

#### AI 与运行时服务

| 文件 | 作用 | 输入 | 输出 |
| --- | --- | --- | --- |
| `forumGenerationService.ts` | 所有主要帖子/回复/楼主更新生成；负责 AI 调用、候选验证和实体组装 | `UserSettings`、关系、角色、公开上下文、Thread/Reply | `ForumGenerationBundle` 或 `ForumThreadActivityResult` |
| `forumActivityService.ts` | 生成 1–4 条公开活动候选事件；按 actor/楼层/相关性/安全规则校验；释放事件为 Reply | Thread、Reply、ActorState、公开角色槽位、settings | `ForumPendingActivityEvent[]`、新 Reply、更新 ActorState |
| `forumActivityRuntime.ts` | 创建活动 Task、把首条事件提前到 now、释放到仓库；自动检查和失败回退 | 运行时 context、Thread ID、时间 | `ForumReply[]`、持久化 ActivityTask |
| `forumDmService.ts` | DM 任务幂等、关系校验、CognitiveContext 投影、AI 回复、通知 | DM 会话/历史、关系、角色、设置 | participant DM Message、更新 Task/Conversation、Notification |
| `forumShareService.ts` | 生成 `ForumShare` 和带 `forumShareId` 的 Chat Message | Thread、Reply、目标关系 | `{share, message}` |
| `forumTranslationService.ts` | 公开标题/正文/回复翻译；代理翻译调用；缓存复用 | 公开文本、语言、settings | `ForumTranslation` |
| `useForumActivityEngine.ts` | 文档可见时立即检查并每 30 秒检查一次；防止并发 tick | `ForumActivityRuntimeContext` | 运行 `runAutomaticForumActivityCheck` |

## 三、数据模型

说明：下表中的“进入 Prompt”指是否作为 AI 的直接或投影输入，不等于是否参与 UI 逻辑。“影响故事状态”指是否影响 `storyArc`、活动调度、楼层顺序或未来生成选择。

### 3.1 Post / Thread：`ForumThread`

| 字段 | 类型 | 持久化 | 进入 AI Prompt | 故事/业务作用 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 是 | 否，内部校验/计划引用 | Thread 主键；活动、分享、DM 来源引用 |
| `ownerIdentityId` | `string` | 是 | 作为 scope 校验，不应输出 | 身份隔离主键 |
| `publicAuthor` | `ForumPublicAuthor` | 是 | 是公开作者名/头像/类型 | 决定公开身份和 DM 可解析性 |
| `privateAuthorRelationId` | `string?` | 是 | 否 | 仅把匿名/实名 AI 帖子映射回关系角色 |
| `privateAuthorCharacterId` | `string?` | 是 | 否 | 私有角色二次校验 |
| `title` | `string` | 是 | 是 | 公开主题、相关性验证、去重 |
| `body` | `string` | 是 | 是 | 公开正文和后续回复上下文 |
| `source` | `user` / `user-anonymous` / `ai-character` / `ai-character-anonymous` / `ai-virtual` / `virtual` | 是 | 间接决定作者能力 | 区分用户、关系 NPC、匿名 NPC、虚拟账号 |
| `occurredAt` | `number` | 是 | 是时间线输入 | 帖子发生时间；显示/排序基础 |
| `baseLikeCount` | `number` | 是 | 否 | AI/虚拟帖子生成稳定的基线点赞 |
| `likedByIdentityIds` | `string[]` | 是 | 否 | 当前身份点赞状态和计数 |
| `replyCount` | `number` | 是 | 否或摘要使用 | UI 计数；由追加/活动释放维护 |
| `createdAt` | `number` | 是 | 间接用于调度 | 持久化创建时间 |
| `updatedAt` | `number` | 是 | 间接用于排序 | 数据最后更新；不等同于公开活动时间 |
| `lastActivityAt` | `number?` | 是/可归一化 | 间接用于排序 | 由 live reply 计算；点赞/访问不应推进它 |
| `storyArc` | `ForumStoryArc?` | 是 | 当前可作为活动继续条件，通常不直接输出 | AI/虚拟主题的有限连载状态 |

### 3.2 Comment / Reply：`ForumReply`

Forum 没有独立 `Comment` 类型；所有评论、楼中楼、楼主更新都是 Reply。

| 字段 | 类型 | 持久化 | 进入 AI Prompt | 故事/业务作用 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 是 | 只作为内部引用，不输出 | Reply 主键、引用目标 |
| `threadId` | `string` | 是 | 内部确定上下文 | 所属 Thread |
| `ownerIdentityId` | `string` | 是 | scope 校验 | 身份隔离 |
| `floor` | `integer` | 是 | 是公开楼层 | 从 2 开始，永不重排；引用和分支基础 |
| `kind` | `reply` / `author-update` | 是/旧数据可缺省 | 是标记楼主更新 | `author-update` 可推进 storyArc |
| `publicAuthor` | `ForumPublicAuthor` | 是 | 是 | 公开作者 |
| `body` | `string` | 是 | 是 | 公开回复正文 |
| `replyToReplyId` | `string?` | 是 | 不应直接输出 ID | 指向具体回复 |
| `replyToFloor` | `number?` | 是 | 以公开楼层形式进入 | 楼中楼关系 |
| `replyToAuthorName` | `string?` | 是 | 可作为公开引用名 | UI 展示引用 |
| `quotedText` | `string?` | 是 | 可进入公开上下文 | 冻结的短引用；删除后显示 tombstone 文本 |
| `source` | `user` / `user-anonymous` / `ai-character` / `ai-character-anonymous` / `ai-virtual` | 是 | 间接决定作者风格 | 用户/关系 NPC/虚拟 NPC |
| `occurredAt` | `number` | 是 | 是 | 活动发生时间 |
| `baseLikeCount` | `number` | 是 | 否 | Reply 基线点赞，当前通常为 0 |
| `likedByIdentityIds` | `string[]` | 是 | 否 | 回复点赞 |
| `createdAt` | `number` | 是 | 间接 | 写入时间 |
| `updatedAt` | `number` | 是 | 间接 | 删除/点赞等更新时间 |
| `isDeleted` | `boolean?` | 是 | 删除回复不应作为有效公开内容 | tombstone 保留楼层和引用 |
| `deletedAt` | `number?` | 是 | 否 | 删除时间 |
| `privateActor` | `ForumActorRef?` | 是（本地调度数据） | 否 | 活动释放/DM/清理使用；不进入公开快照 |

### 3.3 作者、NPC 和 Actor

#### `ForumPublicAuthor`

| 字段 | 类型 | 作用 | 持久化/Prompt/故事 |
| --- | --- | --- |
| `displayName` | `string` | 公开显示名称 | 持久化；进入公开 Prompt；不是安全的关系 ID |
| `avatar?` | `string` | 头像 URL/资源 | 持久化；UI 使用，通常不进入 Prompt |
| `kind` | `user` / `anonymous-user` / `ai-character` / `anonymous-ai` / `virtual` | 公开作者类别 | 持久化；决定作者徽标、DM 可用性和生成来源 |
| `isAnonymous` | `boolean` | 是否隐藏真实公开姓名 | 持久化；进入公开作者投影；影响隐私校验 |

#### `ForumActorRef`

```ts
{ kind: "relationship", relationId, characterId }
| { kind: "virtual", virtualProfileId }
```

这是内部 actor 引用，不得复制到公开 Thread/Reply DTO、分享快照或 Prompt。关系 actor 必须再次校验 `ownerIdentityId + relationId + characterId`；虚拟 actor 通过固定 `FORUM_VIRTUAL_PROFILES` 解析。

#### `ForumActorState`

| 字段 | 类型 | 作用 |
| --- | --- | --- |
| `ownerIdentityId` / `threadId` | `string` | 状态隔离范围 |
| `actorKey` / `actor` | `string` / `ForumActorRef` | actor 唯一键与内部映射 |
| `lastReplyAt?` | `number` | 最近一次回复 |
| `recentReplyIds` | `string[]` | 最近公开回复，用于连续性和去重提示 |
| `recentTopicFingerprints` | `string[]` | 最近主题片段，降低重复 |
| `hourlyReplyTimestamps` | `number[]` | 频率控制 |
| `cooldownUntil?` | `number` | actor 冷却截止时间 |
| `updatedAt` | `number` | 状态更新时间 |

它持久化，但属于活动内部状态，不进入公开 Prompt；当前仅把其对应的公开回复文本用于有限连续性提示。

### 3.4 活动、任务和事件

#### `ForumPendingActivityEvent`

`id`、`ownerIdentityId`、`threadId`、`batchId`、`localId` 是内部引用；`actorSlotSnapshot` 是公开作者槽位 + 内部 actor；`privateActor` 是内部 actor；`kind` 是普通回复或楼主更新；`body` 是已验证文本；`replyTarget` 是主楼、楼层或同批次事件；`scheduledAt` 控制释放；`status` 为 pending/released/skipped；`resolvedReplyId`/`resolvedFloor` 回填释放结果；`createdAt`/`updatedAt` 记录任务时间。

它持久化但不直接进入 AI；AI 只生成候选事件，运行时将事件转换为 Reply。

#### `ForumActivityTask`

| 字段 | 说明 |
| --- | --- |
| `id`, `ownerIdentityId`, `threadId` | 任务主键和作用域 |
| `trigger` | `automatic`、`manual-thread-refresh`、`initial-replies`、`like-engagement`、`user-interaction` |
| `status` | running/succeeded/failed/blocked |
| `startedAt`, `completedAt?`, `retryAfter?`, `createdAt`, `updatedAt` | 调度、重试和清理 |
| `pendingEvents` | 批量事件队列 |

#### `ForumGenerationTask`

这是较早的 UI 生成任务 guard，与 `ForumActivityTask` 分开。它的触发器是 `refresh`、`initial-replies`、`lazy`、`like-engagement`、`manual-thread-refresh`，主要用于防止首页刷新、懒加载、点赞或手动刷新重复调用。

### 3.5 论坛用户和衍生记录

| 类型 | 核心字段 | 持久化 | Prompt/故事用途 |
| --- | --- | --- | --- |
| `ForumUserProfile` | `ownerIdentityId`, `displayName`, `avatar`, `bio`, created/updated | 是 | UI 公开身份；用户发帖/回复作者；不作为角色认知 |
| `ForumVisitHistory` | identity、thread、访问次数/时间、`publicSnapshot` | 是 | 历史和未读楼主更新；不进入 AI |
| `ForumLikeHistoryRecord` | target type、thread/reply、点赞时间、公开快照 | 是 | “我的点赞”；不进入 AI |
| `ForumNotification` | eventKey、类型、actor public snapshot、thread/reply、preview、readAt、conversationId | 是 | 通知 UI；不进入 AI |
| `ForumThreadPublicSnapshot` | 公开 Thread + Reply 投影 | 是（分享/历史） | Chat 分享和只读展示；明确省略私有 actor 映射 |
| `ForumShare` | owner、thread、target relation/conversation、source message、publicSnapshot | 是 | 把论坛内容带入 Chat 的唯一公开桥接 |
| `ForumTranslation` | content hash、语言、翻译标题/正文、访问时间 | 是独立缓存 | 只服务显示，不影响故事状态或角色记忆 |

### 3.6 Forum DM 模型

#### `ForumDmConversation`

`id`、`ownerIdentityId`、`participant`、`participantPublicSnapshot`、`originThreadId?`、`originReplyId?`、`lastMessageAt`、`unreadCount`、`createdAt`、`updatedAt`、`revision?`。`revision` 防止删除/重建会话后晚到 AI 回复复活旧会话。

#### `ForumDmMessage`

`id`、`conversationId`、`ownerIdentityId`、`sender: user | participant`、`body`、`occurredAt`、`createdAt`。DM 历史最多保留每会话约 500 条。

#### `ForumDmTask`

`id`、`taskKey`、`ownerIdentityId`、`conversationId`、`status`、时间字段和 `conversationRevision?`。用于 DM AI 回复的幂等和并发保护。

## 四、完整业务流程

### 4.1 创建用户帖子

```text
用户填写标题/正文/匿名开关
        │
        ▼
AppForum.handleCreateThread
        │
        ├─ createForumThread (本地确定性构造)
        ├─ commitForumMutation({ threads })
        └─ scheduleInitialForumReplies(thread.id)
              │
              ├─ planForumActivity(trigger="initial-replies")
              │     ├─ buildForumActivityActorSlots
              │     ├─ public-only activity Prompt
              │     ├─ apiChat
              │     └─ parse/validate → PendingActivityEvent[]
              ├─ 创建 ForumActivityTask
              ├─ 首个事件 scheduledAt 提前到 now
              └─ releaseDueForumActivity
                    ├─ 事件 → ForumReply
                    ├─ 更新 Thread 指标/ActorState
                    ├─ 写入 LocalStorage
                    └─ mutation listener 创建通知、useSyncExternalStore 刷新 UI
```

帖子主体不是 AI 生成；AI 只负责后续公开互动。现有 `generateInitialRepliesForUserThread` 仍保留，但 `AppForum.generateInitialReplies` 在调用新活动队列后直接返回，下面的旧实现属于不可达遗留路径。

### 4.2 AI 自动发帖

有两个入口：

1. Forum 页面按身份首次进入时的 daily `lazy` 生成。
2. 用户点击“刷新论坛”时的 `refresh` 生成。

```text
AppForum lazy effect / runRefreshGeneration
        │
        ├─ ForumGenerationTask guard (身份、关系、日期/刷新 key)
        ├─ generateForumThreads(count 1..5)
        │     ├─ 按 ownerIdentityId 筛关系
        │     ├─ buildForumRelationGenerationContext
        │     ├─ forumPostAuthorPolicy 选择 virtual 或 relationship
        │     ├─ buildThreadPrompt
        │     ├─ apiChat → JSON
        │     ├─ parseForumThreadCandidate
        │     ├─ 私密姓名/公开文本/相关性校验
        │     ├─ fingerprint/重复/时间线校验
        │     └─ createGeneratedThread + 可选初始虚拟回复
        ├─ commit threads/replies
        ├─ 为生成回复创建 automatic ActivityTask（懒加载路径）
        └─ 完成 ForumGenerationTask
```

关系角色最多按策略参与部分帖子：默认 NPC 权重 70、关系角色权重 30；关系角色有最近窗口、命名帖子数量和 36 小时冷却限制。

### 4.3 AI 评论/回复生成

#### 初始回复

```text
用户帖子成功保存
  → scheduleInitialForumReplies
  → planForumActivity (批量活动路径，当前实际入口)
  → PendingEvent → release → ForumReply
```

遗留的直接路径为：

```text
generateInitialRepliesForUserThread
  → selectForumReplyAuthors (最多 3 个)
  → buildReplyPrompt
  → apiChat（每个作者一次）
  → parse/validate
  → createGeneratedReply
```

#### 手动刷新/点赞活动

```text
用户点击帖子刷新或首次点赞
  → AppForum.runThreadActivity
  → generateThreadActivity(trigger)
  → 概率门控（点赞约 0.5，手动刷新约 0.7）
  → buildReplyPrompt 或楼主更新 Prompt
  → apiChat
  → ForumReply
  → commit + 通知 + UI 刷新
```

#### 用户回复后的定向互动

当前版本新增的运行时路径：

```text
用户发布 ForumReply
  → AppForum.handleSubmitReply
  → scheduleForumUserInteraction(threadId, reply.floor)
  → planForumActivity(trigger="user-interaction", requiredReplyFloor)
  → 强制首个事件指向用户楼层
  → 立即释放首条 NPC 回复，余下事件延迟释放
```

它仍然只使用公开 Thread/Reply 和公开角色投影，不把用户私聊或 Memory 注入论坛。

### 4.4 楼主更新流程

楼主更新不是 Thread 正文编辑，而是新增 Reply：

```text
活动触发
  → generateThreadActivity 计算 canAuthorUpdate
  → 仅 AI/虚拟 Thread 可走该分支
  → originalAuthorContext 校验关系作者（若是匿名关系角色）
  → author-update Prompt
  → apiChat → parse/validate
  → ForumReply.kind = "author-update"
  → release/commit
  → applyForumStoryUpdate
       ├─ episode + 1
       ├─ lastUpdateAt / nextUpdateAfter
       ├─ publicRecap 更新
       └─ 关键词命中时 status = resolved
```

用户 Thread 没有同等的 AI 楼主自动更新分支，也没有用户编辑帖子流程。

### 4.5 Forum DM

```text
用户从非匿名 AI/虚拟帖子或回复点击“私信”
  → resolveForumDmActorFromPublicRecord
       ├─ ownerIdentityId 必须匹配
       ├─ 匿名/user 作者拒绝
       ├─ 虚拟作者按固定 profile 解析
       └─ 关系作者必须匹配 relationId + userIdentityId + characterId
  → openForumDmConversation（按 owner + actor 去重）
  → 用户发送消息
  → appendForumDmMessage + ForumDmTask(running)
  → requestForumDmReply
       ├─ 关系 actor：读取关系 CharacterEvent
       ├─ 构建 CharacterCognitiveContext（memories: []）
       ├─ ForumDirectMessagePromptAdapter 安全投影
       ├─ buildForumDmPrompt（角色 persona、原始 Forum DM 历史、起源帖子）
       ├─ apiChat
       ├─ sanitize 文本
       └─ revision 校验后写 participant Message/通知
```

### 4.6 活动生成和释放

```text
useForumActivityEngine（App 级，文档可见）
  ├─ 首次 tick
  └─ 每 30 秒 tick
       ↓
runAutomaticForumActivityCheck
  ├─ releaseDueForumActivity(limit=1)
  ├─ 若没有到期事件，检查 API 配置与 hourly/daily budget
  ├─ 选择 Thread
  │    ├─ AI/virtual Thread 可参加 automatic
  │    └─ 用户 Thread 仅在初始计划缺失且创建超过 2 分钟时作为恢复候选
  ├─ planForumActivity(trigger="automatic")
  ├─ 写入 automatic ActivityTask
  └─ 尝试释放一条
```

目前自动预算为每小时最多 2 次、每天最多 8 次；单次计划最多返回 4 条事件，释放有上限和 actor 冷却。

## 五、AI 生成链路审计

### 5.1 生成入口总表

| 调用 | 调用位置 | Prompt 构建 | 输出 | 主要安全限制 |
| --- | --- | --- | --- | --- |
| `generateForumThreads` | `AppForum` lazy effect、手动刷新 | `buildThreadPrompt` + PublicForumPost Adapter | `ForumThread[]` + 可选初始 `ForumReply[]` | JSON、公开纯文本、敏感姓名、重复 Thread、回复时间线 |
| `generateInitialRepliesForUserThread` | `forumGenerationService`；当前 active UI 路径不可达的遗留函数 | `buildReplyPrompt(promptKind="reply")` + PublicForumReply Adapter | `ForumReply[]` | 真实楼层引用、公开相关性、公开作者边界 |
| `generateThreadActivity` | `AppForum.runThreadActivity`（manual refresh/like） | `buildReplyPrompt(promptKind="activity")` 或 author-update Prompt | `ForumThreadActivityResult` | 概率、author-update 只能由原楼主、公开内容校验 |
| `planForumActivity` | `forumActivityRuntime` 初始、自动、手动、user-interaction | 批量 JSON activity Prompt + PublicForumActivity Adapter | `ForumPendingActivityEvent[]` | actor slot 白名单、楼层/批次引用、1–4 条、私密姓名、相关性 |
| `requestForumDmReply` | `forumDmService` | `buildForumDmPrompt` + ForumDirectMessage Adapter | participant `ForumDmMessage` | 会话 revision、DM 历史、角色关系安全事件、文本清洗 |
| `translateForumContent` | `AppForum` 翻译按钮 | 公开文本翻译 Payload | `ForumTranslation` | proxyOnly、content hash、缓存；不产生角色行为 |

### 5.2 `generateForumThreads`

**Context 输入：**

- `ownerIdentityId`：过滤关系和所有权。
- `relationships`：只考虑当前身份下的关系。
- `characters`：角色名、personality、backstory、avatar；排除群聊和 contact instance。
- `messages`、`memories`：作为函数参数存在，但 `buildForumRelationGenerationContext` 的公开投影会把它们作为私有数据忽略，不将原文传给公开 Prompt。
- `worldBookEntries`：筛选 active 且 `isWorldBookEntryVisible(... scenario: "public")`；旧的安全上下文只抽取 topic category，不传原文。
- `publicEventCandidates`、`publicWorldSettings`：显式 public 候选，默认调用方若不提供则为空。
- `existingThreads`：fingerprint、重复和关系作者发帖策略。

**Prompt：**

- `buildThreadPrompt` 生成严格 JSON：标题、正文、匿名标记、0–5 条初始回复。
- 关系角色使用 `PublicForumPostPromptAdapter`（当 `publicCognitiveContext` 存在）；虚拟账号只使用固定公开风格。
- `FORUM_PUBLIC_TEXT_RULES` 禁止动作旁白、心理标签、媒体标记、私密姓名/ID、伪造已执行操作。

**输出和验证：**

1. `parseForumThreadCandidate` 提取 JSON，并限制字段长度。
2. `isThreadCandidatePublicSafe` 检查保护姓名、公开相关性、回复引用。
3. `forumThreadFingerprint` 和 `isForumThreadDuplicate` 去重。
4. `validateForumReplyTimeline` 检查初始楼层和引用顺序。
5. `createGeneratedThread` 设置 source、baseline likes、时间和可选 `storyArc`。

### 5.3 `generateInitialRepliesForUserThread`

它的输入包括 Thread、已有回复、关系、角色、消息、Memory、WorldBook、设置；实际公开 context 仍然使用 `buildForumRelationGenerationContext` 的 public projection。它选择最多 3 个作者，逐个调用 `buildReplyPrompt`，每个候选经过 JSON、楼层、公开相关性和私密内容验证。

当前 `AppForum.generateInitialReplies` 在调用 `scheduleInitialForumReplies` 后直接 `return`，因此这个函数是保留的兼容/遗留链路，不是用户发帖后的主运行路径。

### 5.4 `generateThreadActivity`

**回复分支：**把 Thread 标题、正文和最近 12 个有效公开回复放入 `publicThreadContext`；关系角色使用 PublicForumReply/Activity Adapter，虚拟账号使用 `ForumVirtualProfile.publicStyle`。最多生成 3 个作者，逐个生成并串接可引用楼层。

**楼主更新分支：**AI/虚拟 Thread 可按概率进入 `author-update`，只生成一条新的楼层，不修改原 Thread 正文。匿名关系角色只通过已存的私有 author mapping 恢复关系上下文，映射不进入 Prompt。

### 5.5 `planForumActivity` / `forumActivityService`

它把同一批活动表示为 JSON：

```json
{
  "events": [
    {
      "localId": "e1",
      "actorSlot": "virtual-1",
      "kind": "reply",
      "body": "公开回复",
      "replyTo": { "type": "floor", "floor": 3 },
      "delaySeconds": 30
    }
  ]
}
```

运行时再将事件转换成 Reply，所以 AI 不直接写 storage。

公开 Prompt 的 actor slot 包含：

- 关系角色的公开 displayName 和 `safePublicStyle`。
- 虚拟账号的固定公开风格。
- 可选 PublicForumActivity CognitiveContext：角色公开 persona、明确公开事件、明确公开 WorldBook、时间和 forbidden boundary。
- 当前 actor 最近已发布的少量公开回复，用于连续性提示；不包括私有 Memory 或私聊原文。

验证逻辑包括：

- actorSlot 必须来自白名单。
- `author-update` 必须由 Thread 原作者生成，用户 Thread 不允许 author-update。
- floor 必须真实存在；batch 引用必须指向同批次已出现事件。
- 连续同一 actor 不能无间隔重复占位。
- 文本必须通过媒体/动作/私密姓名/相关性校验。
- `requiredReplyFloor` 用于 user-interaction，首条事件强制回应用户楼层。

### 5.6 Forum DM AI 链路

Forum DM 的上下文来源与公开 Forum 不同：

- `ForumDmConversation` 的 participant public snapshot。
- 当前 DM 会话最近 30 条历史。
- 起源公开 Thread 的标题/正文（最多约 700 字）。
- 关系 actor 可读取 `characterEventRepository` 的关系事件，但 `getForumDmEventVisibility` 只允许关系创建和线下剧情完成等 safe 类事件进入 CognitiveContext。
- `buildCharacterCognitiveContext` 的 `memories` 明确传空数组。
- `ForumDirectMessagePromptAdapter` 只输出 persona、关系阶段、安全事件、行为约束、knowledge boundary 和时间。

因此 Forum DM 不是普通 Chat 的复制品，也不自动接收 Chat Memory、InnerVoice、完整 OfflineStory 或全部 WorldBook。

### 5.7 Context 读取矩阵

| 数据源 | 公开发帖 | 公开回复/活动 | Forum DM | 说明 |
| --- | --- | --- | --- | --- |
| Character persona | 是，公开投影 | 是，公开投影 | 是，关系 persona 投影 | 不输出内部 ID |
| Relationship | 用于当前身份筛选、actor 选择、私有映射 | 同左 | 用于严格 actor 校验和 CognitiveContext | 不应原样进入公开 Prompt |
| Chat Message | 原函数参数存在；原文不进入 public projection | 原文不进入 | Forum DM 自己的历史为主 | Forum Share 会在 Chat 中产生一条消息 |
| Memory | 不读取原文；公开安全函数传空 | 不读取原文 | 明确 `memories: []` | Forum 当前不写 Memory |
| CharacterEvent | 只有显式 `publicEventCandidates` 可进入公开 Context | 同左 | relation safe events 可进入 DM Adapter | 默认未知可见性即拒绝 |
| WorldBook | public 场景筛选并可抽取主题；显式 public candidates 才进入 PublicContext | 同左 | 不读取 | 仍需显式 public visibility 规范 |
| CharacterCognitiveContext | 不直接使用 | 不直接使用 | 使用，并经 ForumDirectMessage Adapter | 公开 Forum 独立于 Chat CognitiveContext |
| PublicForumCognitiveContext | 是 | 是 | 否，使用 ForumDirectMessagePromptContext | 公开 Prompt 的主边界 |
| OfflineStory | 不读取全文 | 不读取全文 | 仅可能由 safe CharacterEvent 摘要间接出现 | 不写回线下剧情 |

## 六、当前论坛内容类型

| 内容 | 对应类型/存储 | 用户生成 | AI 生成 | NPC/虚拟生成 | 系统生成 |
| --- | --- | --- | --- | --- | --- |
| 普通帖子 | `ForumThread` | 是 | 是 | 是 | 否 |
| 匿名帖子 | `ForumThread.source = user-anonymous` 或 `ai-character-anonymous` | 是 | 是 | 是 | 否 |
| 普通回复 | `ForumReply.kind = reply` | 是 | 是 | 是 | 否 |
| 楼中楼 | `ForumReply.replyToFloor/replyToReplyId` | 是 | 是 | 是 | 否 |
| 楼主更新 | `ForumReply.kind = author-update` | 否（当前无编辑流程） | 是 | 是 | 否 |
| 点赞 | `likedByIdentityIds` + LikeHistory | 是 | 否 | 基线点赞可系统计算 | 部分（AI Thread baseline） |
| 活动计划 | `ForumActivityTask` + PendingEvent | 间接触发 | 是候选计划 | 是 actor | 是调度/释放 |
| 通知 | `ForumNotification` | 间接产生 | 间接产生 | 间接产生 | 是 |
| 私信 | `ForumDmConversation` + `ForumDmMessage` | 是 | 是 participant 回复 | 关系/虚拟 actor | 是 Task/通知 |
| 分享 | `ForumShare` + Chat `Message` | 是 | 否 | 否 | 是公开快照构建 |
| 翻译 | `ForumTranslation` | 用户触发 | 是翻译服务 | 否 | 是缓存 |
| 浏览/点赞历史 | History records | 是 | 否 | 否 | 是本地记录 |

## 七、NPC 参与机制

### 7.1 NPC 作为发帖者

支持两类：

1. **关系角色 NPC**：`source = ai-character` 或 `ai-character-anonymous`，Thread 保存 `privateAuthorRelationId/privateAuthorCharacterId`，公开作者可以实名或匿名。关系发帖受窗口、命名数量和 36 小时冷却策略限制。
2. **虚拟论坛用户**：`source = ai-virtual` 或 `virtual`，使用固定 `FORUM_VIRTUAL_PROFILES`，没有真实 Character/Relationship 映射。

### 7.2 NPC 作为评论者/回复者

支持。所有 NPC 回复都是 `ForumReply`，通过关系 actor slot 或 virtual profile 生成。最多每批 1–4 条活动事件；初始/活动路径可在同一批次内通过 `replyTo: batch` 形成连续回复。

### 7.3 NPC 作为楼主

支持。AI/虚拟 Thread 的原作者可以生成 `kind = author-update` 的后续楼层；运行时释放时推进 `ForumStoryArc`。用户 Thread 不允许被系统伪装成 AI 楼主更新。

### 7.4 NPC 作为独立用户身份

虚拟 NPC 以 `ForumVirtualProfile` 作为独立公开用户；但它不是完整的跨 Thread 社会身份：

- 没有独立的全局 profile 表和全局 Memory。
- actor 状态主要按 `ownerIdentityId + threadId` 保存。
- 只有固定 profile ID/公开风格能稳定复用。
- 虚拟 NPC 可以被解析进入 Forum DM，但 DM 仍按当前身份本地隔离。

### 7.5 NPC 关系和长期状态缺口

当前 ActorState 只有回复时间、冷却、近期回复 ID/主题片段、小时频率；没有好感、立场、情绪、知识变化、阵营、互相认识关系或跨 Thread 记忆。因此现有 NPC 更接近“带风格的公开参与者”，而不是完整的论坛社会角色。

## 八、时间线和状态机制

### 8.1 已有时间字段

- Thread：`occurredAt`、`createdAt`、`updatedAt`、`lastActivityAt`。
- Reply：`occurredAt`、`createdAt`、`updatedAt`、永久 `floor`。
- ActivityEvent：`scheduledAt`、`createdAt`、`updatedAt`，释放后 `resolvedReplyId/resolvedFloor`。
- StoryArc：`episode`、`lastUpdateAt`、`nextUpdateAfter`、`status`、`publicRecap`。
- ActorState：`lastReplyAt`、`cooldownUntil`、小时回复时间戳。
- Task：started/completed/retry 时间。

### 8.2 没有或不完整的状态

- Thread 没有通用 `status`；只有 AI/虚拟 Thread 可能有 `storyArc.status`。
- 用户 Thread 没有连载状态和事件进度。
- 没有统一“故事内时间”与现实发布时间的双时间模型。
- 没有 NPC 独立行为时间、作息、在线状态或长期状态。
- 没有公开事件发生时间、可信度、可见性级别与证据来源绑定到 Thread/Reply。
- `updatedAt`、`occurredAt` 和 `lastActivityAt` 语义不同但没有统一时间线实体，扩展时容易把写入时间当成故事发生时间。
- 浏览器关闭、页面不可见时，当前 hook 不运行 AI 调度；任务会持久化，但没有服务端/Service Worker 级后台执行。

### 8.3 现有连载判断

`inferForumStoryArc` 只对 AI/virtual Thread 的标题/正文进行关键词匹配，生成初始 `episode=1`、`status=open`、`continuationProbability=0.7`。`canScheduleStoryContinuation` 要求至少 6 小时间隔，且最近 24 小时 author-update 少于 1；`applyForumStoryUpdate` 依据简单关键词判断 resolved。

它提供的是“是否允许再发一条楼主更新”的门控，不是可验证的故事状态机。

## 九、当前限制与扩展风险

### 9.1 数据结构风险

1. `ForumThread + ForumReply` 能表达线性楼层和引用，但不能表达剧情事件、分支、场景、因果、NPC 立场变化或多个故事参与者的状态迁移。
2. `storyArc` 只有类别、episode、状态、recap，无法回答“事件是否真实发生”“谁知道”“谁误解”“哪个回复改变了什么”。
3. Reply 的公开作者和 private actor 分离是正确的隐私基础，但没有独立 `ForumActorProfile`、`ForumActorRelation` 和跨 Thread 事件记忆。
4. 用户帖子没有 storyArc，用户发起的论坛体故事无法复用自动连载门控。
5. 没有 Thread 编辑版本；楼主更新只能追加楼层，无法表达“原帖被修改但保留历史”。

### 9.2 AI 生成风险

1. JSON、长度、相关性和私密姓名校验不能证明事实真实性；模型仍可能把 topic seed 写成“已经发生的故事”。
2. `forumThreadFingerprint` 和简单相似度不能解决语义重复、同一事件多次改写和角色立场漂移。
3. 自动活动使用时间冷却和 API 预算，解决频率问题，但不保证剧情中每个事件只发生一次。
4. 批次事件通过 `batch` 引用可形成短链，但没有跨批次因果引用、事件 ID 或前置条件。
5. PublicContext 的安全投影是正确方向，但需要持续保证 `publicEventCandidates` / `publicWorldSettings` 只能由明确的公开分类提供；仅靠“过滤主题”仍可能产生语义推断泄露。
6. 关系角色的公开风格来自角色设定的安全片段，尚无专门的“公开人格版本”；私密人格规则可能通过风格间接泄露。

### 9.3 记忆和认知风险

- 当前 Forum 不写 Memory，降低了污染 Chat/线下记忆的风险。
- 但 Forum 事件也不会自动进入 CharacterEvent、CharacterKnowledge 或关系状态，因此“论坛中已经公开发生的事情”不会自然成为角色可调用的长期公共知识。
- 如果未来直接把 ForumReply 写入 Memory，必须加入 `source=forum-public`、public visibility、owner identity、thread/event ID 和可撤销性；不能复用 Chat Memory 的默认写入路径。
- Forum DM 当前不读取 Memory 是安全的，但也意味着 DM 角色可能不知道关系中的已确认事实；扩展时应使用专用 safe event projection，而不是全量 Memory。

### 9.4 时间和调度风险

- 活动任务存 LocalStorage，浏览器关闭或文档不可见时不执行。
- 自动活动每小时/每日预算较低，若同时存在多个故事，可能出现延迟饥饿。
- `releaseDueForumActivity(limit=1)` 每次只释放一条，短时间内会形成逐条追赶。
- 本地多标签页会通过 storage 事件刷新，但没有分布式锁；多个标签页可能同时规划 AI 活动。
- 生成成功与公开可见时间不是同一层概念：事件可能已生成但尚未释放，不能把生成时间当作剧情发生时间。

### 9.5 隐私和身份隔离风险

- 当前主要隔离条件是 `ownerIdentityId`，关系角色还需要 `relationId + characterId`；未来扩展不能退化为只用 `characterId`。
- 公开分享快照会冻结当时可见楼层，不应意外带出后续私有 actor 或被删除内容。
- 任何新 Prompt Adapter 都必须明确排除 `relationId`、`conversationId`、内部 actor ID、Memory 原文、InnerVoice 和 OfflineStory 全文。
- WorldBook/global 条目没有统一的 public visibility 字段时，仍有把内部设定变成公开主题的风险。

### 9.6 存储和迁移风险

- 所有 Forum 主数据拆成多个 LocalStorage 数组；新故事模块若再增加数组，需要 schema version、旧数据兼容、原子恢复和删除清理。
- 现有容量压缩会按身份、时间和任务状态裁剪；故事事件若被当作普通 activity task，可能在 30 天后丢失因果链。
- 删除角色/关系时需要同时清理 Thread 私有 author mapping、Reply privateActor、ActivityTask、ActorState、DM 和 Share。

## 十、当前架构图

```text
                         ┌──────────────────────────┐
                         │          App.tsx          │
                         │ 身份/角色/关系/消息/设置 │
                         └────────────┬─────────────┘
                                      │ props + activity context
                                      ▼
                         ┌──────────────────────────┐
                         │       AppForum.tsx        │
                         │ 页面、交互、useSyncExternalStore │
                         └───────┬─────────┬────────┘
                                 │         │
                   本地确定性操作 │         │ AI/活动操作
                                 ▼         ▼
                   ┌────────────────┐  ┌─────────────────────┐
                   │ domain/forum   │  │ features/forum      │
                   │ forumData      │  │ Generation/Activity │
                   │ share/profile  │  │ DM/Translation      │
                   └───────┬────────┘  └──────────┬──────────┘
                           │                     │
                           │ public projection  │ apiChat/apiTranslate
                           ▼                     ▼
                 ┌────────────────────┐  ┌───────────────────┐
                 │ Public Context /   │  │ AI Provider       │
                 │ Cognitive Adapters │  │ JSON/text output  │
                 └──────────┬─────────┘  └─────────┬─────────┘
                            │ validation/safety     │
                            └──────────┬───────────┘
                                       ▼
                         ┌──────────────────────────┐
                         │ forumRepository          │
                         │ LocalStorage + snapshots │
                         └────────────┬─────────────┘
                                      │ subscribe/storage event
                                      ▼
                         ┌──────────────────────────┐
                         │ UI refresh / notifications│
                         └──────────────────────────┘
```

## 十一、数据流图

```text
用户/AI输入
   │
   ├─ 用户 Thread/Reply ──► forumData ──► commitForumMutation
   │                              │
   │                              └─► scheduleForumUserInteraction（用户回复）
   │
   ├─ AI 帖子 ──► ForumRelationContext / VirtualProfile
   │                 └─► PublicForumPostPromptContext
   │
   ├─ AI 回复/活动 ──► public Thread + public Reply + actor slots
   │                    └─► parse/validate/safety
   │                         └─► PendingActivityEvent
   │                              └─► release ──► ForumReply
   │
   ├─ Forum DM ──► public actor resolve ──► DM history + safe relation events
   │                 └─► ForumDirectMessagePromptContext ──► ForumDmMessage
   │
   └─ 分享 ──► ForumThreadPublicSnapshot ──► ForumShare + Chat Message

所有持久化分支
   └─► phone_forum_* LocalStorage keys
        ├─ threads / replies
        ├─ activityTasks / actorStates / generationTasks
        ├─ DM conversations / messages / tasks
        ├─ profiles / history / likes / notifications / shares
        └─ translations
```

## 十二、AI 调用链图

```text
公开帖子
AppForum lazy/refresh
  → generateForumThreads
  → buildForumRelationGenerationContext
  → PublicForumPostPromptAdapter
  → buildThreadPrompt
  → apiChat
  → parseForumThreadCandidate
  → safety + duplicate + timeline validation
  → ForumThread / initial ForumReply

用户帖子初始互动
AppForum create
  → scheduleInitialForumReplies
  → planForumActivity
  → PublicForumActivityPromptAdapter
  → apiChat（批量 events JSON）
  → validateBatch
  → ActivityTask.pendingEvents
  → releaseForumPendingEvents
  → ForumReply

用户回复后的定向互动/自动活动/手动刷新
  → planForumActivity 或 generateThreadActivity
  → PublicForumReply/ActivityPromptAdapter
  → apiChat
  → floor/batch/actor/safety validation
  → ForumReply

Forum DM
  → resolve actor
  → buildCharacterCognitiveContext（Memory 空）
  → ForumDirectMessagePromptAdapter
  → buildForumDmPrompt
  → apiChat
  → sanitize
  → ForumDmMessage

翻译
  → translateForumContent
  → apiTranslate(proxyOnly)
  → ForumTranslation cache
```

## 十三、扩展“论坛体故事 / NPC 事件论坛”的建议架构

建议在现有 Forum 之上新增独立故事层，不把 `storyArc` 继续堆成万能字段。

### 13.1 建议新增的核心模块

```text
domain/forumStory/
├─ forumStoryTypes.ts             # Story、Episode、PublicEvent、ActorState
├─ forumStoryRepository.ts        # 版本化持久化和迁移
├─ forumStoryEventLedger.ts       # 事件、证据、可见性、因果关系
├─ forumStoryStateMachine.ts      # open/branch/resolved/abandoned 等状态迁移
├─ forumStoryScheduler.ts         # 角色作息、前置条件、节奏和预算
├─ forumStoryDedup.ts             # 事件级幂等、语义去重和重复检测
└─ forumStoryContextAdapter.ts    # 给公开帖子/回复/DM 的最小投影

features/forum/services/
└─ forumStoryGenerationService.ts # 生成候选事件，不直接写状态
```

### 13.2 建议的事件模型

建议把“故事中发生了什么”与“论坛公开说了什么”分开：

```ts
interface ForumStoryEvent {
  id: string;
  storyId: string;
  ownerIdentityId: string;
  occurredAt: number;             // 故事内发生时间
  recordedAt: number;             // 写入时间
  kind: string;
  actorIds: string[];              // 内部 actor，不公开
  publicVisibility: "public" | "partial" | "private";
  evidence: Array<{ threadId?: string; replyId?: string }>;
  facts: string[];
  confidence: number;
  status: "candidate" | "confirmed" | "rejected";
}
```

只有 `confirmed + publicVisibility=public` 的事实才允许进入公开 Forum Prompt；只有用户明确授权或独立的关系安全策略允许时，才进入 CharacterEvent/Memory 投影。

### 13.3 建议的 NPC 状态

不要把关系角色的 Chat Memory 直接作为论坛 NPC 状态。应建立论坛作用域的公开状态：

- 当前立场/阵营。
- 对某个公开事件的已知/未知/误解。
- 与其他论坛 actor 的公开关系。
- 最近公开行为、发言风格、活跃时间段。
- 故事内作息和下次可行动时间。
- 事件前置条件和冷却。

这些状态应以 `ownerIdentityId + storyId + actorKey` 隔离，并由事件账本驱动，而不是由每次 Prompt 自由推断。

### 13.4 建议的生成事务

```text
选择到期 Story/Actor
  → 读取已确认事件和公开状态
  → 生成候选事件（不写库）
  → 事实/时间/角色权限/公开可见性验证
  → 写入 EventLedger（confirmed/candidate）
  → 生成公开帖子/回复候选
  → 公开文本安全与事件证据校验
  → 写入 Thread/Reply + Event evidence
  → 生成 ActivityTask 释放
```

关键点是“事件先于公开发言”，这样可以避免模型直接把一段戏剧化文本当成已经发生的事实。

### 13.5 建议的迁移与兼容

1. 保留现有 `ForumThread.storyArc`，将其迁移为故事摘要/兼容视图，不立即删除。
2. 新增 `storyId` 时允许为空；旧帖子仍按普通 Forum 处理。
3. 旧 `ForumReply` 没有 evidence 的记录视为无事件证据，不自动补写历史事件。
4. 新增 `publicVisibility` 默认 `unknown/denied`，不能默认 public。
5. 任务压缩时，已确认事件账本不能按普通 activity task 的 30 天策略直接删除。

## 十四、最终能力与扩展评估

| 能力 | 当前状态 | 是否足够支持论坛体故事 |
| --- | --- | --- |
| 帖子/楼层持久化 | 完整 | 作为 UI 基础足够 |
| 用户发帖/回复 | 完整 | 足够，但没有编辑版本 |
| NPC 发帖 | 有 | 需要独立故事身份和事件来源 |
| NPC 回复/楼中楼 | 有 | 需要事件/立场/因果约束 |
| 楼主更新 | 有限 | 只能追加 author-update，不能表达完整状态机 |
| 公开活动队列 | 有 | 需要故事级调度和离线恢复 |
| StoryArc | 有限关键词版 | 不能单独承担故事系统 |
| NPC 长期状态 | 只有 ActorState 冷却/近期 ID | 不足 |
| 公开事件账本 | 无 | 必须新增 |
| 公开/私密知识边界 | 有 PublicContext/DM Adapter | 基础具备，需继续结构化 |
| Memory/CharacterEvent 写回 | 无 | 安全，但缺少可选的公共事实桥接 |
| 语义去重 | 弱 | 需要事件 ID、主题摘要和向量/规则去重 |
| 浏览器关闭后的执行 | 无 | 需要服务端、Service Worker 或显式恢复机制 |
| 多身份隔离 | 强 | 新模块必须保持 owner-first 设计 |
| 分享到 Chat | 有冻结快照 | 可作为公开故事引用入口 |

## 十五、审计结论

当前 Forum 的边界清晰：公开内容、关系 actor、虚拟作者、活动队列、DM 和分享已经分层，且公开 Prompt 不应直接接收私密认知上下文。对于扩展“论坛体故事 / NPC 事件论坛”，最重要的不是继续增加 Prompt 文案或在 `ForumThread` 上添加更多字段，而是引入独立的故事事件账本、可见性策略、NPC 公开状态和可验证的时间/因果调度。

扩展时应遵守以下不变量：

1. `ownerIdentityId` 永远是第一层隔离条件；关系角色必须再校验 `relationId + characterId`。
2. 公开 Prompt 只接收公开投影，不接收 Memory、InnerVoice、Chat 原文、OfflineStory 全文或内部 ID。
3. AI 只能生成候选，不直接写事件状态；事实确认和公开发布必须分阶段。
4. 公开楼层、故事事件和关系记忆是三个不同层次，不能互相默认同步。
5. 分享到 Chat 只能使用冻结公开快照，不能反向扩大 Forum 的私密可见范围。
6. 所有新任务、事件和状态都必须支持幂等、重试、删除角色清理、容量压缩和 schema 迁移。

