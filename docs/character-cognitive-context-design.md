# Character Cognitive Context Layer 设计

## 设计目标

本设计基于 `docs/character-cognitive-context-audit.md`，目标是在不修改现有 `Character`、`Message`、`Memory`、`CharacterEvent`、`RelationshipState`、UI 和 AI 调用协议的前提下，为每次角色行为生成提供一个统一的、带关系边界和证据来源的只读上下文。

这里的 Context 不是新的长期数据表，也不是一个会自动改变角色的状态机。它是一次生成请求的快照：

```text
当前身份 + 当前关系 + 角色人设
        + 允许读取的 Memory/Event/历史/时间/WorldBook
        + 禁止知道和禁止声称的内容
        + 当前场景行为约束
        -> CharacterCognitiveContext
        -> 场景适配器
        -> 现有 Prompt 入口
```

核心原则：

1. `characterId` 只代表角色身份，不代表与用户的关系。
2. 私密场景必须以 `relationId + userIdentityId` 作为事实边界。
3. 没有证据不等于“可以自由发挥”；未知状态必须保留为未知。
4. OfflineStory 的虚构事实只能在故事场景或明确 handoff 投影中出现。
5. Context 只读取和投影数据，不调用 AI、不写消息、不写 Memory、不改变 Character。

## 一、目录结构

### 1. `src/domain/characterCognition/`

放与业务无关的纯领域类型和确定性策略，不访问 React、localStorage、API 或 Prompt 文本。

建议结构：

```text
src/domain/characterCognition/
  cognitiveContextTypes.ts
  cognitiveScope.ts
  cognitiveEvidencePolicy.ts
  cognitiveKnowledgeBoundary.ts
  cognitiveTimePolicy.ts
  cognitiveRoutinePolicy.ts
  cognitiveProjection.ts
```

职责：

- 定义 `CharacterCognitiveContext` 及其子类型。
- 校验 identity、relation、character、conversation 的 scope 一致性。
- 定义 Memory、CharacterEvent、WorldBook、Offline handoff 的证据准入规则。
- 定义现实时间、历史时间和线下故事时间的优先级。
- 定义“允许知道”“允许引用”“禁止声称”“证据不足时跳过”等策略。
- 将现有 `CharacterRelationship`、`MemoryItem`、`CharacterEvent` 投影为只读认知材料。

这里不创建新的 `RelationshipState`，也不扩展 `Character`。关系状态继续使用现有关系领域模型，Cognitive Context 只读取它。

### 2. `src/features/characterCognition/`

放应用层的 Context 组装和场景适配，不承载实体持久化。

建议结构：

```text
src/features/characterCognition/
  services/
    buildCharacterCognitiveContext.ts
    characterCognitiveContextReader.ts
    characterBehaviorEligibility.ts
  selectors/
    selectRelevantMemories.ts
    selectRelevantEvents.ts
    selectRecentSocialHistory.ts
  adapters/
    chatCognitiveContextAdapter.ts
    momentCognitiveContextAdapter.ts
    proactiveCognitiveContextAdapter.ts
    diaryCognitiveContextAdapter.ts
    forumCognitiveContextAdapter.ts
    innerVoiceCognitiveContextAdapter.ts
```

职责：

- 从已有 Repository、App state 和服务结果中选取候选材料。
- 调用纯领域 Builder，生成一次请求的 Context 快照。
- 按 Chat、Moment、Proactive、Diary、Forum、InnerVoice 做最小投影。
- 处理场景所需的长度限制、排序和展示安全级别。
- 将现有 Prompt 装配代码逐步改为读取同一 Context，而不是各自重新筛选关系和 Memory。

Feature 层不应拥有另一套 Memory 或 Event 存储，也不应在 adapter 中重新定义关系规则。

### 3. `src/core/storage/`

继续负责持久化已有领域数据和未来必要的索引，不保存完整 Prompt 或临时 Context。

现有相关 Repository：

```text
src/core/storage/repositories/
  characterEventRepository.ts
  memoryRepository.ts
  relationshipRepository.ts
  offlineStoryRepository.ts
  momentRepository.ts
  diaryRepository.ts
```

未来如确实需要，可增加：

```text
  characterRoutineRepository.ts
  cognitiveEvidenceIndexRepository.ts
```

但不建议第一阶段就新增持久化。`CharacterCognitiveContext` 应该是 request-scoped 的内存对象，不进入 localStorage，不作为下一次生成的隐式全局缓存。

## 二、核心类型设计

### 1. Scope

关系型行为必须有明确 scope。公开论坛虚拟作者可以没有关系，但真实角色的公共发言也应保留其来源关系，避免后续无法追溯。

```ts
type CognitiveScene =
  | "direct-chat"
  | "group-chat"
  | "proactive-message"
  | "moment-post"
  | "moment-comment"
  | "diary"
  | "forum"
  | "forum-dm"
  | "inner-voice"
  | "offline-story";

type CharacterCognitiveScope = {
  characterId: string;
  userIdentityId: string;
  scene: CognitiveScene;
  relationId?: string;
  conversationId?: string;
  groupId?: string;
  scopeKind: "relationship" | "group" | "public-character" | "virtual-author";
};
```

约束：

- `scopeKind === "relationship"` 时，`relationId` 必须存在，并且关系的 `characterId`、`userIdentityId` 必须同时匹配。
- `conversationId` 只能作为会话容器，不能代替 `relationId`。
- `groupId` 只代表群容器，不代表每个成员都知道彼此的私聊事实。
- `public-character` 可以用于公开角色内容，但只能使用公开安全投影；不能因为缺少 `relationId` 而读取全部角色历史。
- `virtual-author` 不应读取 Character、Relationship、Memory 或 CharacterEvent。

### 2. Character identity

角色身份只包含稳定人设，不包含某个用户身份下的私密关系事实。

```ts
type CharacterIdentityContext = {
  id: string;
  name: string;
  displayName?: string;
  avatar?: string;
  age?: string | number;
  gender?: string;
  mbti?: string;
  personality: string;
  backstory: string;
  references: readonly { title: string; content: string }[];
};
```

它可以来自现有 `Character` 的只读投影。以下内容不能进入这个结构：

- 某个 `relationId` 的关系阶段、私密聊天摘要、私密称呼。
- 某个用户身份下的 Memory 或 Diary。
- 另一个角色/身份的会话记录。
- 尚未确认的模型推测。

### 3. Relationship context

不新建 `RelationshipState`，而是对现有 `CharacterRelationship` 做只读投影：

```ts
type RelationshipCognitiveContext = {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  conversationId: string;
  stage: CharacterRelationship["relationship"];
  compressedMemory?: string;
  lastActiveTime?: number;
  scheduledProactiveTime?: number;
  updatedAt: number;
};
```

`compressedMemory` 是关系摘要，不应被视为比确定 Event 更高的事实来源。它可以作为背景，但冲突时不能覆盖 scope、时间或确定性事件。

### 4. Evidence context

所有可供角色引用的内容都应带来源类型和 scope，而不是只有一段字符串。

```ts
type CognitiveEvidenceKind =
  | "character-profile"
  | "worldbook"
  | "message"
  | "memory"
  | "character-event"
  | "moment"
  | "diary-share"
  | "forum-share"
  | "offline-handoff";

type CognitiveEvidence = {
  id: string;
  kind: CognitiveEvidenceKind;
  content: string;
  sourceId?: string;
  relationId?: string;
  characterId?: string;
  userIdentityId?: string;
  occurredAt?: number;
  recordedAt?: number;
  confidence?: number;
  visibility: "private" | "relationship" | "group" | "public" | "story-only";
  admission: "stable" | "usable" | "candidate" | "blocked";
  reason?: string;
};
```

建议的准入原则：

- Character profile 和明确的 active WorldBook 是稳定设定，但 WorldBook 仍要按 `characterId`/global 和场景可见性过滤。
- Message 是已发生的会话记录，但只能使用当前 scope 的消息。
- Memory 是关系内长期摘要；必须 exact-match `relationId`，并保留“摘要而非原始证据”的属性。
- CharacterEvent 是确定性事件来源；必须匹配完整 scope，且只使用允许状态的事件。
- Moment、Diary、Forum 分享只有在业务上明确分享给角色后，才可以成为角色知道的内容。
- OfflineStory 的普通内容是 `story-only`；只有明确的 handoff 才能变成 relationship evidence。
- `candidate` 内容可以帮助生成“可能的表达”，不能用于断言“已经发生”。

### 5. Memory context

```ts
type CognitiveMemoryContext = {
  items: readonly CognitiveEvidence[];
  retrievalQuery?: string;
  sourceRelationId?: string;
  retrievalScenario: "chat" | "proactive" | "moment" | "diary" | "forum" | "inner-voice" | "offline";
  hasLegacyUnscopedData: boolean;
};
```

Builder 不改变 Memory 算法。它只接收已经通过现有 `MemoryRetriever` 选择的结果，并再次做 scope 断言，防止调用方把其他关系的结果混入。

### 6. Event context

```ts
type CognitiveEventContext = {
  confirmed: readonly CognitiveEvidence[];
  visible: readonly CognitiveEvidence[];
  excluded: readonly { sourceId?: string; reason: string }[];
};
```

`confirmed` 只读取现有 `CharacterEvent` 的允许状态和完整关系 scope。它不自动抽取聊天，也不修改 `CharacterEvent` 类型。未来新增事件来源时，必须通过已有 Event Repository 的幂等策略。

### 7. Time context

```ts
type CognitiveTimeContext = {
  now: number;
  timezone: string;
  mode: "realtime" | "historical" | "offline-story";
  occurredAt?: number;
  source: "system-clock" | "message" | "moment-occurrence" | "diary-occurrence" | "story" | "handoff";
  dayPart?: "night" | "morning" | "afternoon" | "evening";
  constraints: readonly string[];
};
```

规则：

- `now` 是请求发生的现实时间，不能被历史消息或线下剧情覆盖。
- `occurredAt` 是行为发生的时间；Moment/Diary 的内容时间不能直接使用 App 打开时间。
- `offline-story` 只能使用故事时间；切换回线上 Chat 时必须显式使用 handoff 时间和现实时间。
- 时间只能约束内容，不应凭空生成活动。没有作息证据时，作息状态为 `unknown`。

### 8. Routine context

当前 Character 只有主动消息时间窗等局部配置，不足以成为完整作息模型。因此 RoutineContext 应为可选、外部投影：

```ts
type CognitiveRoutineContext = {
  availability: "available" | "unavailable" | "unknown";
  currentActivity?: string;
  source?: "explicit-user-setting" | "confirmed-event" | "scheduled-task" | "relationship-setting";
  constraints: readonly string[];
};
```

禁止根据人格或当前时间推断“角色一定在睡觉/上班/吃饭”。`unknown` 应使生成器避免具体断言，而不是让 Builder 选择一个看似合理的活动。

### 9. Knowledge boundary 和行为约束

```ts
type CognitiveKnowledgeBoundary = {
  known: readonly string[];
  unknown: readonly string[];
  forbidden: readonly string[];
  rules: readonly string[];
  source: "direct" | "group" | "public" | "story";
};

type CognitiveGenerationPolicy = {
  mayReferencePrivateRelationshipFacts: boolean;
  mayReferenceUserPrivateFacts: boolean;
  mayReferenceOfflineStory: boolean;
  mayClaimCurrentActivity: boolean;
  mayCreateNewEvent: boolean;
  shouldSkipWhenUnsupported: boolean;
  outputVisibility: "private" | "relationship" | "group" | "public" | "story-only";
};
```

行为约束不等于 Prompt 文本。它是确定性元数据，供各场景 adapter 渲染为已有 Prompt 所需的限制，并供生成后 validator 检查。

### 10. 顶层 `CharacterCognitiveContext`

```ts
type CharacterCognitiveContext = {
  schemaVersion: 1;
  createdAt: number;
  scope: CharacterCognitiveScope;
  character: CharacterIdentityContext;
  relationship?: RelationshipCognitiveContext;
  memory: CognitiveMemoryContext;
  events: CognitiveEventContext;
  time: CognitiveTimeContext;
  knowledgeBoundary: CognitiveKnowledgeBoundary;
  routine: CognitiveRoutineContext;
  evidence: readonly CognitiveEvidence[];
  generationPolicy: CognitiveGenerationPolicy;
};
```

这个对象必须是不可变快照。若同一个请求过程中关系或 Memory 发生变化，应重新构建 Context，而不是修改已有 Context。

## 三、Context Builder 设计

### 1. 入口签名

```ts
type BuildCharacterCognitiveContextInput = {
  character: Character;
  relation?: CharacterRelationship;
  userIdentityId: string;
  scene: CognitiveScene;
  conversationId?: string;
  groupId?: string;
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  worldBookEntries?: readonly WorldBookEntry[];
  time: CognitiveTimeContext;
  knowledgeBoundary: CognitiveKnowledgeBoundary;
  routine?: CognitiveRoutineContext;
  offlineStory?: OfflineStory;
  recentMessages?: readonly Message[];
  socialEvidence?: readonly CognitiveEvidence[];
};

function buildCharacterCognitiveContext(
  input: BuildCharacterCognitiveContextInput,
): CharacterCognitiveContext;
```

输入中的 `memories`、`events`、`recentMessages` 应由上游 selector 按场景和 scope 选好；Builder 再做最终确定性校验。它不从 localStorage 读取数据，不依赖 React state，也不调用网络。

### 2. Builder 执行顺序

```text
1. 校验 character 与 userIdentity
2. 校验 relation.characterId / relation.userIdentityId
3. 确定 scopeKind 和场景
4. 过滤消息、Memory、Event、WorldBook 的关系边界
5. 将各来源转换为 CognitiveEvidence
6. 应用时间模式和 OfflineStory/handoff 规则
7. 应用 knowledge boundary 和可见性规则
8. 生成 generationPolicy
9. 按确定性顺序排序并限制材料数量
10. 冻结并返回 Context
```

### 3. Scope 失败策略

不能静默把错误关系降级为当前 Character：

- `relationId` 存在但关系不匹配：返回明确的 scope error，调用方不得继续生成关系型内容。
- 只有 `characterId` 没有 `relationId`：仅允许 `public-character` 或 `virtual-author` 场景，并使用公开安全投影。
- 旧的无 `relationId` Memory：按照既有兼容规则只进入默认关系，不得作为跨关系通配数据。
- 群聊没有成员关系：可以生成群容器消息，但不能把群消息投影为任一成员的私聊事实。
- Event 缺少完整 scope：丢弃并记录排除原因，不为其补造 relationId。

### 4. Builder 不做的事情

- 不把 `compressedMemory` 拆解成新的 Event。
- 不把 AI 生成的 Moment、Diary 或 Forum 文本自动标记为 confirmed。
- 不根据角色名字、备注名或作者显示名反查关系。
- 不因“信息不足”自动补充地点、动作、时间、用户经历或共同场景。
- 不改变现有 MemoryRetriever 的召回算法和排序算法。

## 四、与现有系统的关系

### Character

作为稳定 Persona 输入，提供角色表达方式和背景设定。Character 不保存关系摘要、用户身份事实、某次行为时间线或未经确认的成长状态。

### Relationship

提供当前 `relationId`、`userIdentityId`、`conversationId`、关系阶段、compressedMemory 和主动消息相关配置。它是私密认知上下文的入口，但不是全部证据；Builder 仍需读取关系内 Message、Memory 和 Event。

### Memory

作为召回型、关系范围内的摘要来源。现有算法继续负责提取、检索、去重和合并；Cognitive Layer 只负责 scope 二次校验、可见性投影和“摘要不能超过确定事件”的证据规则。

### CharacterEvent

作为确定性事件来源。现有 `CharacterEvent` 字段和 Repository 不变。Context 读取 `relationship_created`、`offline_story_completed` 等已记录事件，按照事件状态、时间和关系 scope决定是否可见。

### OfflineStory

Context 需要显式包含 `scene` 和 `time.mode`：

- 线下续写：允许读取 story-only 的消息、冻结 WorldBook 和故事 Memory。
- 线上 Chat：不自动读取完整 OfflineStory；只读取已通过 `offlineMemorySync` 生成的关系 handoff 或确定完成事件。
- Forum/Moment：除非业务明确分享，否则不读取线下虚构内容。

### InnerVoice

InnerVoice 使用与 Direct Chat 相同的 identity/relation scope，但采用更窄的输出投影。心声生成结果仍是私密展示内容，不自动进入 CharacterEvent 或 Memory；只有明确业务行为才产生确定 Event。

## 五、Prompt 接入方式

本设计不修改现有 Prompt 文本和 AI 协议。未来接入时采用“同一 Context、不同场景投影”的方式，而不是让每个页面重新拼一份上下文。

### 1. 公共流程

```ts
const context = buildCharacterCognitiveContext(input);
const view = adaptCognitiveContext(context, "direct-chat");

const composed = PromptComposer.compose({
  scenario: "direct-chat",
  message: existingMessage,
  history: existingHistory,
  systemInstruction: existingSystemInstruction + view.systemBlock,
});
```

这里的 `existingSystemInstruction` 和 API 请求协议保持不变。Adapter 只负责把同一 Context 渲染为当前场景需要的上下文片段；PromptComposer 仍然只负责场景包装。

### 2. 场景投影

| 场景 | 使用的同一 Context | 允许投影 | 禁止投影 |
|---|---|---|---|
| Chat | relationship projection | 当前关系 Memory、确定 Event、近期消息、时间、用户可见知识 | 其他关系、未分享的 Diary/Moment、story-only 内容 |
| Group Chat | member projection + group projection | 群消息、成员自己的 Persona、成员各自允许的关系事实 | 把一个成员的私聊事实广播给其他成员 |
| Moments | public social projection | 角色公开人设、公开 WorldBook、明确公开/已发生事件、去重历史、动态发生时间 | 私密 Memory、私聊摘要、未分享 Diary、其他身份 feed 私密内容 |
| Proactive | relationship + routine projection | 关系内最近事件、明确约定、当前时间窗、可安全引用的关系事实 | 无证据的当前地点/动作/生活经历 |
| Diary | private relationship projection | 当前关系消息、允许的 Memory/Event、日记发生时间、角色写作风格 | 其他关系和公共 feed 的未经分享内容 |
| Forum | public-safe projection | 公开帖子、公开角色风格、可公开的事件/话题 | 私密关系 Memory、用户真实姓名/身份、私聊经历 |
| InnerVoice | private introspection projection | 当前关系事件、消息和允许 Memory、心声时间 | 直接向用户不可见的公共内容被当作私密事实，或其他关系事实 |
| OfflineStory | story projection | 冻结故事上下文、故事时间、故事角色视角 | 将 story-only 内容自动写入现实线上关系 |

### 3. 不同场景不是不同事实

Adapter 可以改变长度、字段和公开级别，但不能重新定义“事实”。例如：

- Moment 需要 public-safe projection，不代表它可以自己生成另一套角色经历。
- Diary 可以读取较多私密关系证据，不代表它能知道其他身份的关系。
- Forum 只能读取公开资料，不代表 Forum 的 AI 回复可以从角色 Memory 猜测隐私。

## 六、迁移顺序

### Phase 1：只创建类型和纯 Builder

范围：

- 新增 domain 类型、scope 校验、证据策略、时间策略。
- 新增纯 `buildCharacterCognitiveContext`。
- 新增单元测试：
  - 两个身份同角色隔离。
  - 其他关系 Memory/Event 被排除。
  - 缺失 relationId 不会被当作跨关系通配。
  - OfflineStory story-only 不进入线上 Context。
  - 现实/历史/线下时间模式不会互相覆盖。

不改任何现有 AI 调用和 Prompt。

### Phase 2：Chat 只读接入

先在 Direct Chat 旁路构建 Context，不改变现有 Prompt：

1. 使用当前 AppChat 已经选出的 Character、Relationship、Memory、WorldBook、timeContext 和 boundary 作为 Builder 输入。
2. 对比旧字符串和新 Context 的 scope/evidence 结果。
3. 先记录差异，不将新 Context 写入 Message、Memory 或 Event。
4. 验证稳定后，才让 Chat adapter 向已有 system instruction 添加同等内容。

群聊必须单独测试，不能因为 Direct Chat 通过就默认群聊已完成。

### Phase 3：Moments 接入

优先接角色发动态，其次是自动评论和评论回复：

- 使用同一关系 Context 构建 public social projection。
- 去重历史按 identity、character、relation 的明确边界提供给 uniqueness service。
- 没有可验证新事件或新角度时，Context 的 `shouldSkipWhenUnsupported` 为 true。
- 生成后的 Moment 不自动创建 confirmed Event；已有 Moment Memory 仍走现有 Memory 逻辑。

### Phase 4：Proactive Message 接入

- 将关系内最近事件、约定联系、明确聊天事实和时间窗统一放入 Context。
- `routine.availability === unknown` 时禁止具体声称“正在某地/做某事”。
- 没有可安全引用内容时允许简短问候或跳过，不强制编造生活细节。
- catch-up 使用明确的 historical occurredAt，不让 current now 和 backdated message 互相覆盖。

### Phase 5：Diary、Forum、InnerVoice、OfflineStory 和 Music

建议顺序：

1. Diary：关系私密投影，最容易验证 scope。
2. InnerVoice：同关系 scope，但保持私密输出，不写回事实。
3. Forum DM：关系私信投影。
4. Forum public generation：public-safe 投影，确保 Memory 不泄露。
5. OfflineStory：story projection 和线上 handoff 投影分开。
6. Music：只把 Context 用于推荐理由和关系相关选择，不把选择结果当作现实 Event。

## 七、测试设计

### Builder 单元测试

- `relation-A` 的 Character 与 `relation-B` 同角色时，A 的 Memory/Event 不出现在 B Context。
- relation 的 `characterId` 或 `userIdentityId` 不匹配时返回 scope error。
- 只有 `characterId` 的旧数据只进入显式默认/公开兼容路径，不进入所有关系。
- 一个 `offline_story_completed` Event 可以进入对应关系 Context，不能进入其他关系。
- story-only evidence 在 direct-chat、moment、forum 中被排除。
- Moment occurrence time、message occurredAt、system now 分别保留。
- routine unknown 不会生成具体活动证据。

### 场景 adapter 测试

- Chat 可以看到关系内 Memory/Event，但看不到其他身份。
- Moments 看不到私密 compressedMemory 和未分享 Diary。
- Forum adapter 不输出私密姓名、关系摘要和内部 ID。
- Proactive 没有活动证据时返回 skip/neutral policy。
- InnerVoice 读取同一 relation scope，但结果不自动写入 Memory/Event。
- Group member projection 不把成员 A 的私聊事实提供给成员 B。

### Shadow mode 回归

迁移初期建议同时运行旧 Prompt 装配和新 Context Builder，只比较：

- scope 是否相同；
- Memory/Event 数量和来源是否符合预期；
- 时间模式是否一致；
- public/private 可见性是否收紧；
- 不比较 AI 文案差异，不以一次模型输出作为测试依据。

## 八、边界和风险

### 不能放入 Character

- 某个用户身份的关系阶段和关系摘要。
- 与某个用户的私密消息、Memory、Diary、Forum DM。
- 事件时间线、未完成承诺、用户是否已读。
- 生成过的未验证生活经历。

### 不能直接进入 Memory

- Prompt 指令本身。
- 模型为了完成文案而虚构的地点、动作、共同场景或用户经历。
- 纯展示内容、翻译文本、主题样式和 UI 状态。
- OfflineStory 未经 handoff 的故事细节。
- Moment/Diary/Forum 内容中角色并未实际看到或被分享的部分。

### 不应由 Context Layer 自动解决

- 不能用 Context 替代 Memory 算法。
- 不能用 Context 推断没有数据支持的情感数值或人格成长等级。
- 不能自动把每次模型回复变成 CharacterEvent。
- 不能替代现有关系删除清理、OfflineMemorySync 或 Message 持久化流程。

## 最终方案

Character Cognitive Context Layer 应当是一个位于领域数据和各场景 Prompt 之间的只读投影层：

```text
Character / Relationship / Message / Memory / CharacterEvent
              + WorldBook / Offline handoff / time
                         |
                  scope + evidence policy
                         |
              CharacterCognitiveContext snapshot
                         |
                scene-specific adapter
                         |
        Chat / Moments / Proactive / Diary / Forum / InnerVoice
```

第一阶段只做类型和纯 Builder，确保它不会悄悄改变现有行为。第二阶段开始先在 Chat 旁路验证，再逐个迁移场景。这样既能统一角色知道什么、不能知道什么和应该遵守什么，也能保留当前 Relationship Isolation、OOC Memory 隔离、OfflineStory scope 和 CharacterEvent 基础层的边界。
