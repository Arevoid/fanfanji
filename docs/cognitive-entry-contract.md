# Character Cognitive Entry Contract

## 目的

所有会让角色“产生表达”的 AI 入口，都必须先完成认知边界筛选，再进入场景 Prompt：

```text
Context Builder → Prompt Adapter → AI request
```

业务组件可以负责路由、用户交互和结果保存，但不得把存储层的私域对象直接拼进 `systemInstruction` 或 user prompt。

## 场景契约

| 场景 | Builder / 输入快照 | Adapter | 允许内容 | 明确禁止 |
| --- | --- | --- | --- | --- |
| Chat | `CharacterCognitiveContext` | `ChatPromptAdapter` | 当前角色、当前关系的安全 Memory/Event、边界、时间 | 其他 relation、InnerVoice 原文、内部 ID |
| Proactive | `CharacterCognitiveContext` | `ProactivePromptAdapter` | 当前关系安全摘要、safe event、Routine、话题提示、时间 | 其他关系、private event、调度字段、InnerVoice |
| Moment | `MomentPublicCognitiveContext` | `MomentPromptAdapter` | 公开角色资料、公开历史、明确授权事实、public event、主题提示、时间 | Memory、Relationship、relation event、InnerVoice、线下私密剧情 |
| Diary | `CharacterCognitiveContext` | `DiaryPromptAdapter` | 角色自我记录所需的人设、时间和安全事实 | 未确认计划、IF/导演剧情、InnerVoice 原文、私密 Memory |
| Forum DM | `CharacterCognitiveContext` | `ForumDirectMessagePromptAdapter` | 经 scope 校验的关系安全摘要和 safe event | 其他身份、公开论坛数据、InnerVoice、私聊 Memory 原文 |
| Public Forum | `PublicForumCognitiveContext` | Public Forum adapters | public profile、public event、public world knowledge、公开内容、时间 | 任何 Relationship、Memory、Forum DM、InnerVoice、OfflineStory 私密内容 |
| OfflineStory | 线下故事自身的场景输入 | 当前不接线上认知 Adapter | 场景状态、导演/IF 指令、线下剧情上下文 | 未经确认的 Memory 或 CharacterEvent 写入 |
| InnerVoice | 独立的 direct/group scope | 独立 InnerVoice Prompt | 当前触发消息、有限聊天上下文、角色内心表达 | 向 Chat/Moment/Public/Proactive/Diary 或 Memory 传播原文 |

### Moments 的强制边界

朋友圈的自动发帖、自动评论和评论回复，生产调用链统一为：

```text
public Moment records / public time
  → buildMomentPublicCognitiveContext()
  → MomentPromptAdapter
  → moment service
  → AI
```

三个 Moment service 仍保留没有 `publicContext` 的兼容参数，以支持历史测试和明确的旧调用；新的生产入口必须传入 `MomentPublicCognitiveContext`。Adapter 对公开数据再次执行 deny-by-default 筛选，`safe` 不等于 `public`。

朋友圈内容是公开表达，不因生成成功就成为关系事实。当前生成结果不会自动写入关系 Memory；若未来要保存，应增加明确的用户确认和独立的公开事实写入策略。

## 事实写入契约

AI 生成文本不是事实本身。任何长期认知写入都必须同时满足来源、scope 和确认条件：

| 写入入口 | 来源 | scope 要求 | 确认 / 可信度要求 |
| --- | --- | --- | --- |
| 手动 Memory | 用户在记忆库明确添加 | 必须有当前 `relationId` | `isManual=true`；不能用 character-only 关系归属 |
| Chat Memory 提取 | 当前关系聊天消息 | 提取上下文和结果带同一 `relationId` | 通过既有提取器；不能把缺失 relation 的消息归入长期关系 |
| 即时总结 | 当前关系聊天消息 | 必须有 `relationId`，只检索该关系 | 无明确关系范围时拒绝启动 |
| OfflineStory → Memory | OfflineStory source messages | Fact Policy 允许、当前 relation、单角色、已完成、用户明确同步 | 只有用户确认后才持久化 |
| OfflineStory → CharacterEvent | 已成功完成 Memory handoff 的故事 | Event Policy 允许、当前 relation、sourceKey 按 story 去重 | `confirmed`；禁止 AI-only、IF、director、未完成剧情 |
| OOC 纠正 | 当前关系下用户明确纠正 | relation scope 优先 | 只写当前关系；无 relation 的旧数据只按既有兼容规则读取 |
| Moment 生成 | 公开 Moment 文本 | 不自动转换为关系 Memory | 必须另有用户确认和事实策略；默认不写 |

写入顺序必须是：

```text
来源校验 → relation scope 校验 → Fact/Event Policy → 持久化 → 后续投影
```

`CharacterEvent` 只能表示已确认的确定性业务行为。不要从普通聊天、InnerVoice、AI 续写、公开动态或未完成线下剧情自动抽取关系成长事件。

## InnerVoice 隔离契约

InnerVoice 是私域内心记录，不是事实数据库，也不是 Prompt 共享上下文。它可以使用当前 direct/group scope 生成并按 scope 保存，但：

- 不得进入 Chat、Moment、Public Forum、Proactive 或 Diary 的 Context；
- Prompt 不输出 `relationId`、`userIdentityId`、`conversationId` 等内部路由字段；
- 不得写入 Memory、CharacterEvent 或 RelationshipState；
- UI 只能在当前对应的消息和 scope 下读取。

## 代码评审清单

新增 AI 入口必须满足：

1. 先确定 `relationId` / `userIdentityId` / `characterId` 的边界，群聊和公开场景不得伪造单聊关系。
2. 使用已有 Context Builder；不能直接把 `Character`、`Relationship`、`Memory`、`CharacterEvent` 或 `InnerVoiceRecord` 传给 Prompt。
3. 通过场景专用 Adapter 投影；Prompt 中不得出现内部 ID、存储版本和未授权私密字段。
4. 明确缺少 Context 时的兼容行为；兼容路径不得成为新的生产绕过入口。
5. 如果生成结果需要长期保存，先经过来源、scope、confidence 和用户确认检查。
6. 增加至少一条双身份 / 双关系隔离测试，以及一条 private-to-public 拒绝测试。

## 本轮收口结果

- Moments 的发帖、自动评论、评论回复生产调用点现在构建 `MomentPublicCognitiveContext`，由 `MomentPromptAdapter` 追加公开安全投影。
- Moments 只从公开动态、公开评论和当前时间构建 Context，不读取 Memory、Relationship、CharacterEvent 或 InnerVoice。
- OfflineStory 的 Memory handoff 使用 `Fact Policy`，完成事件使用 `Event Policy`；没有显式用户确认时不会写入。
- 即时总结没有明确 `relationId` 时拒绝，避免按 `characterId` 聚合不同身份。
- InnerVoice 保持独立 Prompt 和存储边界，并移除 Prompt 中的内部关系 ID。
