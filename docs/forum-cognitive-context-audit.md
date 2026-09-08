# Forum AI 入口认知边界审计

审计日期：2026-08-01  
范围：Forum 的角色内容生成、自动活动、楼主更新与论坛私信；不改动源码。

## 结论

Forum 同时包含两个认知边界完全不同的 AI 场景，不能用同一份通用上下文处理。

1. **公开论坛**（发帖、评论/回复、自动活动、楼主更新）是面向所有用户的模拟内容。它只能使用已经脱敏的公开话题、公开人设风格和公开帖内上下文，不能把聊天记忆、私密事件或关系内部信息直接送进 Prompt。
2. **论坛私信**是从公开帖子进入、但随后属于某个确定 `relationId` 的私密会话。它已具备较严格的关系校验，却还没有通过 `CharacterCognitiveContext` 的安全投影获取时间、知识边界与安全事件。

因此，Forum 需要三个语义不同的 Adapter，而不是把 `ChatPromptAdapter` 或原始 `CharacterCognitiveContext` 直接复用到公开论坛：

| 场景 | 建议 Adapter | 是否读取关系私密事实 |
| --- | --- | --- |
| 公开发帖 | `ForumPublicPostPromptAdapter` | 否；仅脱敏主题和公开风格 |
| 公开回复 / 楼主更新 | `ForumReplyPromptAdapter` | 否；仅公开帖、公开回复、公开风格 |
| 论坛私信 | `ForumDirectMessagePromptAdapter` | 有限；仅当前关系的安全投影 |

## 当前 AI 入口地图

```text
Forum UI (AppForum)
├─ 首页首次加载 / 手动刷新
│  └─ generateForumThreads
│     └─ buildThreadPrompt → apiChat → parse/validate → persist ForumThread
├─ 用户发帖后的初始互动
│  └─ scheduleInitialForumReplies
│     └─ generateInitialRepliesForUserThread
│        └─ buildReplyPrompt → apiChat → parse/validate → persist ForumReply
├─ 手动刷新帖子 / 点赞后的互动
│  └─ generateThreadActivity / planForumActivity
│     ├─ buildReplyPrompt → apiChat → ForumReply
│     └─ 楼主更新 Prompt → apiChat → ForumReply(author-update)
├─ 定时活动释放
│  └─ forumActivityRuntime.releaseForumPendingEvents
│     └─ 释放已生成的活动事件，不再次调用 AI
└─ 从公开记录打开私信
   └─ resolveForumDmActorFromPublicRecord
      └─ requestForumDmReply
         └─ buildForumDmPrompt → apiChat → persist ForumDmMessage
```

用户手动创建帖子、用户手动发表回复、点赞、删除、收藏和未读状态更新均为确定性本地操作，不是 AI 入口。`forumTranslationService` 会调用 AI/翻译能力，但只翻译用户正在查看的论坛文本，不代表角色作出行为，也不应接入角色认知上下文。

## 入口逐项审计

### 1. 公开发帖生成

**UI → Service → Prompt → AI**

`AppForum` 首页初始化或刷新 → `generateForumThreads` → `buildThreadPrompt` → `apiChat`。

`generateForumThreads` 先按 `ownerIdentityId` 过滤当前身份可见的 Relationship，再选择 NPC 或关系角色作为匿名/虚拟作者。关系角色会经过 `buildForumRelationGenerationContext` 转为 `ForumRelationContext`。

| 上下文类别 | 当前使用方式 | 边界评价 |
| --- | --- | --- |
| Character | 使用经过裁剪的 `publicReplyPersona`（姓名、人设/背景的安全行） | 基本合理，但仍依赖文字过滤保护名称 |
| Relationship | 用于定位当前身份的关系、选作者、限制冷却 | 不直接把关系 ID 写进 Prompt |
| Chat history | 读取同一 `relationId + conversationId` 最近消息 | 只提取话题种子，不传原文 |
| Memory | 读取同一 `relationId` 的最多 8 条 | 只提取话题种子，不传原文 |
| WorldBook | 读取角色专属或 global 条目 | 同样压缩为话题种子；需注意 global 条目也可能含敏感设定 |
| CharacterEvent | 未读取 | 不能校验“最近发生过什么” |
| 时间 | 使用 `now` 和批量发布偏移 | 无角色作息、日夜语义约束或事件时间校验 |
| Cognitive Context | 未接入 | 当前依赖 Forum 自己的脱敏函数 |

`buildForumPublicSafeContext` 已做了重要保护：把聊天、Memory、WorldBook 内容转换为类别化主题，不把原文交给模型；`FORUM_PUBLIC_TEXT_RULES` 还禁止公开文本暴露私聊、记忆、昵称、动作角色扮演和内部标识。

**剩余风险：** 主题类别本身仍可能泄露敏感领域（例如健康、家庭、工作、近期出行）；而且这些类别没有基于 CharacterEvent 验证，角色仍可能把“计划”或模糊话题写成已发生经历。

### 2. 公开评论、回复与楼主更新

Forum 没有独立的 Comment 数据模型；所有评论式互动都使用 `ForumReply`。该范围包括用户发帖后的初始回复、手动刷新活动、点赞触发互动、定时活动与“楼主更新”。

**UI → Service → Prompt → AI**

- `AppForum.generateInitialReplies` → `scheduleInitialForumReplies` → `generateInitialRepliesForUserThread` → `buildReplyPrompt` → `apiChat`。
- `AppForum` 帖子互动入口 → `generateThreadActivity` 或 `planForumActivity` → 回复 Prompt / 楼主更新 Prompt → `apiChat`。
- `forumActivityRuntime` 仅释放已生成、已校验的计划事件，不重复调用模型。

| 上下文类别 | 当前使用方式 | 边界评价 |
| --- | --- | --- |
| Character | 关系作者使用 `publicReplyPersona`；虚拟作者使用虚拟档案 | 公开风格与身份已分离 |
| Relationship | 仅用于把真实角色绑定到当前身份的关系，并记录 `privateActor` | `privateActor` 是存储/路由信息，不写入公开 Prompt |
| Memory / chat | 仅通过已生成的 `ForumRelationContext` 转为话题与风格 | 不传私密原文，方向正确 |
| WorldBook | 间接成为公开话题种子 | 仍应区分“可公开世界观”与私密条目 |
| CharacterEvent | 未使用 | 无法让楼主更新只基于确认事件延续 |
| 时间 | 使用帖子发布时间、活动计划时间、当前时间 | 仅保证排序；不保证行为时间合理 |
| 当前帖与回复 | 传入公开标题、正文和最近公开回复 | 是回复相关性的正确事实来源 |

活动服务还会解析和校验生成批次、核验楼层、作者与话题相关性，并限制作者更新条件。这降低了内容错帖和无关回复风险。

**剩余风险：** 楼主更新能根据公开帖继续写，但没有事件事实层，容易把合理推测扩写成真实后续；同一角色的公开风格也可能因缺乏近期公开内容去重而逐渐重复。

### 3. Forum 私信生成

**UI → Service → Prompt → AI**

用户从帖子/回复打开私信 → `resolveForumDmActorFromPublicRecord` → `requestForumDmReply` → `buildForumDmPrompt` → `apiChat`。

私信入口的身份校验目前是 Forum 最严格的部分：

1. 公开记录的 `ownerIdentityId` 必须等于当前身份。
2. 对真实关系作者，记录的私有 actor 必须提供 `relationId` 和 `characterId`。
3. Service 再次核验 `relation.id + relation.userIdentityId + relation.characterId` 三者精确匹配。
4. 会话 key 带有 `ownerIdentityId` 和 relation/virtual actor 维度；删除关系时也会删除参与该关系的 Forum DM 数据。

| 上下文类别 | 当前使用方式 | 缺口 |
| --- | --- | --- |
| Character | 角色姓名、`personality` 片段 | 有，但没有统一人设投影 |
| Relationship | 仅用于 actor 校验与会话隔离 | 不提供安全关系摘要 |
| 私信历史 | 当前 Forum DM 的最近 30 条 | 合理，且与普通聊天隔离 |
| 公开帖子 | 作为私信来源上下文 | 合理，应保持公开性质 |
| Memory | 未读取 | 默认不读取是安全选择 |
| CharacterEvent | 未读取 | 缺少已确认、可见事件的窄投影 |
| WorldBook | 未读取 | 默认不读取是安全选择 |
| 时间 | 没有显式时间上下文 | 容易出现不合时宜的称呼、作息或时间线表达 |
| knowledge boundary | 未接入 | 缺少统一“知道/不知道”限制 |
| Cognitive Context | 未接入 | 需要专用 Adapter |

Forum 私信不应直接继承普通聊天的全部 Memory：从公开贴进入私信，并不自动授权角色引用用户的私聊事实。它应该只使用 Forum DM 历史、来源公开帖，以及经过严格筛选的当前关系安全摘要/安全事件。

### 4. 用户发帖和用户回复

`createForumThread` 与 `createForumReply` 为本地确定性写入。它们不构建 Prompt，也不应接入认知上下文。后续由 AI 生成的初始回复才属于第 2 类入口。

### 5. 翻译

`translateForumContent` 处理用户选择的论坛标题/正文翻译。它不代表任何 Character 的认知、关系或长期行为，因此不需要 `CharacterCognitiveContext` 或 Forum Adapter。只需继续确保翻译输入限于当前公开文本。

## ID 与关系隔离审计

| 路径 | 当前身份边界 | 关系边界 | `characterId` 单独作为边界？ | 结论 |
| --- | --- | --- | --- | --- |
| 公开发帖 | `ownerIdentityId` 先过滤 relationships | 选中关系后读取 `relationId + conversationId` 消息和 relation Memory | 否；先验证 relation 再解析 canonical character | 基本安全 |
| 公开回复/活动 | 当前帖的 `ownerIdentityId` | 关系 actor 通过当前身份的 relation context 取得 | 否；仅用角色 ID 辅助验证 actor | 基本安全 |
| 楼主更新 | 当前帖 owner + 原作者 relation | `privateAuthorRelationId` 只用于恢复已验证 actor | 否 | 基本安全 |
| Forum DM actor 解析 | `record.ownerIdentityId` | 精确 `relationId + userIdentityId + characterId` | 否 | 较安全 |
| Forum DM 回复 | 会话 `ownerIdentityId` | 发 AI 前再次精确验证 relationship | 否 | 较安全 |
| 公共匿名/虚拟角色 | 当前 owner 的生成批次 | 无真实 relationship | 不适用 | 必须保持与真实关系角色隔离 |

目前没有发现 Forum AI 入口靠“显示名称反查 Relationship”的主路径。公开显示名称用于内容校验与虚拟作者，但真实 Forum DM 的关系解析基于持久化私有 actor ID。这个约束不能在后续 Adapter 接入时被削弱。

## 主要风险

### P0：公开论坛误用私密认知上下文

若未来把原始 `CharacterCognitiveContext`、`ChatPromptContext` 或 Chat Memory 直接传给公开发帖/回帖，`knownFacts`、safe events 或关系摘要仍可能暴露用户私密经历。公开 Forum 必须继续使用单独的“公开投影”，而非通用私密投影。

### P1：论坛私信没有统一知识与时间边界

现有 Forum DM 只有裁剪后的 Character 人设、来源公开帖和 DM 历史。它没有 knowledge boundary、时间上下文或安全事件投影，可能在私信中产生不符合角色已知范围和当前时间的内容。

### P1：公开主题的语义泄露与虚构经历

Forum 的话题种子来自 relation Memory、聊天和 WorldBook 的内容分类。虽然不泄露原文，但敏感主题仍可能暴露；同时没有 Event 作为事实锚点，模型可能把主题推断成共同发生的经历。

### P2：公开活动/楼主更新重复

已有 fingerprint、作者冷却、活动频率和相关性校验，但没有“最近公开内容的主题语义摘要”或“已使用事件”约束。长期运行仍会产生相似主题、相似楼主更新。

### P2：时间仅服务排序，不服务行为合理性

`now`、发布时间和计划延迟能保证动态顺序，不能约束“今晚”“刚起床”“下班后”等自然语言，也没有角色作息或事件发生时间校验。

### P3：初始回复路径存在遗留不可达代码

`AppForum.generateInitialReplies` 已委托 `scheduleInitialForumReplies` 并提前返回，后续旧实现成为不可达代码。它不直接造成认知泄露，但会让以后审计者误判实际调用链。应在独立、经过回归测试的清理提交中处理；本次不修改。

## 推荐 Context / Adapter 设计

### A. `ForumPublicPostPromptAdapter`（必须保持公开边界）

输入可以来自现有 `ForumRelationContext`，未来可由一个显式 `ForumPublicCognitiveContext` 构建；不要把原始 `CharacterCognitiveContext` 传入。

允许输出：

- 精简公开 persona：不含私密昵称、联系信息、专属身份线索。
- 已分类、低敏感度的话题种子，并标注为“可公开话题倾向”，不是事实。
- 可公开的 WorldBook 主题/体裁信息。
- 当前生成时间及公开发布行为限制。
- 已发布公开主题摘要，用于去重（后续阶段）。

禁止输出：

- `relationId`、`userIdentityId`、`conversationId`、内部 actor ID。
- 原始 Memory、聊天原文、InnerVoice、私信历史。
- 私密 CharacterEvent 或任何“用户与角色共同经历”的未确认表述。

### B. `ForumReplyPromptAdapter`（必须保持公开线程边界）

在 A 的公开投影基础上，额外允许：

- 当前公开帖标题与正文。
- 最近公开回复、已存在楼层和允许的公开称呼。
- 楼主更新时的公开帖子历史与公开互动节奏。

它不应因为回复角色是现实 Relationship 而扩大信息范围。`privateActor` 继续只用于储存、DM 路由和关系清理，不进入 Prompt。

### C. `ForumDirectMessagePromptAdapter`（应优先接入）

输入为当前关系构建的 `CharacterCognitiveContext`，输出为严格的 Forum DM 投影：

- 精简角色 persona。
- 来源公开贴/公开回复和当前 Forum DM 历史。
- 当前关系的安全摘要（若已有），但不含内部 ID。
- `promptVisibility = safe` 且明确可用于私信的近期事件摘要；默认宁缺毋滥。
- 当前时间和 knowledge boundary。

默认禁止：

- Chat Memory、OOC Memory、InnerVoice、线下剧情全文。
- 私密 Event、原始用户资料、未确认关系升级。
- 任意 `relationId`、`userIdentityId`、`conversationId`。

这与 `ChatPromptAdapter` 的差异是：Forum DM 的上下文来源应以公开起点和 Forum DM 历史为主，不能借入口便利变成普通聊天的私密事实旁路。

## 推荐实施顺序

1. **Phase 1 — Forum DM Adapter（必须）**：只新增 `ForumDirectMessagePromptAdapter`，把现有已验证 relation scope 的认知快照做安全投影；无 Context 时保持旧 Prompt 兼容。
2. **Phase 2 — 公开 Forum Context 形式化（必须先于公开接入）**：把现有 `buildForumPublicSafeContext` 形式化为公开专用类型/Policy，明确其不是通用 CharacterCognitiveContext，也为 topic seed 设置信息敏感度规则。
3. **Phase 3 — Public post/reply Adapter（建议）**：接入 A、B 两个公开 Adapter，保持既有 Prompt 文本和 AI 协议，只改上下文的安全入口。
4. **Phase 4 — 公开去重与时间策略（建议）**：在公开发布记录上建立近期主题摘要、事件发生时间校验和角色作息策略；不要由 Forum 直接创建关系成长状态。
5. **Phase 5 — Event 公开可见性标记（可延后）**：为 CharacterEvent 建立更精细的“可公开论坛引用”级别，避免把仅适合私信的 safe event 放进公共场景。

## 不建议的做法

- 不要让公开帖子/回复复用 ChatPromptAdapter、DiaryPromptAdapter 或完整 `CharacterCognitiveContext`。
- 不要以 `characterId` 或显示名称单独恢复 Forum DM 关系。
- 不要把 OfflineStory、InnerVoice、私聊 Memory 当作公开帖子或楼主更新的事实来源。
- 不要让自动活动在生成成功前写入 CharacterEvent；发布成功与可见时间是不同阶段。
- 不要把公开论坛的“风格提示”升级为角色已经经历过某件事的证据。

## 审计结论

Forum 已经有较好的身份/关系校验和公开文本脱敏基础，尤其是 Forum DM 的 `relationId + userIdentityId + characterId` 二次校验。当前主要缺口不是简单的 ID 隔离，而是缺少**场景化的认知投影**：公开 Forum 需要比 Chat 更严格的公开 Adapter，Forum DM 则需要比 Chat 更窄的私信 Adapter。按上述顺序接入，才能在不泄露私密关系事实的前提下补齐角色人设、时间与知识边界。
