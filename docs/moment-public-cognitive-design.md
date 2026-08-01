# Moment Public Cognitive Context 审计与设计

## 结论

朋友圈不是私聊的展示层，也不是公开论坛的同义词。它是一个**按用户身份拥有、面向该身份社交圈发布**的内容面：角色可以表达自己的公开人格、已确认可公开的个人动态和公开世界设定，但不能因为角色与某个用户存在关系，就把私聊、关系状态或共同经历变成可发布素材。

因此需要独立的 `MomentPublicCognitiveContext`。它不能直接复用 `CharacterCognitiveContext`（其本质是 relation-scoped private snapshot），也不能直接复用 `PublicForumCognitiveContext`（其受众是全站公开论坛、没有 Moments 的身份 feed 与发布授权语义）。三个上下文可共享基础可见性枚举或纯投影工具，但不共享数据契约。

## 当前链路审计

### 1. 角色自动发朋友圈

```
AppChat.tsx: checkAndTriggerCharacterMoments
  -> calculateCharacterMomentOccurredAt
  -> generateCharacterMoment
  -> PromptComposer.compose("moment-post")
  -> requestCharacterMomentOnce / requestCharacterMoment
  -> buildMomentPromptContext（补充块）
  -> apiChat
  -> Moment + relation-scoped Moment Memory
```

关键实现位置：

- `src/components/AppChat.tsx`：轮询资格、关系筛选、原始发帖 system instruction、最近动态历史和写入。
- `src/features/moments/services/momentGenerator.ts`：请求、内容清洗、时间冲突检查、相似度拒绝、幂等记录、生成 `Moment` 与对应 `MemoryItem`。
- `src/features/moments/services/momentGenerationGuard.ts`：每角色/关系/本地日期的 generation task 锁与状态。
- `src/features/moments/services/momentUniqueness.ts`：同一 `ownerIdentityId` feed 内最近角色动态的文本相似度检查。
- `src/features/moments/services/momentTemporalContext.ts`：发生时间、季节、节气、节日、生日与未来时间词冲突检查。
- `src/features/characterCognitive/promptAdapters/momentPromptAdapter.ts`：当前 public deny-by-default 的补充块。

当前 `Moment` 已有 `ownerIdentityId`、可选 `relationId` 与 `characterId`，因此存储与去重已经知道“这条动态属于哪个身份的 feed”；它**不是**发布授权，也不能据此推导公开权限。

### 2. 自动评论与评论回复

```
AppChat.tsx: handleAutoCommentOnUserMoment
  -> PromptComposer.compose("moment-comment")
  -> requestAutomaticMomentComment
  -> MomentPromptAdapter 补充块
  -> apiChat

AppChat.tsx: handleAutoReplyToUserComment
  -> PromptComposer.compose("moment-reply")
  -> requestMomentCommentReply
  -> MomentPromptAdapter 补充块
  -> apiChat
```

服务分别位于 `momentCommentService.ts` 与 `momentReplyService.ts`；两者都做文本清洗与 `findMomentTemporalConflicts()` 校验。评论/回复本身没有 relationId、ownerIdentityId 或 visibility 字段，当前由调用方和目标动态决定可见范围。

### 3. 用户手动发动态

用户发布由 `AppChat.tsx` / `MomentsApp.tsx` 的表单处理，不经 AI 角色生成，也不需要角色认知上下文。图、文字图、评论、点赞及删除是 UI/持久化职责，不能作为角色公开认知的自动输入。

## 现有 Public Context 与 Moments 的差异

| 维度 | `PublicForumCognitiveContext` | 未来 `MomentPublicCognitiveContext` |
| --- | --- | --- |
| 受众 | 公开论坛的所有读者 | 某 `userIdentityId` 的朋友圈 feed |
| 关系信息 | 默认完全禁止 | 默认完全禁止；只有显式“允许发布给此 feed”的授权摘要可用 |
| 事件来源 | `visibility: "public"` 的事件 | 角色公开事件 + 对该身份明确授权的共同经历摘要 |
| 历史内容 | 论坛帖子/回复 | 该身份 feed 内的已发布动态、已发布评论主题与发布时间 |
| 世界书 | 显式公开的世界设定 | 显式可用于朋友圈的世界设定；不应自动继承全量角色世界书 |
| 输出用途 | 帖子、回复、活动 | 动态、评论、评论回复；三者权限不同 |
| 身份隔离 | 不承载身份 | Builder 使用身份做授权检索，但 prompt DTO 不暴露身份 ID |

`PublicForumCognitiveContext` 的 deny-by-default policy 可作为实现参考，但不能成为 Moment 的直接输入类型：论坛“公开”不等于“适合某人的朋友圈”，而朋友圈也不能因为一个动态仅在某个身份 feed 中存在就把关系事实自动公开。

## 当前数据边界与风险

### 已正确具备的能力

- `Moment` 按 `ownerIdentityId` 保存；自动角色动态带 `relationId`。
- `calculateCharacterMomentOccurredAt()` 将发生时间与真实检查时刻分开，并根据最后动态、活跃时间、计划时间、同 feed 已占用时间选取时间。
- `formatMomentTemporalContext()` 明确禁止把未来时段、错误季节、节气、节日和生日写成当前事实；生成后仍由 `findMomentTemporalConflicts()` 拒绝冲突文本。
- `assessMomentUniqueness()` 在同一 identity feed 的角色动态中比较标准化文本，并拒绝完全重复或超过阈值的相似文本。
- `momentGenerationGuard.ts` 以 `relationId + local date` 为新任务键，避免同关系同日重复触发；`SKIP` 也会记录，避免立即重试。
- `momentPromptAdapter.ts` 已不再把 relation-scoped `safe` event 当成 public event；无显式 Public Context 时 public event / public world knowledge 均为空。

### 必须修复的输入边界（高风险）

当前 `AppChat.tsx` 的原始 Moment system instructions 仍直接注入以下私有数据；这发生在 Adapter 之前，所以 Moment Adapter 的 public deny-by-default **不能覆盖**它们：

1. 自动发帖：最近私聊、归档 Memory、历史聊天 fallback、用户资料、完整角色 WorldBook，以及“可写用户关系/最近互动”的任务规则。
2. 自动评论：最近私聊、用户资料、角色 WorldBook；其规则还要求隐晦引用最近聊天。
3. 评论回复：最近私聊、用户资料、完整 WorldBook、用户评论上下文。

这会造成私聊 Memory、共同经历、关系深度、世界书私密设定和用户资料进入一个被标记为 public-safe 的生成通道。它也是“角色公开动态编造共同经历”与“不同身份 feed 仍有私密内容”的主要风险，优先级高于继续扩展 Adapter 字段。

### 重复动态的剩余原因

文本相似度和同日任务锁只能在生成后/触发时兜底，不能解决语义重复：

- Prompt 提供的历史是最近 12 条 feed 动态，未归纳“主题、角度、开头、情绪结论、图像意图”；模型仍可能改写同一个主题。
- 去重只比较内容文本，未比较图片描述、自评、主题、角色日常习惯和跨天重复。
- 历史候选按 owner feed 聚合，有助于防止多个角色套同一模板，但没有“角色自己的发布配额/题材冷却”。
- 没有可发布事件时，旧原始 prompt 仍鼓励从私聊或泛化日常中产出；虽允许 `SKIP`，却没有在调用 AI 前做“是否有公开素材”的判定。

### 时间与作息的剩余原因

当前时间一致性强于作息一致性：

- 现有代码约束“何时发生”而不是“该角色通常何时会发布”。
- `scheduledProactiveTime`、`lastActiveTime` 只被用于推导较合理的发生时间，不代表可发布时段，也不应在本次设计中被改作调度状态。
- 没有独立的 `CharacterRoutine` / public availability 规则；角色可能在时间上不矛盾，但行为上不符合人设作息。

## 设计：MomentPublicCognitiveContext

建议目录：`src/domain/momentCognitive/`。该目录只放领域类型、可见性策略与纯 Builder；不得读取 localStorage、React 或 API。

```ts
type MomentAudience = "identity-feed" | "comment-thread";
type MomentVisibility = "public" | "identity-feed" | "private" | "unknown";

interface MomentPublicCharacterProfile {
  name: string;
  personality: string;
  backstory: string;
  publicPostingStyle?: string;
}

interface MomentPublicEvent {
  kind: string;
  summary: string;
  occurredAt: number;
  confidence: number;
  visibility: "public";
}

interface AuthorizedSharedMomentFact {
  summary: string;
  authorization: "user-explicit" | "both-parties-confirmed";
  publishedForAudience: "identity-feed";
  occurredAt?: number;
}

interface MomentPublicationHistoryItem {
  content: string;
  imageDescription?: string;
  occurredAt: number;
  topicFingerprint?: string;
}

interface MomentRoutineContext {
  localDate: string;
  localTime: string;
  period?: string;
  allowedToPublish: boolean;
  reason?: "routine" | "quiet-hours" | "not-enough-public-material";
}

interface MomentPublicCognitiveContext {
  audience: MomentAudience;
  publicCharacterProfile: MomentPublicCharacterProfile;
  publicEvents: readonly MomentPublicEvent[];
  authorizedSharedFacts: readonly AuthorizedSharedMomentFact[];
  publicWorldKnowledge: readonly { title: string; content: string }[];
  publicationHistory: readonly MomentPublicationHistoryItem[];
  temporalContext: { date: string; time: string; timezone?: string; period?: string };
  routine: MomentRoutineContext;
  publicBehaviorConstraints: readonly string[];
}
```

设计要点：

- Builder 内部可以用 `relationId` 和 `userIdentityId` 查找**授权记录**，但输出 DTO 永远不含这些 ID。
- `authorizedSharedFacts` 不是 `Memory` 的直接投影，也不是 `RelationshipTimeline` 的投影。它必须来自单独、明确且可撤销的发布授权。
- `publicEvents` 仅来自有 `visibility: "public"` 的独立候选；`safe`、`relationship`、省略 visibility、private 均拒绝。
- `publicationHistory` 是去重输入，不是角色事实；不得将其反向写入 Memory 或 CharacterEvent。
- `routine.allowedToPublish` 是内容资格建议，不改变现有 scheduler/cooldown。若为 false，未来生成器应直接 `SKIP`。

## 可公开与禁止的数据

### 可以进入动态生成 Prompt

1. 公开角色资料：姓名、公开人设、公开背景、经审计的发帖风格。
2. 显式 public 的角色事件：例如已公开发表、公开活动、明确公开的作品/爱好进展。事件摘要应避免把角色与用户绑定。
3. 显式 Moment-public 世界书：条目应拥有独立可见性，不应默认复用完整 WorldBook。
4. 当前本地时间、季节/节气等现实时间上下文。
5. 当前 feed 的已发布历史及其主题指纹，只用于“不要重复/不要改写”，不作为事实宣称来源。
6. 明确、可撤销的共同经历发布授权摘要；仅可作为灵感，不能扩写未授权的地点、动作、情绪或后续情节。

### 必须禁止

- `relationId`、`userIdentityId`、`conversationId`、event ID、版本、source metadata。
- 任意 `RelationshipState` / `RelationshipTimeline`、stage、tone、openLoops、boundaries。
- private 或 relationship-scoped CharacterEvent，哪怕其 private Chat adapter visibility 为 `safe`。
- Memory 原文、检索结果、OOC Memory、私聊消息、历史 fallback、用户资料、InnerVoice。
- OfflineStory 内容、导演/IF 剧情、未确认剧情、其摘要及其时间。
- 未经发布授权的共同经历；“角色知道”不能推出“角色可以公开说”。
- 全量 WorldBook；除非条目明确标注 Moment-public。
- 从角色关系、评论频率、点赞或用户表达中推断的好感、承诺完成、关系升级。

## 共同经历授权

默认值必须为拒绝。建议未来引入独立 `MomentPublicationAuthorization`（不改 `Memory`、`CharacterEvent` 或 `Moment` 本体）：

```ts
interface MomentPublicationAuthorization {
  id: string;
  ownerIdentityId: string;
  relationId: string;
  sourceType: "user-confirmed-fact" | "confirmed-event";
  sourceRef: string;
  publicSummary: string;
  audience: "identity-feed";
  status: "active" | "revoked";
  grantedAt: number;
}
```

只有用户明确选择“可在此身份的朋友圈提及”，或双方面向产品规则已确认的公开素材，才创建记录。撤销后 Builder 不再返回该摘要。离线故事、AI 推测、聊天细节与角色自述不能自动创建授权。

## Prompt Adapter 与接入方案

新增 `momentPublicPromptAdapter.ts`，不要继续扩展 private `MomentPromptAdapter`：

```
MomentPublicCognitiveContext
  -> buildMomentPublicPromptContext()
  -> formatMomentPublicPromptContext()
  -> 追加到现有 Moment post/comment/reply 的 systemInstruction
```

Adapter 输出仅为：公开角色资料、public events、Moment-public world knowledge、授权共同经历摘要、时间、公共行为约束和去重提示。它不应接收 `CharacterCognitiveContext`。

接入时需要分开三个调用场景：

- **发帖**：可以使用角色公开素材、授权共同经历、发布历史、作息资格。
- **对用户动态自动评论**：只可用角色公开资料、用户动态本身和公开规则；不能把私聊历史或授权共同经历自动带入评论。
- **评论回复**：只可用公开动态、公开评论和角色公开资料；用户评论不是授权读取其私聊/关系数据的凭据。

在接入前，必须从 `AppChat.tsx` 的 Moment 原始 system instructions 移除私聊历史、archive Memory、历史 fallback、完整 WorldBook、用户 profile 和“隐晦引用私聊”的规则，改由上述 public Adapter 以明确许可字段提供内容。此步骤会涉及 prompt 输入整理，但不应改变 PromptComposer 或 API 协议。

## 实施阶段

1. **Phase 1：领域基础（必须先做）**
   - 新建 `MomentPublicCognitiveContext` 类型、visibility policy、纯 Builder。
   - Builder 只接受 public candidate、显式授权、Moment-public WorldBook、发布历史和时间；无授权/未知 visibility 默认拒绝。
2. **Phase 2：专用 Adapter（必须先做）**
   - 新建 `momentPublicPromptAdapter.ts` 与 DTO；禁止输入 private cognitive snapshot。
   - 保持当前 `momentPromptAdapter.ts` 作为过渡兼容层，直至所有调用迁移。
3. **Phase 3：自动发帖接入（高优先级）**
   - 先替换 `generateCharacterMoment` 的私聊/Memory/全量 WorldBook输入。
   - `routine.allowedToPublish === false` 或无新公共素材时直接 `SKIP`，不改变 scheduler/cooldown。
4. **Phase 4：评论与回复接入（高优先级）**
   - 移除 `handleAutoCommentOnUserMoment`、`handleAutoReplyToUserComment` 的私聊历史与用户资料注入。
   - 仅传公开动态/评论线程加 public context。
5. **Phase 5：授权与去重增强（建议后做）**
   - 实现可撤销共同经历授权、主题指纹、图片描述去重和角色题材冷却。
6. **Phase 6：作息模型（可以后做）**
   - 仅建立可发布时段/安静时段建议；不得复用或改变 proactive 调度字段。

## 测试方案

新增纯领域与 Adapter 测试：

- public event 进入；`safe` / relationship / private / unknown 事件均拒绝。
- 同一角色不同 identity 的授权记录互不泄露；Prompt DTO 无 relation/identity/conversation ID。
- `RelationshipState`、Timeline、openLoops、boundaries、Memory、InnerVoice、OfflineStory 文本均不出现在序列化 DTO 或格式化 Prompt。
- 授权共同经历只输出 `publicSummary`；不输出 source ref，也不允许模型补全地点/动作/后续。
- 无 public candidate 或在 quiet-hours 时返回 `SKIP` 资格，而不是调用内容生成。
- 同 identity feed 中相同主题/图像意图/结论会被拒绝；不同身份 feed 的历史不互相参与比较。
- 发帖、评论、回复各自验证：私聊历史、用户资料、全量 WorldBook 不再出现在 AI request。
- 保留 `momentTemporalConsistency`、`momentUniqueness`、`momentGenerationIdempotency`、删除动态同步移除 Memory 的回归测试。

## 不属于本设计的内容

- 不修改 `Moment`、`Memory`、`CharacterEvent`、`Relationship` 数据结构。
- 不将朋友圈互动自动写为 Memory、CharacterEvent 或 RelationshipState。
- 不改变 `scheduledProactiveTime`、`lastActiveTime`、cooldown、发送频率或现有 scheduler。
- 不把朋友圈当作论坛，也不将论坛公开内容自动同步到 Moments。
