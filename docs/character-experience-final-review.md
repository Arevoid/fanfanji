# Character Experience Final Review

## 1. 评审口径

本评分基于当前源码、认知入口审计、Memory 完整性审计、30 天桌面模拟和现有自动化测试。分数评价的是“用户当前实际可能获得的稳定体验”，不是类型、Policy 或设计文档中已经预留但尚未形成生产闭环的能力。

评分含义：

| 分数 | 含义 |
|---|---|
| 9–10 | 长期稳定、边界清晰，仅有低概率或体验级瑕疵 |
| 7–8 | 主链可靠，有少量明确缺口，不影响大多数使用 |
| 5–6 | 基础可用，但长期或跨入口时会明显不一致 |
| 3–4 | 核心体验不稳定，需要用户频繁纠正 |
| 1–2 | 基本无法形成可信体验 |

风险等级：

- **P0**：可造成跨关系/公开泄露或永久虚假认知，阻断可信长期体验。
- **P1**：会显著破坏事实、关系或人格连续性，应优先修复。
- **P2**：稳定性或自然度问题，不一定破坏数据边界。
- **P3**：局部体验优化。

## 2. 总评分

| 维度 | 当前评分 |
|---|---:|
| 人格一致性 | 6.5 / 10 |
| 记忆准确性 | 4.5 / 10 |
| 关系连续性 | 5.5 / 10 |
| 情绪连续性 | 4.5 / 10 |
| 主动行为自然度 | 5.5 / 10 |
| 朋友圈真实性 | 7.0 / 10 |
| 日记真实性 | 5.5 / 10 |
| 论坛表现 | 6.0 / 10 |
| 线下剧情隔离 | 8.0 / 10 |
| 世界书遵循 | 6.0 / 10 |
| Memory 可靠性 | 4.0 / 10 |
| 长期陪伴感 | 5.5 / 10 |

**综合评分：5.7 / 10。**

当前系统已经从“各页面独立拼 Prompt”进入“有 Context、Adapter、Policy 和 relation scope 的角色架构”阶段。短期单聊体验可以达到中上水平，Moments 和 OfflineStory 边界也有明显进步；但 Memory 真实性、关系投影运行闭环、跨入口一致性和长期遗忘仍不足，使 30 天以上的陪伴体验无法稳定达到“可信”。

## 3. 分项评审

### 3.1 人格一致性

**当前评分：6.5 / 10**

**已有能力**

- Character persona 已进入 CharacterCognitiveContext，并由多个 Adapter 做精简投影。
- Chat、Moment、Proactive、Diary、Forum DM/Public Forum 均已有不同程度的人设输入。
- Knowledge Boundary 可以限制虚构共同场景和未知信息。

**问题**

- Direct Chat 主回复仍有旧 persona/Memory/WorldBook 拼接与 Adapter 补充块并存，权威来源不唯一。
- Regenerate、Group Chat、Music、部分特殊消息的上下文链与主 Chat 不完全一致。
- Group Chat 在一个大 Prompt 中控制多个角色，容易交换语言风格。
- Character 的 personality/backstory 是自由文本，没有稳定的“核心不可漂移项”投影版本。

**代码位置**

- `src/components/AppChat.tsx`
- `src/domain/characterCognitive/contextBuilder.ts`
- `src/features/characterCognitive/promptAdapters/chatPromptAdapter.ts`
- `src/domain/prompt/PromptComposer.ts`
- `src/features/music/services/dualMusicRecommendationService.ts`

**风险等级：P1**

**优化建议**

1. 让主回复、重新生成、特殊消息、Music 和 Group Chat 都使用场景专用 Context → Adapter。
2. 定义不可漂移 persona core：身份、职业、稳定偏好、语言禁忌、世界规则优先级。
3. 为 Group Chat 按成员分别构建认知投影，不共享 Character legacy memory。
4. 增加同一角色跨 Chat/Music/Forum/Diary 的 persona contract test。

### 3.2 记忆准确性

**当前评分：4.5 / 10**

**已有能力**

- MemoryRetriever 精确按 `characterId + relationId` 过滤。
- OOC Memory 强制 relationId。
- OfflineStory 同步已有 Fact Policy。
- Immediate Summary 不再使用 character-only fallback。

**问题**

- 用户消息与角色回复被等价送入提取模型；角色自己的幻觉可能成为 Memory。
- 没有区分事实、计划、假设、愿望、否定和纠正。
- 没有 source message IDs、事实状态、置信度、用户确认和 supersedes。
- OOC 纠正会追加文本，但不会废止原错误事实。
- 多事实被压入一个自由文本块，难以逐项验证。

**代码位置**

- `src/domain/memory/MemoryExtractor.ts`
- `src/domain/memory/memoryTypes.ts`
- `src/domain/memory/oocMemory.ts`
- `server.ts` 的 `/api/extract-memories`
- `src/utils/apiHelper.ts`

**风险等级：P0**

**优化建议**

1. 新增结构化 MemoryClaim：source、assertedBy、claimType、truthStatus、occurredAt、confidence、userConfirmed。
2. 角色回复不能独立证明共同经历；计划和假设默认不得成为 completed fact。
3. OOC、消息删除和重生成按来源标记 disputed/superseded。
4. AI 提取改为 schema 输出并引用证据消息。

### 3.3 关系连续性

**当前评分：5.5 / 10**

**已有能力**

- CharacterEvent、RelationshipState Projection、RelationshipTimeline 已建立。
- Projection 禁止 inferred/低置信事件自动升级关系。
- Chat/Proactive Adapter 支持 stage、tone、openLoops、boundaries 和 safe timeline events。
- 删除关系时已有较完整的级联清理。

**问题**

- State/Timeline 基础能力与生产运行时供数之间仍有落差；Adapter 支持不代表每次生成都收到数据。
- 确定性事件来源较少，主要是关系创建和已确认 OfflineStory 完成。
- `CharacterRelationship.compressedMemory` 与新的 Event/Timeline 并存，可能产生两套关系叙述。
- 部分场景仍使用 Character 级 legacy compressedMemory。

**代码位置**

- `src/domain/characterLife/relationshipProjection.ts`
- `src/domain/characterLife/relationshipTimelineQuery.ts`
- `src/features/characterCognitive/promptAdapters/chatPromptAdapter.ts`
- `src/features/characterCognitive/promptAdapters/proactivePromptAdapter.ts`
- `src/domain/relationship/characterRelationship.ts`
- `src/components/AppChat.tsx`

**风险等级：P1**

**优化建议**

1. 建立统一 application service，从当前 relation 的 Events 重建 State/Timeline 并供给所有私域 Context。
2. 明确 CharacterRelationship 与 RelationshipState 的职责，逐步把 compressedMemory 降级为可重建摘要。
3. 扩展确定性事件捕获，但继续禁止普通聊天自动升级 stage。
4. 增加刷新后 relation state 重建和 openLoop 完成测试。

### 3.4 情绪连续性

**当前评分：4.5 / 10**

**已有能力**

- RelationshipState tone 支持 neutral、strained、repairing、warm 等投影效果。
- conflict、repair、care_shown 等规则具备基础表达能力。
- InnerVoice 独立保存，不会直接污染外部事实。

**问题**

- 情绪状态没有稳定的生产事件来源和持久化投影闭环。
- 普通聊天中的情绪变化主要依赖最近消息，刷新、压缩或跨应用后容易丢失。
- Diary、Proactive、Chat 可能分别理解同一冲突，缺少统一当前情绪快照。
- 不应外流的 InnerVoice 与应持续的 tone 之间缺少明确转换策略。

**代码位置**

- `src/domain/characterLife/relationshipProjection.ts`
- `src/domain/characterLife/relationshipStateTypes.ts`
- `src/domain/prompt/innerVoicePrompt.ts`
- `src/features/chat/services/innerVoiceService.ts`
- `src/features/characterCognitive/promptAdapters/diaryPromptAdapter.ts`

**风险等级：P1**

**优化建议**

1. 只从明确 conflict/repair/boundary/care 事件投影长期 tone。
2. 建立短期情绪与长期关系 tone 的分层，避免一句话永久改变关系。
3. Chat、Diary、Proactive 使用同一 scope-matched state snapshot。
4. InnerVoice 保持私密，只允许显式业务事件影响 RelationshipState。

### 3.5 主动行为自然度

**当前评分：5.5 / 10**

**已有能力**

- Proactive Prompt Adapter 支持 persona、关系上下文、safe events、Routine 和 Topic Context。
- Topic History、Routine 均有纯函数基础层。
- openLoops 被定义为候选话题，不自动视为已完成。
- 调度、cooldown 和生成认知被刻意分离。

**问题**

- Routine/Topic History 是否在生产入口持续供数和持久化仍需确认。
- 没有事件或话题时，模型仍可能使用模板化问候。
- 旧 Character、compressedMemory、聊天记录与 Adapter 可能并行进入 Prompt。
- 关系冲突后的谨慎程度依赖 Timeline 是否真正构建。

**代码位置**

- `src/features/chat/services/proactiveMessageService.ts`
- `src/features/chat/services/proactiveCognitiveContext.ts`
- `src/features/characterCognitive/promptAdapters/proactivePromptAdapter.ts`
- `src/domain/characterLife/characterRoutine/`
- `src/domain/characterLife/proactive/`
- `src/components/AppChat.tsx`

**风险等级：P2（供数缺失时升为 P1）**

**优化建议**

1. 为 Routine、Topic History 建立明确 Repository 和发送成功后的追加闭环。
2. 没有合理主动理由时允许 SKIP，而不是强制生成。
3. 记录生成原因：event、openLoop、topic、routine，不保存私密 Prompt 明文。
4. 用 acquaintance/conflict/friend 三阶段做主动消息回归。

### 3.6 朋友圈真实性

**当前评分：7.0 / 10**

**已有能力**

- MomentPublicCognitiveContext 独立于 Chat、Relationship 和 Public Forum Context。
- deny-by-default；safe 不等于 public。
- Moment Prompt 输入已移除私聊、Memory、Relationship、InnerVoice、OfflineStory 等私域来源。
- Adapter 支持有限公开历史、公开事实、public event、时间和主题提示。
- 自动 Moment 不再写关系 Memory。

**问题**

- Topic History/Routine 的生产供数和持久化闭环不确定，重复与“今晚/月亮”时间错位仍可能复发。
- Moment service 保留无 publicContext 的兼容路径，未来调用者仍可绕过。
- 公开事实授权目前主要靠调用方候选标记，缺少统一公开事实 Repository。

**代码位置**

- `src/domain/momentCognitive/`
- `src/features/characterCognitive/promptAdapters/momentPromptAdapter.ts`
- `src/features/moments/services/momentGenerator.ts`
- `src/features/moments/services/momentCommentService.ts`
- `src/features/moments/services/momentReplyService.ts`
- `src/domain/moments/momentGeneration/`

**风险等级：P2**

**优化建议**

1. 让 production Moment 入口类型上强制 publicContext，兼容路径仅限明确测试/legacy。
2. 持久化 topic history，并在成功发布后追加标准化主题。
3. 真正传入 Routine，增加上午/夜间行为契约测试。
4. 无新鲜公开内容时允许 SKIP。

### 3.7 日记真实性

**当前评分：5.5 / 10**

**已有能力**

- Diary 作者、identity、relation 和 conversation 有明确字段。
- Diary Prompt Adapter 排除 Memory 原文与 InnerVoice，强调只使用已确认事实。
- Routine 可以作为生成参考。
- 无 cognitiveContext 时保留兼容路径。

**问题**

- 原 buildDiaryPrompt 仍使用 Character、Relationship 和最近消息；Adapter 并非唯一事实入口。
- 最近聊天中的计划、假设和 AI 自述可能被写成“今天发生的事”。
- Routine/Timeline 在生产构建时是否传入不稳定。
- 自然语言约束无法替代结构化事实验证。

**代码位置**

- `src/components/AppDiary.tsx`
- `src/features/diary/services/diaryGenerationService.ts`
- `src/domain/prompt/diaryPrompt.ts`
- `src/domain/prompt/diaryContext.ts`
- `src/features/characterCognitive/promptAdapters/diaryPromptAdapter.ts`

**风险等级：P1**

**优化建议**

1. 将日记事实输入收敛为 Diary 专用 Context，区分 completed facts 与 plans。
2. 最近消息只作为“谈话内容”，不能自动视为经历证据。
3. 对 Diary 输出做计划/事实冲突检查。
4. 增加作者身份、刷新持久化、对方日记不可编辑测试。

### 3.8 论坛表现

**当前评分：6.0 / 10**

**已有能力**

- Forum DM 有专用私域 Adapter 和 owner/relation/identity 校验。
- Public Forum 有 Public Context 及 Post、Reply、Activity Adapter。
- Public Adapter 明确拒绝 Relationship、Memory、Forum DM、InnerVoice 和 OfflineStory 私密内容。
- 公开回复不应创建私人关系副作用。

**问题**

- 旧 `buildForumRelationGenerationContext` / `buildForumPublicSafeContext` 仍可能从私域 compressedMemory、聊天、Memory、WorldBook 派生 topic seed。
- Public Context 不是所有论坛生成路径的唯一输入。
- “楼主更新”和活动链路复杂，容易并列注入旧 promptContext。

**代码位置**

- `src/features/forum/services/forumGenerationService.ts`
- `src/features/forum/services/forumActivityService.ts`
- `src/features/forum/services/forumDmService.ts`
- `src/domain/forum/forumContentSafety.ts`
- `src/features/characterCognitive/promptAdapters/publicForum*PromptAdapter.ts`
- `src/features/characterCognitive/promptAdapters/forumDirectMessagePromptAdapter.ts`

**风险等级：P0（公开私域 topic seed）/P2（普通表现）**

**优化建议**

1. 完全删除 Public Forum 对 relation private topic seed 的生产依赖。
2. Public Context 成为发帖、回复、活动、楼主更新的唯一角色知识源。
3. DM 与 Public Forum 入口在类型和测试上彻底分开。
4. 增加私聊敏感主题不得出现在公开帖子标题/摘要的泄露测试。

### 3.9 线下剧情隔离

**当前评分：8.0 / 10**

**已有能力**

- Fact Policy 默认认为 OfflineStory 不是现实事实。
- 只有显式确认、continue、当前 relation、单角色、有用户贡献时允许同步。
- IF、director、AI-only、多角色无 participant scope 均拒绝。
- Event Policy 与 Capture Service 在 Memory 成功持久化后才创建幂等 completed event。
- canonical marker 支持替换旧 handoff。

**问题**

- AI 提取与正则 handoff 仍可能误判否定、提议、角色方向。
- 用户点击同步确认的是批次，不是逐条事实。
- 多角色故事没有持久化 participantRelationIds，只能安全拒绝，无法正确同步。
- deterministic fallback helper 仍存在，未来误接可能绕开严格失败策略。

**代码位置**

- `src/domain/offlineStory/offlineStoryFactPolicy.ts`
- `src/domain/offlineStory/offlineStoryEventPolicy.ts`
- `src/domain/memory/offlineMemorySync.ts`
- `src/features/characterLife/services/offlineStoryEventCaptureService.ts`
- `src/components/AppOffline.tsx`

**风险等级：P2**

**优化建议**

1. 同步前展示结构化候选事实，由用户逐项确认。
2. 事实必须绑定 source message IDs，正则只作候选而非权威。
3. 在设计好 participantRelationIds 前继续拒绝多人事实化。
4. 保持 Memory 成功后才创建 Event 的顺序。

### 3.10 世界书遵循

**当前评分：6.0 / 10**

**已有能力**

- Character/global WorldBook 已广泛用于 Chat、OfflineStory、Music、Forum 等场景。
- Public Cognitive Context 要求世界知识显式 public 才可进入。
- Knowledge Boundary 可在 Prompt 中提示角色知道/不知道什么。

**问题**

- WorldBook scope 主要是 global/characterId，没有 relationId、userIdentityId 和统一 public/private visibility。
- 如果把用户 A 的共同经历写入角色专属 WorldBook，用户 B 也可能读取。
- 各入口自行匹配/拼接 WorldBook，优先级和冲突规则不统一。
- Character 设定、WorldBook 与用户当前输入冲突时，主要依赖 Prompt 文本约束。

**代码位置**

- `src/components/AppWorldBook.tsx`
- `src/domain/worldbook/`
- `src/components/AppChat.tsx`
- `src/components/AppOffline.tsx`
- `src/domain/forum/forumContentSafety.ts`

**风险等级：P1**

**优化建议**

1. 增加用途/visibility 分类：canonical、public、private-reference、relation-prohibited。
2. 明确优先级：系统边界 > canonical Character/WorldBook > 已确认 Event/Memory > 用户当前未确认主张。
3. 禁止关系私密事实写入 character-wide WorldBook。
4. 统一 WorldBook Resolver，再由各场景 Adapter 获取安全投影。

### 3.11 Memory 可靠性

**当前评分：4.0 / 10**

**已有能力**

- Repository 统一 localStorage key。
- 检索 relation 隔离正确。
- 精确文本去重和 Offline marker 去重存在。
- 角色/关系/Moment 删除有部分清理。

**问题**

- Repository 整数组读写，无 schema validation、事务、revision 或 atomic append。
- AppChat 部分异步提取使用旧闭包数组，可能丢写或让删除复现。
- 去重只比较规范化全文，不处理语义重复和冲突。
- timestamp 项可能显著主导检索，而 importance 权重很弱。
- 无 query 时依赖数组顺序。
- 删除/编辑来源消息不能失效派生 Memory。

**代码位置**

- `src/core/storage/repositories/memoryRepository.ts`
- `src/domain/memory/MemoryService.ts`
- `src/domain/memory/MemoryDeduplicator.ts`
- `src/domain/memory/MemoryRetriever.ts`
- `src/components/AppChat.tsx`
- `src/components/AppMemory.tsx`

**风险等级：P0/P1**

**优化建议**

1. Repository 改为原子 append/update/remove，并加入 schema/version/scope 校验。
2. 所有异步保存基于最新 state 或事务 revision。
3. 逐 claim 去重与冲突状态替代整块文本精确去重。
4. 归一化 relevance、recency、importance，空查询显式排序。
5. 增加来源删除、并发保存和压缩等价测试。

### 3.12 长期陪伴感

**当前评分：5.5 / 10**

**已有能力**

- 产品已经具备 Chat、Moment、Diary、Forum、Music、OfflineStory、Memory、WorldBook 等丰富互动表面。
- relation isolation、CharacterEvent、Timeline、Routine、Topic History 为长期成长提供了正确方向的基础层。
- 主动消息、日记、朋友圈和线下剧情能形成“角色在生活”的体验。

**问题**

- 重要事实可能记错，小事可能长期不忘；这会直接削弱信任。
- 关系和情绪基础设施尚未完全变成每次生成都可见的运行状态。
- 不同入口的人格和认知链不完全一致，用户会感觉“换了一个人”。
- Topic/Routine 未形成稳定闭环时，主动行为和朋友圈容易模板化。
- 用户纠正错误后，系统无法可靠撤销旧认知。

**代码位置**

- 该维度跨越 `src/components/AppChat.tsx`
- `src/domain/characterLife/`
- `src/domain/characterCognitive/`
- `src/domain/memory/`
- `src/domain/momentCognitive/`
- `src/features/characterCognitive/`

**风险等级：P1**

**优化建议**

1. 优先修复 Memory 真实性与可撤销性，而不是继续增加更多生成入口。
2. 打通 Event → State → Timeline → Context 的生产闭环。
3. 收口所有 AI 入口到场景专用 Adapter。
4. 让 Routine/Topic History 有明确持久化和成功后更新机制。
5. 用 30 天寿命测试作为发布门禁，长期事实必须可解释来源。

## 4. 体验优势

当前最值得保留的架构决策：

1. **relationId 读取隔离**：Memory/OOC/Cognitive Context 的 A/B 身份隔离基础可靠。
2. **public deny-by-default**：Moment 和 Public Forum 已明确 safe 不等于 public。
3. **OfflineStory Fact/Event Policy**：虚构叙事与现实认知之间已有实际门禁。
4. **CharacterEvent 与投影分离**：长期关系没有被设计成好感度、经验值或自动等级系统。
5. **Routine 与调度分离**：作息只影响表达参考，不暗中改变发送机制。
6. **Topic History 不是 Memory**：多样性控制没有污染角色事实层。

这些基础使系统无需推倒重来。当前问题主要是生产闭环、来源真实性和遗留入口收口。

## 5. 最终优化优先级

### 第一优先级：恢复长期信任

1. 结构化 MemoryClaim 与证据来源。
2. 禁止角色自述独立证明共同经历。
3. 区分计划、假设、已发生、否定和纠正。
4. 修复并发整数组保存与来源失效。
5. 移除 Public Forum 私域 topic seed。

### 第二优先级：形成关系生命闭环

1. 生产运行时统一构建 RelationshipState/Timeline。
2. 让 Chat、Proactive、Diary、Forum DM 使用同一当前关系快照。
3. 扩展确定性事件来源，保持用户确认和不自动升级原则。
4. 将 compressedMemory 降级为可重建派生摘要。

### 第三优先级：统一跨应用人格

1. 收口 regenerate、Group Chat、Music 和特殊消息。
2. 建立 WorldBook Resolver 和明确冲突优先级。
3. 为 persona core 增加跨入口契约测试。

### 第四优先级：提升生活感

1. 持久化 Routine/Topic History。
2. 没有合理内容时允许主动消息和 Moment SKIP。
3. 通过主题冷却、关系阶段和当前状态改善表达，而不是增加随机模板。

## 6. 最终结论

当前角色系统的核心优势是“边界意识已经建立”：关系隔离、公开/私密区分、虚构剧情出口、事件投影和场景 Adapter 都有了清晰方向。核心弱点则是“长期事实仍不够可信”：Memory 无法证明来源和事实状态，关系/情绪投影尚未完全成为所有生成入口的运行时真相。

因此，当前体验最适合定义为：

> **短期互动丰富、主链人格基本稳定、隐私边界逐步可靠，但长期记忆和跨应用连续性尚未达到高可信陪伴标准。**

若完成 P0 Memory 真实性、Public Forum 私域出口和 P1 Relationship Runtime 闭环，综合评分预计可从 5.7 提升到约 7.5；在此之前，继续增加应用数量的边际价值低于修复现有认知一致性。
