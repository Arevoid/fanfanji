# Public Forum Cognitive Context 审计与设计

审计日期：2026-08-01
范围：公开 Forum 的帖子、公开回复、楼主更新、计划活动和自动活动。Forum 私信、Chat 和 Moments 不在本次范围内。

## 结论

公开 Forum 不能直接使用 `CharacterCognitiveContext`，也不能复用 Chat、Diary、Proactive 的 Prompt Adapter。它是一个**公开可见内容域**：即使一个事实已在某个关系范围内是 safe，也不等于它可以被公开帖子、公开评论或楼主更新引用。

当前实现已经具备有效的公开防线：按 `ownerIdentityId` 筛选关系、只按 `relationId + conversationId` 读取源数据、将原文压缩为话题种子、保护姓名并验证生成内容。不过，公开上下文仍由私聊、Memory 和 WorldBook 的内容派生；这些来源没有显式公开可见性分类，也没有事件事实锚点。因此下一阶段应建立独立 `PublicForumCognitiveContext`，而不是把现有私有认知快照直接送进公共 Prompt。

## 当前公开 AI 入口地图

```text
AppForum
├─ 首页首次加载 / 手动刷新
│  └─ forumGenerationService.generateForumThreads
│     └─ buildThreadPrompt → apiChat → parse/validate → ForumThread / ForumReply
├─ 用户发帖后的初始公开互动
│  └─ forumActivityRuntime.scheduleInitialForumReplies
│     └─ forumActivityService.planForumActivity
│        └─ public-only activity Prompt → apiChat → pending events → release
├─ 帖子手动刷新 / 点赞互动
│  ├─ forumGenerationService.generateThreadActivity
│  │  ├─ buildReplyPrompt → apiChat → ForumReply
│  │  └─ author-update Prompt → apiChat → ForumReply(author-update)
│  └─ forumActivityRuntime.forceForumThreadActivity
│     └─ planForumActivity → pending events → release
└─ 自动公开活动
   └─ forumActivityRuntime.runAutomaticForumActivityCheck
      └─ planForumActivity → pending events → release
```

补充：`generateInitialRepliesForUserThread` 仍存在于 `forumGenerationService`，但 `AppForum` 当前用户发帖后的实际路径已优先使用 `scheduleInitialForumReplies` 的活动计划/释放机制。用户自行发帖和自行回复是确定性本地数据操作，不调用 AI。

## 当前数据来源与边界

### 公开关系角色生成上下文

`buildForumRelationGenerationContext` 是公开生成的核心入口。对每个候选 Relationship：

1. 先验证 `relationship.userIdentityId === ownerIdentityId`。
2. 解析 canonical `characterId`，并排除群聊和联系人实例。
3. 只读取同一 `relationId + conversationId` 的最近 16 条 Message。
4. 只读取同一 `relationId` 的最多 8 条 Memory。
5. 读取该角色专属或 `global` 的最多 8 条启用 WorldBook 条目。
6. 调用 `buildForumPublicSafeContext` 把以上内容转换为“公开表达风格”和“可参考话题类别”。

| 数据 | 当前是否读取 | 进入 AI Prompt 的形式 | 当前保护 |
| --- | --- | --- | --- |
| Character | 是 | `publicReplyPersona`、公开风格 | 人设/背景行经过姓名保护过滤 |
| Relationship | 是 | 不直接输出 relationship 数据；用于选作者、筛选数据 | `ownerIdentityId` 与 relation scope 校验 |
| Message | 是 | 仅抽取话题 token/类别 | 不传原始消息文本 |
| Memory | 是 | 仅抽取话题 token/类别 | 不传原始 Memory 文本 |
| WorldBook | 是 | 仅抽取话题 token/类别 | 不传原始 WorldBook 文本 |
| CharacterEvent | 否 | 无 | 无公开事实锚点 |
| InnerVoice | 否 | 无 | 未发现公开 Forum 读取入口 |
| 时间 | 是 | `now`、帖子/回复发生时间、计划延迟 | 主要保证排序与调度 |
| 用户身份 | 是 | 内部 `ownerIdentityId` 选取当前数据；受保护姓名集合 | 不应写入 Prompt |

`FORUM_PUBLIC_TEXT_RULES`、`findForumPrivateNameViolation` 和候选验证会阻止内部 ID、私人姓名/昵称、可识别细节、私聊/Memory/WorldBook 原句及无关回复。储存时还会对生成文本做清洗与公开性检查。

## 分场景链路与风险

### 1. 公开帖子生成

**链路：** `AppForum` 懒加载/刷新 → `generateForumThreads` → `buildThreadPrompt` → `apiChat`。

角色来源由 `DEFAULT_FORUM_POST_AUTHOR_POLICY` 在虚拟用户与关系角色间选择。关系角色的 prompt 使用 `ForumRelationContext.promptContext`；虚拟用户只使用自己的虚拟公开风格，并被 Prompt 明确禁止读取聊天、Memory 和 WorldBook。

**已有保护：**

- 关系候选先按当前身份过滤。
- 匿名关系角色不在公开文本中暴露真实角色名。
- 使用作者冷却、fingerprint 和重复检测。
- 生成后用受保护姓名、内容相关性和时间线校验拦截候选。

**风险：**

- 私聊/Memories/WorldBook 虽不传原文，但分类 token 仍可能暴露敏感领域，如健康、家庭、工作、近期地点或特殊兴趣。
- “话题倾向”没有表达为非事实证据，模型可能把它扩写为“刚刚发生的公开经历”。
- WorldBook 只有角色/global 过滤，没有公开可见性字段；global 也可能包含不该公开的背景。
- 只有发布时间偏移，没有角色作息或自然语言时间约束。

### 2. 公开评论、回复与评论回复

Forum 的评论式内容统一为 `ForumReply`。`buildReplyPrompt` 只给模型当前公开帖及最近公开回复（最多 12 条），并对关系角色附加脱敏后的 `publicReplyPersona`；虚拟用户仅获得虚拟公开风格。

**链路：**

- 用户帖初始互动：`scheduleInitialForumReplies` → `planForumActivity` → `apiChat` → 计划事件释放。
- 直接生成初始回复的旧 service：`generateInitialRepliesForUserThread` → `buildReplyPrompt` → `apiChat`。
- 手动互动：`generateThreadActivity` → `buildReplyPrompt` → `apiChat`。

**已有保护：**

- 只允许引用实际存在的楼层。
- 回复必须和公开帖/目标回复有 token 相关性。
- 不允许输出内部 ID、作者真实身份或私密数据。
- `privateActor` 只用于存储、后续路由与清理，不应进入公开 Prompt。

**风险：**

- 关系角色选择仍使用私有来源生成的 topic seed；公开回帖可能以“风格”之名暗示私人经历。
- 当前无“已公开过的主题摘要”输入，冷却和精确重复校验不能处理语义重复。
- 没有 Event 事实过滤，无法区分“可以评论一个公共话题”与“可以声称自己刚经历过某事”。

### 3. 楼主更新

楼主更新是 `ForumReply(kind = "author-update")`，而不是修改 `ForumThread` 正文。

**链路：** `generateThreadActivity` 的 thread-author 分支，或 `planForumActivity` 中 `author-update` 计划事件 → author-update Prompt → `apiChat` → 校验 → 回复记录 → `applyForumStoryUpdate` 更新公开 story arc。

模型只获得公开帖子和公开回复历史。对于真实关系楼主，恢复原作者时使用 `privateAuthorRelationId` 与私有 character ID 对照已按当前身份构建的有效 relation context；对于虚拟楼主则不存在 Relationship。

**风险：**

- 楼主更新天然带有连续叙事倾向，在没有事件事实锚点时最容易把合理推测写成已发生的后续。
- `storyArc` 仅是公开内容连续性，不应被解释为 CharacterEvent、线下经历或关系状态变化。
- 目前没有公开事实的发生时间、置信度或可见范围约束。

### 4. 自动公开活动

`planForumActivity` 用一次 public-only AI 调用生成 1–4 个待发布事件，`forumActivityRuntime` 再按延迟释放。Prompt 只提供公开帖子、公开回复和可用 actor slot 的公开显示名/安全风格。

**已有保护：**

- `ownerIdentityId` 必须匹配帖子。
- actor slot 白名单、角色冷却和发布频率限制。
- 生成前/释放前都校验楼层、作者、私密姓名和相关性。
- 计划事件本身不直接写 CharacterEvent。

**风险：**

- 公开角色槽位的安全风格仍由关系上下文派生，缺少明确的公开来源分类。
- 自动活动只有最多五分钟延迟和任务退避，不包含行为时间合理性。
- 公开内容重复主要靠 token/频率控制，缺少语义级去重或“近期已用公开主题”状态。

### 5. 其他公开 AI 内容

`forumTranslationService` 会翻译用户当前查看的公开论坛文字。它不生成角色行为、不会建立角色认知，也不应接入 `PublicForumCognitiveContext`。公开分享快照、通知、点赞和浏览记录均为本地数据流程，不是 AI 生成入口。

## 重点风险审计

| 风险 | 当前状态 | 风险等级 | 说明 |
| --- | --- | --- | --- |
| 私密关系泄露 | 有防护但非结构化 | P1 | relation/identity 过滤正确，但 topic seed 由私有内容派生 |
| 私聊原文进入公开内容 | 当前未发现直接传入 | P1 | 仅传 topic 类别；未来直接复用私有 Context 会造成 P0 |
| 私密 Memory 泄露 | 当前未传原文 | P1 | 类别化 token 仍可能语义泄露 |
| InnerVoice 泄露 | 当前未发现读取路径 | P0 防线必须保持 | 未来 Public Context 必须显式排除 |
| 多身份污染 | 主要防护完备 | P1 | generation/activity 都有 `ownerIdentityId` 过滤；不得改成 characterId-only |
| 虚构公开经历 | 缺少事实边界 | P1 | 话题种子和 story continuation 容易被模型叙事化 |
| WorldBook 私密设定泄露 | 存在模型层缺口 | P1 | 没有 public visibility 分类；不能只依赖提示词 |
| 时间线/作息错误 | 存在 | P2 | 时间仅作为排序、调度和文本上下文的间接输入 |
| 重复公共内容 | 有部分缓解 | P2 | fingerprint/cooldown 不能充分阻止语义近似 |

## `PublicForumCognitiveContext` 设计

### 与 `CharacterCognitiveContext` 的根本区别

| 维度 | CharacterCognitiveContext | PublicForumCognitiveContext |
| --- | --- | --- |
| 信任域 | 当前关系内的私有、受控认知 | 面向任意 Forum 读者的公开内容 |
| Memory | 可含 relation-scoped known facts，由场景 Adapter 决定投影 | 永不包含原始 Memory 或私有事实 |
| Event | 可含 relation-safe event，仍需场景筛选 | 默认不包含；仅未来显式 `public-forum` 可见事件可入场 |
| Relationship | 包含 relationship projection | 仅作为内部选角与隔离依据，绝不输出给 Prompt |
| WorldBook | 可用于私有场景的 context 构建 | 仅允许显式公开分类的主题/体裁，不可用原文 |
| IDs | Snapshot 内可含 scope，Adapter 再剥离 | Context 本身也应避免公开暴露；内部 scope 只用于构建/校验 |
| 目标 | 角色在当前关系中“知道什么” | 角色在公共论坛“可以公开表达什么” |

### 建议核心类型

```ts
interface PublicForumCognitiveContext {
  schemaVersion: 1;
  createdAt: number;
  // 仅内部构建与验证使用，任何 formatter 都不得输出。
  internalScope: {
    ownerIdentityId: string;
    authorKind: "relationship" | "virtual";
    relationId?: string;
    characterId?: string;
  };
  publicPersona: {
    displayName?: string;
    isAnonymous: boolean;
    styleLines: readonly string[];
    prohibitedNames: readonly string[];
  };
  publicTopics: readonly {
    label: string;
    sourceClass: "public-worldbook" | "sanitized-topic" | "forum-history";
    confidence: number;
  }[];
  publicThread?: {
    title: string;
    body: string;
    replies: readonly PublicForumReplyExcerpt[];
    storyContinuationAllowed: boolean;
  };
  publicHistory: {
    recentTopicFingerprints: readonly string[];
    recentAuthorPosts: readonly string[];
  };
  time: {
    now: number;
    date: string;
    time: string;
    allowedPublishWindow?: "any" | "daytime" | "evening";
  };
  constraints: readonly string[];
}
```

`internalScope` 是构建期防错信息，而不是 Prompt 数据。Public Adapter 的类型应当不包含它，确保 formatter 无法意外输出 `ownerIdentityId`、`relationId`、`characterId` 或 `conversationId`。

### 允许来源

- Character：仅经过 `publicPersona` policy 过滤的人设表达风格。
- Forum：当前公开帖子、公开回复、已发布的公开 story arc、公开历史摘要。
- WorldBook：仅未来带有明确“公开可用”标记的条目主题/体裁；默认拒绝。
- 时间：当前时间与发布调度窗口；只约束公开表达，不创造事件。
- 关系：仅用于验证“此角色属于当前身份”，不作为 Prompt 内容。

### 明确禁止来源

- 任意 Message 原文、私聊摘要、私信历史、Forum DM 历史。
- 任意 Memory 原文、OOC Memory、离线剧情原文或摘要。
- InnerVoice、语音/图片/文件元数据、联系人实例信息。
- `CharacterCognitiveContext.knownFacts`、私有 relationship summary、一般 safe Event。
- 未明确为公开可见的 CharacterEvent、WorldBook、计划或推测事实。
- 任意内部 ID 与其他用户身份的内容。

## Adapter 设计建议

### `ForumPublicPostPromptAdapter`

输入：`PublicForumCognitiveContext`。输出仅包括公开 persona、允许话题类别、公开历史去重提示、时间和禁止规则。

它不能接受 `CharacterCognitiveContext` 作为参数，以避免调用方绕过公开转换层。现有 `buildThreadPrompt` 保持为任务/JSON 合同的权威；Adapter 只提供可安全追加的上下文块。

### `ForumReplyPromptAdapter`

输入：`PublicForumCognitiveContext` 加公开线程快照。输出包括公开 persona、当前公开帖、允许楼层、公开回复节选、发布节奏和禁止规则。

真实 relationship 角色与虚拟用户都应通过该同一公开类型获取表达素材；两者的区别只在 author kind 和 public persona，不能因为真实角色而获得更宽的私有事实权限。

### `ForumActivityPromptAdapter`

输入：公开线程和经过 Public Context 投影的 actor slots。输出仅提供 slot ID 的内部映射外的公开显示名、风格、当前公开线程、连续性窗口和延迟约束。

这个 Adapter 必须保证活动事件仍只成为 Forum 存储事件；发布成功不自动产生 CharacterEvent。未来若要记录公共行为，应由一个独立、明确的 `forum_public_content_published` 事件来源处理。

## 推荐实施顺序

1. **Phase 1：定义 Public Context 类型与 Policy（必须）**
   - 新增 Public Context 类型、构建输入和显式 deny-by-default 规则。
   - 将现有 `buildForumPublicSafeContext` 的“字符串脱敏”逻辑保留并迁移为结构化字段；不改变 Prompt 或生成行为。
2. **Phase 2：WorldBook/Topic 来源公开等级（必须）**
   - 定义哪些 WorldBook 条目或主题可用于 Public Forum；在没有标记前默认不从 WorldBook 取内容。
   - 为 topic seed 建立敏感类别拒绝/降级规则，避免把私人话题当公开经历。
3. **Phase 3：帖子与回复 Adapter 只读接入（建议）**
   - 分别接入 `ForumPublicPostPromptAdapter` 与 `ForumReplyPromptAdapter`。
   - 保持现有 Prompt 文本、AI 协议、存储结构和 UI 不变。
4. **Phase 4：自动活动 Adapter（建议）**
   - 用公开 actor slot 投影取代现有自由字符串拼接。
   - 保持待发布事件、冷却、退避和释放逻辑不变。
5. **Phase 5：公开去重与时间策略（可延后）**
   - 增加公开主题 fingerprint/摘要、作者近期内容窗口和自然语言时间检查。
   - 这应是生成质量优化，不是关系成长或 CharacterEvent 自动抽取。

## 不能做的接入方式

- 不要直接将 `CharacterCognitiveContext`、`ChatPromptContext`、`DiaryPromptContext` 或 Forum DM Adapter 的输出用于公开帖子/回复。
- 不要将 CharacterEvent 的 `safe` 视为默认公开；`safe` 仅表示可进入经过审计的私有场景。
- 不要以 `characterId` 或显示名反查关系，必须继续以当前 `ownerIdentityId` 下的 Relationship 作为选角边界。
- 不要把 `privateActor`、`privateAuthorRelationId` 或原始 WorldBook/Memory 当作 Prompt 文本素材。
- 不要让楼主更新或自动活动把公开 story arc 反向写入 Memory、OfflineStory 或 RelationshipState。

## 审计结论

当前公开 Forum 已经比普通内容生成更重视匿名、受保护姓名、身份隔离、公开相关性和活动调度；主要技术债不在“完全没有边界”，而在边界仍由字符串约束和隐式 topic 提取表达。建立 `PublicForumCognitiveContext` 后，公开内容的允许来源、禁止来源与事实等级将变得可测试、可审计，也能避免未来因复用私有认知 Adapter 而产生跨身份或私密关系泄露。
