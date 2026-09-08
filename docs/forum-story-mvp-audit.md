# ForumStory MVP 质量审计

审计范围：ForumStory Domain、Storage、初始生成、评论生成、楼主更新、生命周期测试和 Forum 只读 UI。

审计原则：只读取现有源码和测试，不修改业务源码。本报告新增于 2026-08-06。

## 结论摘要

当前 MVP 的“同一进程 happy path”已经打通：

```text
创建故事 → 初始帖子 → Story 评论 → 楼主更新 → Story UI 展示
```

生命周期、数据隔离和构建测试均通过。但当前版本还不适合直接作为可长期连载的生产基础，主要原因是：

1. `StoryCharacter` 没有持久化仓储。创建服务只把角色放在返回值中；页面刷新或重新打开应用后，评论/更新生成无法可靠恢复角色身份，UI 只能使用“故事楼主”或 story actor ID 作为回退显示。
2. 创建、评论、更新均是多次 LocalStorage 写入，没有事务、回滚或并发版本校验，任一步失败都可能留下半完成数据。
3. Story 状态和事件序列没有统一状态机/CAS 约束，并发生成可能产生重复集数、重复序列或时间线竞争。
4. AI Prompt 有明确的私域禁止规则，但事实一致性、语义去重、人物长期状态和“不得提前泄露结局”主要依赖提示词，缺少程序化验证。

因此：作为 MVP 演示和只读故事展示，当前链路可用；作为跨会话、自动连载和多故事并行的基础，建议先完成 P1 修复后再扩展。

## 一、完整链路审计

### 1. 创建故事与初始帖子

实现位置：`src/features/forumStory/services/forumStoryGenerationService.ts`。

流程：

1. 创建 `ForumStory(status=draft)`。
2. 构建 `ForumStoryInitialPromptContext`。
3. 调用 `apiChat` 或注入的测试 AI。
4. 解析标题、正文、作者和故事角色。
5. 生成并保存 `StoryThread`。
6. 追加 `StoryEvent(post_created)`。
7. 更新故事为 `active`，设置 `mainThreadId`、`currentEpisode=1` 和 `version=2`。

审计结果：同一进程内通过生命周期测试。普通 `ForumThread` 存储不会被创建，符合隔离目标。

风险：草稿在 AI 或后续写入失败时不会自动清理，也没有 `failed` 状态或恢复任务；可能留下没有主帖和事件的孤儿草稿。

### 2. 评论生成

实现位置：`src/features/forumStory/services/forumStoryCommentService.ts`。

流程：

```text
StoryThread + 调用方传入的 StoryCharacter
        ↓
StoryThread + 既有 StoryForumReply 摘要
        ↓
ForumStoryCommentPromptAdapter
        ↓
严格 JSON 解析与安全校验
        ↓
StoryForumReplyRepository.appendReply()
        ↓
StoryEvent(comment_added)
```

审计结果：评论正文去重、StoryThread scope 校验、角色白名单校验和普通 Forum 回复表隔离均通过测试。

风险：评论服务要求调用方再次提供 `characters`；角色没有从持久化层恢复。评论先写回复、后写事件，事件写入失败会留下没有对应事件的回复。

### 3. 楼主更新

实现位置：`src/features/forumStory/services/forumStoryUpdateService.ts`。

读取：`ForumStory`、`StoryThread`、调用方传入的 `StoryCharacter`、confirmed `StoryEvent`、Story 回复摘要。

写入：

1. `StoryUpdate(status=published)`。
2. `StoryEvent(update_published)`。
3. `ForumStory(status=waiting_update, currentEpisode+1, version+1)`。

审计结果：状态推进、事件追加、历史事件不可覆盖测试通过。

风险：更新同样依赖调用方传递角色；更新、事件和故事状态是三次独立写入。若最后一步失败，更新和事件已经存在，但故事状态仍可能停留在旧状态。

### 4. UI 展示

实现位置：

- `src/components/AppForum.tsx`
- `src/features/forumStory/forumStoryUiData.ts`
- `src/features/forumStory/components/ForumStoryList.tsx`
- `src/features/forumStory/components/ForumStoryThreadView.tsx`

UI 读取链路：

```text
ForumStoryRepository
StoryThreadRepository
StoryEventRepository（只取 confirmed）
StoryForumReplyRepository
StoryUpdateRepository（只取 published）
        ↓
forumStoryUiData read model
        ↓
故事论坛列表 / 故事线程只读页
```

审计结果：故事列表、状态标签、更新时间、初始帖子、角色标签、评论和楼主更新均可展示；没有读取普通 `ForumThread`、普通 `ForumReply`、Memory、Relationship 或真实 Character。

限制：`forumStoryItems` 在 AppForum 挂载时读取一次，没有 Story 仓储订阅机制；外部新建或更新故事后，当前页面不会自动刷新，必须重新进入页面。

## 二、数据一致性审计

| 对象 | storyId 校验 | 时间线 | 历史不可变 | 当前结论 |
|---|---|---|---|---|
| ForumStory | Repository 按 id 查询 | `updatedAt/version` 写入 | 普通 update 可覆盖快照 | 有基本一致性，无 CAS |
| StoryThread | 创建和查询按 storyId 过滤 | `createdAt/updatedAt/episode` | 可通过 patch 修改 | 初始帖子稳定，缺少状态机 |
| StoryEvent | 创建/查询按 storyId 过滤 | `sequence` 排序 | 同 story + id 或幂等键拒绝覆盖 | 追加模型正确，但序列并发不安全 |
| StoryForumReply | storyId + threadId 过滤 | floor/occurredAt 排序 | 同正文或 id 拒绝重复 | 独立存储有效，非 branded 类型 |
| StoryUpdate | storyId 过滤 | updatedAt 排序 | 同 id 拒绝重复 | 支持 published 更新，但无事件引用校验 |

### 已确认一致的部分

- 生命周期测试中的所有对象均使用同一 `storyId`。
- StoryReply 不写入 `phone_forum_replies`。
- Story UI 只显示确认事件和已发布更新。
- `StoryEventRepository` 对历史事件采用 append-only 语义。
- `StoryForumReplyRepository` 对同一 StoryThread 的相同正文做规范化去重。

### 一致性风险

- 事件 `sequence` 使用“读取最大值 + 1”，没有原子递增；并发调用可能生成相同序号。
- `ForumStoryRepository.updateStory()` 是整数组替换，没有版本条件，旧请求可能覆盖新状态。
- `StoryUpdate.eventIds` 只做字符串保存，不校验这些事件真实存在、属于同一 story 或类型是否匹配。
- 多步骤写入没有事务；浏览器刷新、Storage 写失败或两个标签页并发时可能产生孤儿回复、孤儿更新或状态落后。
- Story 状态允许通过通用 patch 直接跳转，没有统一约束 `draft → active → waiting_update → completed` 的合法迁移。
- Story 数据没有 owner/identity 分区。当前 LocalStorage 单用户场景可用，但未来同步、备份或多身份场景可能出现同一 storyId 的跨身份读取。

## 三、AI 质量审计

### 初始帖子 Prompt

优点：

- 只传故事主题、明确允许的公共背景和 StoryCharacter 投影。
- 明确禁止 Memory、Relationship、私密信息、Chat 历史、InnerVoice 和 CharacterEvent。
- 要求标题、正文、故事背景、初始状态等结构化 JSON。

风险：

- 角色由 AI 首次生成，缺少持久化和版本，因此后续调用可能无法保持相同角色。
- 没有主题指纹、事实表或事件图，重新创建类似主题可能生成重复世界。
- 角色 persona 只有文本摘要，没有可执行的行为约束和知识边界。

### 评论 Prompt

优点：

- 评论作者必须来自传入的 StoryCharacter 名单。
- 只传初始帖子、故事角色和最近公开评论。
- 支持普通、吃瓜、理性、提问、补充信息五类风格。
- 服务层会过滤未知作者和完全重复正文。

风险：

- 风格“尽量多样”没有程序化保证，多个评论可能全部同一种口吻。
- 只有精确正文去重，没有语义去重、观点去重或作者冷却机制。
- 评论作者实际上只能是 StoryCharacter，不支持真正的故事用户、匿名网友或临时路人身份。
- 只携带最近 12 条评论，长串讨论中的早期事实和冲突可能丢失。
- 评论没有回复目标、引用关系、点赞状态或讨论分支，论坛感仍然偏单层列表。

### 更新 Prompt

优点：

- 读取当前状态、事件时间线、角色投影和评论摘要。
- 明确禁止改写历史、虚构现实事实、使用内部 ID 或提前结束故事。
- `StoryUpdate` 保存标题、正文和 `eventProgression`，便于 UI 展示连载推进。

风险：

- “不矛盾”“不泄露结局”目前只是自然语言约束，没有事件事实校验器或结局泄露检测器。
- `eventProgression` 是自由文本，没有绑定具体事件 ID，无法验证推进依据。
- 事件只取最近 24 条，长篇故事可能遗失早期关键事实。
- 没有主题一致性评分、角色口吻评分、状态前置条件或候选审查队列。
- AI 失败时仅重试一次，重试仍失败会留下前置草稿/前置数据或让调用方自行处理。

### 通用 Prompt/解析风险

- JSON 解析采用“首个 `{` 到最后一个 `}`”截取策略，能容忍包裹文本，但不等价于严格 schema 验证。
- 私域字段检测按有限的精确键名和标记匹配；大小写变体、下划线变体、额外私域对象名不一定被拒绝。
- 服务接受结构上像 `StoryCharacter` 的对象，无法在运行时证明它一定不是由真实 Character 数据转换而来。
- Prompt 中虽然写了禁止项，但没有统一的 `ForumStoryContext` 不可绕过边界；调用方可以直接拼接输入。

## 四、论坛体验审计

### 已有的论坛体特征

- 有初始主帖、评论楼层和楼主更新三个时间层次。
- 评论有 floor，更新有标题、正文和事件推进说明。
- 列表有连载中、等待更新、完结状态和更新时间。
- UI 使用独立的故事视觉区域，与普通 Forum 卡片区分。

### 当前体验不足

- 本阶段 UI 是只读的，用户不能在故事页评论、引用、追问或触发楼主回应；用户参与感较弱。
- 没有真实的楼中楼、回复目标、引用、争论和 NPC 之间的往返讨论。
- 评论角色不支持匿名网友和临时网民，全部来自 StoryCharacter，容易显得像角色公告而不是开放论坛。
- 初始作者身份没有持久化姓名，UI 会回退为“故事楼主”；未知 actor 可能显示为 `故事角色 <id>`，影响活人感。
- 没有推荐、关注、追更通知、未读更新或评论数量增量。
- 没有加载更多和长篇事件分页策略；更新和评论全部在单个故事页读取。
- UI 数据适配器没有浏览器级渲染测试，当前 UI 测试主要是 read model 数据隔离测试。

## 五、未来扩展风险

| 扩展方向 | 当前适配性 | 主要缺口 | 建议提前准备 |
|---|---|---|---|
| StoryCharacter 长期角色 | 不足 | 没有持久化、版本、知识快照 | 新增 StoryCharacterRepository，按 storyId 保存公开投影和状态版本 |
| 匿名网友 | 不足 | Reply 强制 virtual、非匿名、作者必须匹配角色 | 增加 story-scoped anonymous actor 类型，禁止映射真实 User |
| 推荐系统 | 较弱 | 没有故事索引、标签、热度和事件摘要 | 增加只读 Story index/read model，不直接复用私域 Forum 推荐数据 |
| 关注/追更 | 不足 | 没有订阅表、未读游标和更新通知 | 增加 story-scope subscription 与 event cursor |
| 自动推进 | 不足 | 没有 Scheduler、锁、预算、失败恢复 | 先做状态机、CAS、幂等 key 和任务表，再接 Scheduler |
| 多故事并行 | 部分可用 | 查询已按 storyId 过滤，但没有 owner 分区和角色仓储 | 引入 owner/story namespace、schema version 和迁移策略 |

特别注意：当前 `StoryForumReply` 是 `ForumReply` 的结构交集，并使用 `story-scope:<storyId>` 作为内部 owner token。虽然存储键独立，但类型上仍可能被误传给普通 Forum 服务；未来应使用 branded StoryReply 类型和边界转换器。

## 六、安全边界审计

### 已通过的边界

- Story UI 没有导入 Memory、Relationship 或真实 Character 数据。
- 三个 Prompt Adapter 都明确禁止 Memory、Relationship、私密上下文、Chat 历史和内部身份字段。
- Story 存储使用独立 key：`phone_forum_stories`、`phone_forum_story_threads`、`phone_forum_story_replies`、`phone_forum_story_events`、`phone_forum_story_updates`。
- `StoryForumReplyRepository` 明确拒绝 `privateActor`，并限制作者为 virtual/ai-virtual。
- 当前生命周期和 UI 数据测试确认不会写入普通 Forum 回复表或 Character 存储。
- `CharacterEvent` 没有被 Story Domain 或 UI 直接读取。

### 仍存在的安全风险

- `containsForbiddenStoryScopeKey()` 只匹配有限的精确键名，不做统一大小写、命名风格或别名归一化。
- ForumStory、StoryThread、StoryEvent、StoryUpdate 的运行时校验允许未声明的额外字段；除了 StoryReply，`privateActor` 等额外私域字段没有统一拒绝。
- StoryCharacter 只作为调用参数传入，没有仓储边界和来源校验；调用方若错误地把真实 Character 的人格摘要传入，Prompt 层只能看到文本，无法证明其来源合法。
- Story 数据没有用户身份分区，未来云同步或导出时需要额外防止跨身份串读。
- StoryEvent 的 `summary`、StoryUpdate 的 `content/eventProgression` 都是 AI 文本；目前没有统一的敏感事实审查或回写前审批状态。

## 七、已执行验证

本次审计执行并通过：

```text
npm.cmd run lint
npm.cmd run build
npx.cmd tsx scripts/forumStoryLifecycle.test.ts
npx.cmd tsx scripts/forumStoryUIData.test.ts
npx.cmd tsx scripts/forumStoryTypes.test.ts
npx.cmd tsx scripts/forumStoryStorage.test.ts
npx.cmd tsx scripts/forumStoryGeneration.test.ts
npx.cmd tsx scripts/forumStoryCommentGeneration.test.ts
npx.cmd tsx scripts/forumStoryUpdateGeneration.test.ts
```

构建仅有现存的 bundle 大小警告，不影响通过。

测试覆盖了同一进程的主链路和基础隔离，但尚未覆盖：

- 页面刷新后重新加载 StoryCharacter 并继续生成；
- 两个标签页并发写入；
- LocalStorage 写失败后的回滚/恢复；
- AI 语义重复、人物 OOC、事实矛盾和结局泄露；
- 实际浏览器 DOM、滚动、空状态和长篇分页。

## 八、发布建议

### 当前可以做的事情

- 作为内部 MVP 演示，展示故事列表、初始帖子、评论和楼主更新。
- 在单进程、单用户、手动触发条件下验证 Story scope 和普通 Forum 隔离。

### 发布前建议优先处理

1. 新增并持久化 `StoryCharacterRepository`，让刷新后仍能恢复同一套角色、公开身份和知识范围。
2. 引入事务或可恢复 saga，保证 Story、Thread、Reply、Update、Event 的多对象写入一致。
3. 引入 Story 状态机、版本 CAS、唯一事件序列和跨标签页锁。
4. 将 StoryReply 从 `ForumReply` 结构中隔离为 branded 类型，并为 story 数据增加 owner/namespace。
5. 增加事实 grounding、语义去重、角色一致性和结局泄露检测，再接入自动推进。
6. 增加 Story 仓储订阅和浏览器级 UI 测试。

## 最终判定

**演示级 MVP：通过。**

**可跨会话长期连载、多人/多故事生产使用：暂不建议发布。**

核心阻断项是 StoryCharacter 未持久化、跨仓储写入非事务化，以及 Prompt 结果缺少程序化事实与人格验证。

