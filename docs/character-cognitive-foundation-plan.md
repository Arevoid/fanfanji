# Character Cognitive Foundation 修复规划

> 状态：设计方案，仅分析，不包含源码修改。
> 基线：`docs/character-intelligence-audit.md` 与当前 `agent/relationship-isolation` 实现。
> 目标：在 Character Life System / CharacterEvent 开始写入长期认知之前，先稳定身份、关系作用域、来源追踪与删除语义。

## 1. 结论摘要

Character Life System 不能先从“新增事件表”开始。当前最需要先解决的是：同一角色在不同用户身份、不同 Relationship、群聊与线下剧情之间，哪些信息允许进入哪一条认知链。

推荐顺序如下：

| 等级 | 工作 | 是否阻断 CharacterEvent | 原因 |
| --- | --- | --- | --- |
| 必须先做 | 建立关系认知作用域契约 | 阻断所有关系事件写入 | 没有统一身份键，事件会永久写错关系 |
| 必须先做 | 修复 OOC Memory 缺失 `relationId` | 阻断聊天事件接入 | OOC 修正属于当前会话关系，不能成为角色全局事实 |
| 必须先做 | 封堵 OfflineStory 多角色跨关系记忆读取 | 阻断 Offline 事件接入；同时是现有隐私风险 | 群聊导入目前可按 `characterId` 收集其他身份下的私有 Memory |
| 必须先做 | 定义 CharacterEvent 幂等、来源与撤回契约 | 阻断所有事件写入 | 重生成、删除和重试都可能制造重复或幽灵事件 |
| 建议后做 | Moment 评论保存稳定 actor 引用 | 阻断 Moment 评论事件接入 | 当前评论仅有显示名，回复时会按名字/备注反查关系 |
| 建议后做 | OfflineStory 完整参与者作用域模型 | 阻断多角色 Offline 事件接入 | 单一主 `relationId` 无法表达每个参与角色的知识边界 |
| 建议后做 | Forum / Diary 事件接入与去重约束 | 不阻断 Chat-only v1 | 两者主链已有稳定 ID，但仍需明确哪些行为才算角色观察到 |
| 可以延后 | WorldBook 增加 relationship scope | 不阻断 v1 | WorldBook 当前是设定知识，不应承担关系经历或记忆 |
| 可以延后 | 群聊认知、Conversation 实体化、旧字段清理 | 不阻断 v1 | 可在稳定的单聊关系事件链之后独立演进 |

建议采用“先封边界，再只开放 Chat 生产者，最后逐应用接入”的策略。第一版 CharacterEvent 可以只覆盖已经通过严格 `relationId` 校验的单聊消息，不需要等待所有社交应用同时改造完成。

## 2. 统一认知作用域契约

### 2.1 必须先定义的身份键

任何会影响某段长期关系认知的数据，至少必须绑定：

```ts
interface RelationshipCognitiveScope {
  ownerIdentityId: string;
  characterId: string;
  relationId: string;
  conversationId: string;
}
```

四个字段职责不同，不能互相替代：

- `ownerIdentityId`：区分用户当前使用的身份。
- `characterId`：标识角色本体，用于角色资料和公共设定。
- `relationId`：标识该用户身份与该角色之间的独立关系。
- `conversationId`：标识承载消息的会话；它不能代替 Relationship，但可用于来源追踪和删除清理。

写入前必须验证：

1. `relationId` 存在且对应的 Relationship 未删除。
2. Relationship 的 `characterId` 与事件的 `characterId` 一致。
3. Relationship 的 `ownerIdentityId` 与当前 `ownerIdentityId` 一致。
4. `conversationId` 属于该 Relationship 的当前会话边界。
5. 验证失败时停止写入，不回退到角色名、备注、当前激活关系或“第一条可用关系”。

群聊、虚拟论坛用户、匿名作者和纯故事角色不满足上述关系作用域时，应使用独立的 scope 类型，不能伪造成直接 Relationship：

```ts
type CognitiveScope =
  | { kind: "relationship"; ownerIdentityId: string; characterId: string; relationId: string; conversationId: string }
  | { kind: "group"; ownerIdentityId: string; groupId: string; conversationId: string }
  | { kind: "character-private"; characterId: string }
  | { kind: "public" };
```

CharacterEvent v1 应只允许 `kind: "relationship"`。其他 scope 在拥有明确读取、删除和隐私规则前，不启用长期事件写入。

### 2.2 禁止的解析方式

以下方式只能用于 UI 展示或旧数据提示，不能用于认知写入：

- 用角色名称、备注、论坛昵称、日记作者名反查 Character。
- 通过 `characterId` 选择该角色的第一条 Relationship。
- 在 `relationId` 缺失时使用当前页面的 active Relationship。
- 通过群聊成员身份推断其与当前用户拥有私密单聊关系。
- 把 `Character.compressedMemory` 当成所有用户身份共享的关系记忆。

## 3. 必须先做

### 3.1 P0：修复 OOC Memory 缺失 `relationId`

#### 当前问题

`src/components/AppChat.tsx` 的 OOC 修正路径直接创建 `MemoryItem`，写入了 `characterId`，但没有写入 `relationId`。这使该条修正无法可靠归属于当前 Relationship；在不带 `relationId` 的读取路径中，还可能被当作角色级通用认知。

OOC 修正描述的是“这次关系中的回复哪里不符合用户预期”，它既不是角色公共设定，也不是其他身份与角色之间共享的事实。

#### 修复方式

将 OOC Memory 创建收口到一个关系感知入口，例如：

```ts
createOocCorrectionMemory({
  context: ChatRuntimeContext,
  sourceMessageId,
  feedback,
})
```

规则：

1. 单聊必须从 `ChatRuntimeContext` 取得并验证 `characterId`、`relationId`、`conversationId`、`userIdentityId`。
2. 创建的 `MemoryItem` 必须写入已验证的 `relationId`。
3. 不允许从 `activeChatCharId` 单独构造关系记忆。
4. 群聊当前不能表达 OOC Memory 的群组作用域，因此只把反馈用于本次重生成，不写入单聊 Memory。
5. 如果上下文缺失或校验失败，记录可诊断结果并跳过长期保存，不猜测关系。
6. 后续 CharacterEvent 如需记录该修正，应引用原消息 ID 和修正来源，而不是根据 Memory 文本再次推断。

#### 旧数据策略

已有无 `relationId` 的 OOC Memory 不应批量分配给当前关系。只允许在以下情况自动修复：

- 能通过引用的原 assistant message 唯一定位到一个 `conversationId` 和 Relationship；或
- 该角色在该用户身份下只有一条确定 Relationship，且能证明该 Memory 属于该身份。

无法唯一定位时：

- 保留原记录供用户查看；
- 将其视为未归属/隔离数据；
- 不注入任何关系 Prompt；
- 不转换为 CharacterEvent。

#### 验收标准

- 同一个 Character 在身份 A、B 下各有 Relationship，A 的 OOC 修正只能由 A 检索。
- 切换身份、刷新页面后隔离仍成立。
- 群聊 OOC 不进入任何成员的直接关系 Memory。
- 无法确定来源的旧 OOC 不会被自动塞入当前 Relationship。
- 重生成和现有 OOC UI 行为不变。

### 3.2 P0：封堵 OfflineStory 多角色跨关系读取

#### 当前问题

当前 `OfflineStory` 同时保存主 `characterId`、可选单一 `relationId` 和 `characterIds`。这只能表达一个主关系，不能表达多个参与者各自的关系边界。

更严重的是，群聊导入线下剧情时，在没有 `activeRelationship` 的分支会按参与角色的 `characterId` 收集 Memory。这样会把同一角色在其他用户身份 Relationship 下的私有 Memory 带入群聊故事。

Prompt 和同步也围绕单一主关系：

- 多参与者可能复用主 `relationId` 的关系摘要。
- 群聊参与者可能回退读取 `Character.compressedMemory`。
- 扁平 `importedContext.memories` 无法说明每条记忆属于哪个参与者和关系。
- 线下记忆同步只面向故事主角色，无法对多角色分别建立安全标记。

#### 第一阶段：立即封堵

在完整模型改造前，先采用保守规则：

1. 单聊导入继续只读取与当前 `relationId` 完全匹配的 Memory。
2. 群聊导入不得再按成员 `characterId` 收集直接关系 Memory。
3. 群聊故事可以导入群聊消息，但 `importedContext.memories` 暂时为空。
4. 群聊和无法确定参与者关系的多角色故事不读取 `Character.compressedMemory` 作为替代。
5. 群聊/未归属多角色故事继续禁止同步到直接关系 Memory。
6. 在完整参与者模型完成前，不允许这些故事产生 relationship-scoped CharacterEvent。
7. 新建故事应保存稳定的 `ownerIdentityId`，或在过渡期通过已有关系/群组记录做严格验证，避免身份切换后被另一身份读取。

这一阶段不追求“让多角色故事拥有更多记忆”，而是先保证“不读取不属于当前作用域的记忆”。

#### 第二阶段：参与者级作用域模型

在开启 Offline CharacterEvent 前，将参与者从 `characterIds: string[]` 升级为带作用域的结构：

```ts
type OfflineParticipantScope =
  | { kind: "direct"; relationId: string; conversationId: string }
  | { kind: "group"; groupId: string; conversationId: string }
  | { kind: "story-only" };

interface OfflineStoryParticipant {
  characterId: string;
  role: "primary" | "participant";
  scope: OfflineParticipantScope;
}
```

导入上下文也应按参与者或 scope 分区：

```ts
interface OfflineParticipantContext {
  characterId: string;
  scope: OfflineParticipantScope;
  messages: Message[];
  memories: MemoryItem[];
  worldBookText: string;
  importedAt: number;
}
```

规则：

- `direct` 参与者只能读取其精确 `relationId` 的 Memory。
- `group` 参与者只读取群聊上下文，不因群成员身份自动获得其私聊记忆。
- `story-only` 参与者只使用角色设定、WorldBook 和当前故事内容。
- Prompt 逐参与者组装，不复用主角色 Relationship 摘要。
- 同步按参与者执行，并只对 `direct` scope 开放。
- 同步标记应包含 `storyId + characterId + relationId + 内容范围`，避免一个主标记覆盖所有参与者。
- 旧故事只能安全迁移主 direct scope；额外参与者默认 `group` 或 `story-only`，不得按名字或角色 ID 推断私聊关系。

#### 验收标准

- 身份 A 的群聊故事不能读取身份 B 与相同 Character 的 Memory。
- 群聊成员关系不会自动变成私聊知识。
- 每位 direct 参与者只看到自己的 Relationship 摘要和 Memory。
- 同一故事对不同参与者的同步标记互不覆盖。
- 删除某个 Relationship 后，对应参与者上下文不会回退到其他关系。
- 在完整模型上线前，群聊和未归属多角色 Offline 不产生直接关系事件。

### 3.3 P0：定义 CharacterEvent 写入契约

即使身份隔离正确，如果没有来源与撤回契约，重试、重生成和删除仍会造成长期认知污染。因此在创建任何生产者前，先冻结以下最小结构与规则。

建议事件至少包含：

```ts
interface CharacterEvent {
  id: string;
  scope: RelationshipCognitiveScope;
  kind: string;
  source: {
    app: "chat" | "offline" | "moment" | "forum" | "diary" | "music";
    recordType: string;
    recordId: string;
    sourceKey: string;
  };
  occurredAt: number;
  observedAt: number;
  status: "active" | "retracted" | "superseded";
  payload: unknown;
  schemaVersion: 1;
}
```

写入原则：

1. 先持久化源记录，再写 CharacterEvent；失败或草稿不产生事件。
2. `sourceKey` 在同一 scope 内唯一，重复调用必须幂等。
3. 消息重生成时，旧 assistant 事件标为 `superseded`，新回复使用新来源 ID。
4. 删除消息、动态、帖子或关系时，通过来源索引撤回/级联清理事件。
5. Event 保存“发生过什么”，不保存 Prompt 成品，不复制完整 Memory 摘要。
6. Event 不直接修改 RelationshipState；由 projector 根据 active events 计算或增量更新。
7. 同一行为只由一个来源生产事件。例如日记分享和音乐分享已经形成 Chat Message，应由 Chat 事件覆盖，避免社交应用和聊天各写一遍。
8. 写入失败不能阻断既有聊天主流程，但必须可重试且不能重复。

#### 第一批只开放 Chat direct

完成 OOC 和作用域契约后，CharacterEvent v1 可以先接单聊：

- 用户消息成功保存后产生交互事件。
- assistant 回复成功保存后产生角色响应事件。
- 主动消息只有在消息成功落库后产生事件，调度、尝试和失败不产生事件。
- 特殊消息沿用 Message 的稳定 ID 和已验证 ChatRuntimeContext。
- 重新生成和删除按上述 supersede/retract 规则处理。
- 群聊暂不写 relationship-scoped 事件。

这一做法允许 Character Life System 提前验证 Event Repository 与 RelationshipState 投影，而不会等待所有应用完成改造。

#### 验收标准

- 相同消息重复执行副作用不会产生第二条 active Event。
- 消息删除后，相关 Event 不再参与 RelationshipState 或 Prompt。
- assistant 重生成后只保留新回复为 active。
- 身份 A、B 的事件查询严格隔离。
- 缺失任何 scope 字段时写入失败关闭，不执行自动补全。

### 3.4 P0：收紧关系级 Memory 读取入口

当前 MemoryRetriever 在调用方不传 `relationId` 时会退化为 Character 级读取。这个能力可能仍需用于旧数据维护或管理页，但不适合作为角色关系 Prompt 的默认入口。

建议新增明确 API，而不是立刻删除兼容行为：

```ts
retrieveForRelationship(scope: RelationshipCognitiveScope, query: string)
retrieveLegacyForCharacter(characterId: string, query: string)
```

规则：

- Chat、Offline direct、主动消息、InnerVoice 的关系认知读取只调用 `retrieveForRelationship`。
- Legacy API 只允许迁移、审计或明确的角色级页面使用。
- 缺少 `relationId` 的旧 Memory 默认不进入关系 Prompt，除非经过确定性迁移。

这项工作与 OOC 修复一起完成，可以避免新 CharacterEvent 读取链再次调用宽松接口。

## 4. 建议后做

### 4.1 P1：Moment 评论改用稳定 actor 引用

#### 当前问题

`Moment` 本身已经保存 `characterId`、`relationId`、`ownerIdentityId`，但 `MomentComment` 只有 `authorName` 和头像等显示快照。自动回复评论时，会用名字或备注反查 Character，再选择一条 Relationship。

名字和备注并不唯一，也会被修改；同一 Character 在多个用户身份下还会拥有多条 Relationship。把这种结果写入 CharacterEvent 会把长期认知归到错误关系。

#### 建议模型

保留显示快照，同时增加私有稳定 actor：

```ts
type MomentActorRef =
  | { kind: "user"; ownerIdentityId: string }
  | { kind: "relationship"; ownerIdentityId: string; characterId: string; relationId: string };

interface MomentComment {
  // 现有显示字段继续保留
  actor?: MomentActorRef;
}
```

规则：

- 用户评论保存 `ownerIdentityId`。
- AI 角色评论/回复保存精确 `relationId + characterId + ownerIdentityId`。
- 回复时只读取 `actor`，并验证其与 Moment owner 一致。
- `authorName`、头像和备注只负责历史展示，不参与权限、Prompt 或事件写入。
- 旧评论缺少 actor 时仍可显示；需要 AI 回复或产生 Event 时应跳过或让用户明确选择，不自动按名字猜测。
- 删除 Relationship 后，相应 actor 变为不可交互的历史快照，不回退到其他 Relationship。

#### Moment 事件边界

- 角色以稳定 Relationship 发布动态并成功持久化后，可以产生 public-action Event。
- 只有拥有稳定 actor 的真实互动才产生关系事件。
- 用户发布动态不代表所有角色都看到了，不能广播给所有 Relationship。
- 删除动态或评论时撤回相应 Event。

### 4.2 P1：完成 OfflineStory 参与者模型后再开放事件

OfflineStory 的第二阶段模型改造属于“建议后做”，但它是 Offline Event producer 的硬门槛。Chat-only CharacterEvent 不需要等待它。

Offline Event 推荐在“安全同步确认”后产生，而不是每生成一段剧本就产生：

- 来源是已确认的 story content range 和 participant scope。
- 只为 `direct` participant 创建 relationship-scoped Event。
- `group` 和 `story-only` 参与者在群聊认知模型完成前不写直接关系事件。
- 导演说明、IF 分支、被撤销的剧情和未同步草稿不成为事实事件。
- 一段剧情只由同步入口写一次 Event，Memory 与 Event 不得各自独立重复表达同一来源。

### 4.3 P1：Forum 保持公开快照与私有 actor 分离

Forum 的 Relationship actor 主链已经使用 `relationId + characterId`，比 Moment 更稳定。这里不需要重做数据模型，重点是加强约束：

- Relationship actor 产生 Event 前验证 `relationId`、`characterId` 和当前 ownerIdentity。
- 虚拟论坛用户不产生 CharacterEvent。
- 匿名作者的真实映射只保存在私有字段，不能进入公开快照、导出或备份展示层。
- 用户发帖不代表每个 Character 都已观察到；只有实际参与回复、私信或明确阅读行为才可产生该角色事件。
- 当前通过显示名匹配虚拟 profile 的局部实现可改为稳定 `virtualProfileId`，但它不是 Relationship 隔离的首要阻断项。

### 4.4 P1：Diary 避免重复生产事件

Diary 的生成主链已经保存 `characterId`、`relationId`、`conversationId`、`ownerIdentityId`，打开会话和分享也使用稳定 ID，不存在主要的名字反查问题。

建议边界：

- 角色私人日记不自动进入 RelationshipEvent；用户并不知道的内容不能成为双方共同经历。
- 用户明确分享日记时，会生成一条 Chat Message；由 Chat producer 产生事件即可。
- Diary 不再为同一次分享额外产生第二条 Event。
- 作者名与头像继续作为显示快照，不能用于恢复关系。
- 如果未来需要角色自身成长，可使用 `character-private` scope，与 RelationshipState 分开保存和读取。

### 4.5 P1：建立生产者接入清单与审计日志

每个新 CharacterEvent producer 接入时必须回答：

1. 角色是否真实观察到该行为？
2. 来源记录是否已经成功持久化？
3. 稳定 scope 从哪里取得？
4. 重试如何幂等？
5. 删除、编辑、重生成如何撤回或替代？
6. 是否与另一个 producer 重复？
7. 是否包含角色不知道的私有信息？

建议仅记录脱敏的诊断字段：producer、sourceKey、scope 校验结果、eventId 和失败原因，不记录完整 Prompt、私聊正文或匿名映射。

## 5. 可以延后

### 5.1 P2：WorldBook relationship scope 改造

#### 是否需要改造

Character Life System v1 不要求立即改造。WorldBook 当前适合承载：

- 全局世界设定；
- 某 Character 的固定背景、行为规则和知识；
- 用户显式配置的 Prompt 资料。

它不应承载：

- 某段 Relationship 的共同经历；
- 角色从聊天中学到的事实；
- 情绪变化、关系进展和事件历史；
- 仅对某一用户身份成立的秘密。

这些应进入 CharacterEvent、RelationshipState 或 relation-scoped Memory。

#### 什么时候必须改

出现以下产品需求时再单独启动：

- 用户需要配置“只有身份 A 与角色 X 的关系知道”的秘密。
- 同一 Character 面对不同用户身份必须拥有不同的显式设定知识。
- WorldBook 编辑器需要展示和管理 Relationship 专属条目。

#### 推荐模型

不要继续叠加可选 `characterId`、`relationId` 字段，改为判别联合：

```ts
type WorldBookScope =
  | { kind: "global" }
  | { kind: "character"; characterId: string }
  | { kind: "relationship"; ownerIdentityId: string; characterId: string; relationId: string };
```

改造需要独立迁移和全链回归：WorldBook 编辑器、筛选工具、Chat/Offline/Forum Prompt、导入导出、备份、PNG 解析、删除清理与主题测试。由于消费者多、影响面大，不应和 CharacterEvent 首次落地捆绑。

### 5.2 P2：群聊长期认知模型

群聊是否形成共享记忆、成员是否能把群内信息带入私聊，是独立的产品与隐私决策。建议先只保留群聊 transcript，不把群聊参与等价为任何成员的直接 RelationshipEvent。

后续可以设计 group-scoped Event 和“允许迁移到 direct scope”的显式规则，但不应在 v1 通过复制事件到每个成员关系来实现。

### 5.3 P2：Memory 语义去重与来源图

CharacterEvent 稳定后，可以让 Memory 成为 Event/Message 的总结投影，并保存 `sourceEventIds` 或 source range。届时再解决跨批次语义重复、离线同步摘要合并等问题。

当前前置阶段只要求来源可追溯和关系隔离，不需要同时重写 MemoryExtractor 算法。

### 5.4 P2：Conversation 实体化与旧 Character 字段清理

`conversationId` 当前散落在消息、Relationship 和应用状态中。未来可建立独立 Conversation Repository，并逐步移除 `Character` 上残留的关系态、压缩记忆或会话态字段。

这项清理有价值，但不应阻塞稳定 ID 的 CharacterEvent v1。

### 5.5 P2：InnerVoice、日程与备忘录事件

- InnerVoice 是角色解释和推测，不是已经发生的事实，默认不产生 CharacterEvent。
- 日程、备忘录等用户私有内容只有在明确分享后才进入 Chat 事件链。
- 如果未来需要角色私有成长轨迹，应使用 `character-private` scope，不能写进某个随机 Relationship。

## 6. CharacterEvent 来源建议

| 应用/行为 | v1 是否产生 | 建议时点 | 作用域 | 备注 |
| --- | --- | --- | --- | --- |
| 单聊用户消息 | 是 | Message 成功落库后 | relationship | 使用 message ID 幂等 |
| 单聊 AI 回复 | 是 | 回复成功落库后 | relationship | 重生成需 supersede |
| 主动消息 | 是 | 实际消息成功落库后 | relationship | 调度/失败不产生 |
| 特殊消息 | 是，按语义 | Message 成功落库后 | relationship | 红包、转账等仍以消息为源 |
| 群聊消息 | 暂不 | 等 group scope | group | 不复制到每个私聊关系 |
| Offline direct | 后续 | 安全同步确认后 | participant relationship | 必须完成参与者 scope |
| Offline group/story-only | 暂不 | 等群聊/故事认知模型 | group/story-only | 不写直接关系 |
| Moment 角色动态 | 后续 | 动态持久化后 | relationship/public | 必须稳定 actor |
| Moment 评论互动 | 后续 | 评论持久化后 | relationship | 禁止名字反查 |
| Forum Relationship actor | 后续 | 发帖/回复/私信持久化后 | relationship/public | 虚拟 actor 不产生 |
| Diary 私人内容 | 否 | 不产生 | character-private | 不是共同经历 |
| Diary 明确分享 | 由 Chat 产生 | 分享消息落库后 | relationship | Diary 不重复写 |
| 音乐推荐/播放 | 否 | 不产生 | 无 | 仅明确分享走 Chat |
| InnerVoice | 否 | 不产生 | 无 | 推测不能当事实 |
| Memory 创建 | 否 | 不产生 | 无 | Memory 是投影，不是事件源 |
| WorldBook 编辑 | 否 | 不产生 | global/character | 配置不是经历 |

## 7. 推荐实施批次

### Foundation F0：作用域与测试基线

- 固化 `RelationshipCognitiveScope` 校验器。
- 建立“不允许名字反查”和“缺失 relationId 失败关闭”的测试基线。
- 明确关系删除、消息删除、身份删除的级联契约。

完成门：任何 relationship-scoped 写入都无法绕过 scope 校验。

### Foundation F1：OOC 与 Memory 入口

- OOC 创建使用 ChatRuntimeContext。
- 关系 Prompt 改用 relation-required Memory API。
- 旧无归属 OOC 隔离，不自动猜测。

完成门：同一 Character 的多身份 OOC 完全隔离。

### Foundation F2：Offline 隐私封堵

- 禁止群聊导入成员私聊 Memory。
- 禁止多角色未归属故事写直接关系 Memory/Event。
- 增加 owner identity 校验。

完成门：群聊/多角色故事不存在跨身份 Memory 读取路径。

### Event E0：核心 Repository 与 Chat-only producer

- 实现 Event schema、Repository、sourceKey 唯一索引和 retract/supersede。
- 只接入 direct Chat、主动消息和消息删除/重生成。
- RelationshipState 先做最小 projector，Prompt 通过只读 adapter 接入。

完成门：事件重试幂等、删除可撤回、多身份隔离。

### Social S1：Moment 稳定 actor

- Comment 增加稳定 actor ref。
- 旧评论失败关闭。
- 通过测试后开放 Moment producer。

### Offline O1：参与者级模型

- 迁移 participant scope 和 participant contexts。
- 改造 Prompt 与同步标记。
- 通过多角色隔离测试后开放 Offline producer。

### Knowledge K1：按需求决定 WorldBook scope

- 只有 relationship-private lore 成为明确产品需求时启动。
- 独立迁移，不与 Event/Offline 改造合并。

## 8. 必须通过的回归矩阵

### 身份与关系隔离

- 同一 Character、两个 userIdentity、两个 Relationship 的 Message、Memory、Event、Offline context 均互不可见。
- 修改角色备注或名称不改变任何关系解析结果。
- 删除 Relationship 后不回退到同 Character 的其他 Relationship。

### OOC

- 单聊修正保存精确 `relationId`。
- 群聊修正不落入直接 Memory。
- 旧无归属记录不被猜测迁移。

### Offline

- 群聊导入不读取成员 direct Memory。
- direct 故事只读取精确 relation。
- 多参与者 Prompt 不复用主关系摘要。
- 同步按参与者幂等，删除和重试不重复。

### CharacterEvent

- 相同 sourceKey 只能有一个 active Event。
- 重生成后旧回复事件被 supersede。
- 删除源记录后事件被 retract，RelationshipState 重算不包含它。
- 私人日记、InnerVoice、WorldBook 编辑不会产生关系事件。
- 日记/音乐分享只通过 Chat 产生一条事件。

### 社交 actor

- Moment 相同显示名和备注碰撞不会选错关系。
- Forum 虚拟 actor 不产生 CharacterEvent。
- Diary 打开和分享只使用稳定 ID。

## 9. 最终决策

### 必须先做

1. 统一 relationship cognitive scope，并在写入前严格校验。
2. 修复 OOC Memory 的 `relationId` 与群聊保存边界。
3. 封堵 Offline 群聊按 `characterId` 读取直接 Memory 的路径。
4. 收紧关系级 Memory 检索入口。
5. 定义 CharacterEvent 的 sourceKey、幂等、撤回和 supersede 语义。
6. 完成后只开放 direct Chat 的 CharacterEvent producer。

### 建议后做

1. MomentComment 增加稳定 actor ref，彻底移除名字/备注反查。
2. OfflineStory 升级为参与者级 scope 与 context，再开放 Offline Event。
3. Forum 使用已有 private actor 做严格校验；虚拟角色不产事件。
4. Diary 私人内容不进入关系事件，分享统一由 Chat 生产。
5. 建立 producer 接入清单和脱敏审计日志。

### 可以延后

1. WorldBook relationship scope，等关系专属显式设定成为产品需求再改。
2. 群聊长期认知与 group-scoped Event。
3. Memory 语义去重、来源图与重新投影。
4. Conversation 实体化及 Character 旧关系态字段清理。
5. character-private 的 InnerVoice、Diary 和角色自身成长事件。

最重要的边界是：CharacterEvent 不能用来弥补现有身份字段缺失。它只能消费已经被稳定 ID、明确作用域和可撤回来源证明过的行为。先完成这些基础约束，Character Life System 才能成为长期成长能力，而不是把现有偶发身份错误永久固化。
