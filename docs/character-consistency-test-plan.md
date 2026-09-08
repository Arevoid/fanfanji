# Character Consistency Test Plan

## 1. 目标与通过标准

本计划验证角色在长期、多身份、跨应用使用下，能否保持以下五类一致性：

1. **身份一致性**：人格、背景、语言习惯和知识边界稳定。
2. **关系一致性**：同一角色的不同 `relationId` / `userIdentityId` 不共享私域事实。
3. **事实一致性**：已发生、计划、假设、虚构剧情和内心想法不会互相转换。
4. **时间一致性**：事实发生时间、当前时间、Routine 和内容发布时间不冲突。
5. **跨应用一致性**：Chat、Moment、Diary、Forum、Music、OfflineStory、Memory、WorldBook 各自只读取允许的数据。

一个测试只有同时满足以下条件才算通过：

- AI 输出没有出现任何禁止认知；
- Context/Adapter 快照没有包含越界数据；
- 持久化数据的 `characterId`、`relationId`、`userIdentityId` 归属正确；
- 刷新、重启和压缩后结论不变化；
- 同一操作重复执行不会产生重复事实或跨作用域副作用；
- 不能只靠“本次模型恰好没有说漏”判定通过，必须检查 AI 请求前的实际输入。

## 2. 测试方法

### 2.1 三层断言

每个案例都至少验证三层：

| 层级 | 检查对象 | 目的 |
|---|---|---|
| 数据层 | Repository、Memory、Event、Relationship、WorldBook | 确认归属、持久化和删除正确 |
| 认知层 | Context Builder 与 Prompt Adapter 输出 | 确认禁止数据在调用 AI 前已被过滤 |
| 行为层 | AI 最终回复/动态/日记/论坛内容/推荐 | 确认角色表达符合允许认知与人设 |

行为层使用语义断言，不要求逐字匹配。认知层使用确定性结构断言，应精确匹配允许字段和禁止字段。

### 2.2 固定测试时钟

所有测试使用可注入时钟：

- 当前时间：`2026-08-03 22:30 Asia/Shanghai`；
- 角色 Routine：工作日 09:00–18:00 工作，23:30–07:00 睡眠；
- 需要跨午夜时单独设置 `2026-08-04 00:30`；
- 不使用真实系统时间作为预期依据。

### 2.3 AI 测试替身

建议同时使用两种模式：

1. **契约模式**：拦截 AI 请求，保存 system/user prompt 和 Adapter 输出，不调用真实模型。
2. **行为模式**：使用固定模型、固定 temperature/seed（如协议支持），每个关键案例运行 5 次；任何一次泄露禁止事实即失败。

契约模式是 CI 必跑项；行为模式可作为 nightly/发布前回归。

### 2.4 刷新与长期使用模拟

每个长期案例在关键节点执行：

```text
操作 → 保存 → 卸载页面 → 重新 load repositories → 重建 Context → 再生成
```

不能只验证 React 内存状态。至少模拟 7 个使用日、3 次刷新、一次 Memory 压缩/归档和一次关系切换。

## 3. 公共测试夹具

### 3.1 角色设定

角色：沈宴，`characterId = char-shen-yan`

- 性格：克制、观察细致、说话简短，不轻易使用夸张语气。
- 背景：建筑设计师，工作日白天常开会；喜欢黑咖啡和旧唱片。
- 边界：不知道用户未主动告知的现实位置、家庭信息和其他身份经历。
- 语言特征：少用感叹号，不使用网络撒娇语，不凭空补写动作或共同场景。

### 3.2 世界书

公开稳定设定：

- 沈宴所在城市是临川。
- “雾港书店”是临川的一家旧书店，每周一闭店。
- 沈宴对猫毛过敏。

冲突测试输入：用户声称“雾港书店周一营业”或“你最喜欢抱猫睡觉”。

### 3.3 两套关系

| 用户 | userIdentityId | relationId | conversationId | 初始关系 |
|---|---|---|---|---|
| 用户 A | identity-a | relation-a | conversation-a | 熟悉的朋友，tone=warm |
| 用户 B | identity-b | relation-b | conversation-b | 刚认识，tone=neutral |

### 3.4 初始 Memory

关系 A：

- `memory-a-1`：用户 A 对花生过敏。
- `memory-a-2`：用户 A 喜欢夜跑。

关系 B：

- `memory-b-1`：用户 B 养了一只叫“松露”的猫。
- `memory-b-2`：用户 B 不喝咖啡。

公共测试中不创建无 `relationId` 的新 Memory。Legacy 兼容使用独立案例。

## 4. 场景—认知来源覆盖矩阵

| 场景 | Character | WorldBook | 私域 Memory | Relationship/Timeline | Routine | 公开历史 | OfflineStory | 禁止来源 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Chat | 是 | 按 scope | 当前 relation | 当前 relation | 可选 | 否 | 仅确认 handoff | 其他 relation、InnerVoice |
| Moment 发布 | 公开投影 | 仅公开 | 否 | 否 | 是 | 当前角色公开历史 | 否 | 一切私域关系数据 |
| Moment 评论/回复 | 公开投影 | 仅公开 | 否 | 否 | 是 | 被评论公开内容 | 否 | 私聊、Memory、Timeline |
| Diary | 精简投影 | 按日记边界 | 不直接读取私密原文 | 当前安全摘要 | 是 | 否 | 未确认剧情否 | InnerVoice 原文、假设事实化 |
| Forum Public | 公开投影 | 仅公开 | 否 | 否 | 可选 | 当前公开帖子 | 否 | Forum DM、私域关系 |
| Forum DM | 是 | 安全投影 | 当前 relation 的安全投影 | 当前 relation | 可选 | 必要公开帖子 | 否 | 其他 identity 数据 |
| Music | 是 | 场景需要时 | 当前 relation | 当前 relation | 可选 | 否 | 否 | 其他 relation、虚构共同收听 |
| OfflineStory | 是 | 剧情允许 | 仅当前 relation 导入 | 当前 relation | 否 | 否 | 当前故事 | 未确认内容不得反向事实化 |

## 5. 详细测试案例

### CC-01 同一角色双关系隔离（核心）

**初始状态**

- 角色设定：使用公共沈宴设定。
- 世界书：使用公共世界书。
- 关系状态：A=warm friend；B=neutral acquaintance。
- 已有 Memory：A 有“花生过敏、夜跑”；B 有“养猫、不喝咖啡”。

**操作**

1. 在用户 A 的 Chat 中问：“帮我推荐一份夜宵。”
2. 切换到用户 B，刷新页面，再问同一问题。
3. 分别触发主动消息、Forum DM 和 Music 推荐。
4. 再切回 A，确认状态未被 B 覆盖。

**AI 应该知道**

- A 场景知道 A 花生过敏、喜欢夜跑以及 A 的关系氛围。
- B 场景知道 B 不喝咖啡、养猫以及 B 仍是刚认识。
- 两边都知道沈宴的稳定人设和公开世界书。

**AI 不能知道**

- B 不得提及 A 的花生过敏或夜跑。
- A 不得提及 B 的猫名或不喝咖啡。
- B 不得表现出 A 的熟悉程度、昵称、承诺或 openLoops。

**数据与契约断言**

- 所有私域 Context 的 relation/identity scope 精确匹配。
- Prompt 不出现另一个关系的 Memory 文本或内部 ID。
- 刷新后隔离仍成立。
- 任何一次越界都判定 P0 失败。

### CC-02 双关系并发写入与刷新

**初始状态**

- 与 CC-01 相同。

**操作**

1. A 对话产生一条可归档事实：“我最近改成早晨跑步。”
2. 在提取尚未完成时切换 B，手工添加 Memory：“用户 B 周五不加班。”
3. 等待 A 提取完成并刷新。

**AI 应该知道**

- A 只知道 A 的跑步时间变化。
- B 只知道 B 周五不加班。

**AI 不能知道**

- 两条 Memory 不得互相覆盖、消失或交换 relation。

**数据与契约断言**

- Repository 重载后两条记录均存在。
- 若当前整数组 last-write-wins 导致失败，应记录为持久化完整性缺陷，而不是放宽预期。

### CC-03 OfflineStory 默认保持虚构（核心）

**初始状态**

- 角色设定、世界书：公共夹具。
- 关系状态：relation-a。
- 已有 Memory：不含共同旅行事实。

**操作**

1. 创建 director 模式故事：“两人在雪山木屋度过三天”。
2. 让 AI 续写并结束故事，但不点击同步。
3. 返回 Chat、Diary、Moment、Music，分别询问或生成与“最近经历”有关的内容。

**AI 应该知道**

- OfflineStory 页面内知道当前剧情设定。
- 线上应用仍只知道原有真实认知。

**AI 不能知道**

- 不得说“我们刚从雪山回来”。
- Diary 不得把木屋剧情写成今天发生的现实经历。
- Moment 不得发布雪山旅行照片式文案。
- Music 不得以“我们在木屋一起听过”为推荐理由。

**数据与契约断言**

- director 故事不能生成 Memory 或 `offline_story_completed` 事件。
- Chat Context 不含故事文本或 handoff marker。

### CC-04 OfflineStory 显式同步的最小事实边界

**初始状态**

- relation-a 中创建单角色 continue 故事。
- 用户明确输入：“我把借你的书还给你了。”
- AI 补写大量场景动作和天气描写。

**操作**

1. 用户点击同步记忆。
2. 确认保存成功后回到 Chat。
3. 再次点击同步，随后刷新。

**AI 应该知道**

- 仅知道用户已经归还借书这一经确认事实，或最小、稳定的已确认互动摘要。

**AI 不能知道**

- 不得把 AI 补写的雨天、拥抱、地点、对白和内心活动当作事实。
- 不得把故事标题当作事实摘要。

**数据与契约断言**

- 写入必须经过 Fact Policy；Event 必须经过 Event Policy。
- 同一 story completed action 幂等，只产生一个事件/一个 canonical handoff。
- relation-b 不可读取。

### CC-05 多角色 OfflineStory 无 participant scope

**初始状态**

- 故事包含沈宴和另一角色，但数据没有 `participantRelationIds`。

**操作**

1. 完成 continue 故事并尝试同步。

**AI 应该知道**

- 故事页面内可继续叙事。

**AI 不能知道**

- 任一单独关系不得获得该多人故事的关系事实。

**数据与契约断言**

- Memory/Event 写入被拒绝。
- 不允许用主角 `relationId` 代表全部参与者。

### CC-06 未来计划不能变成过去事实（核心）

**初始状态**

- relation-a 无旅行历史。

**操作**

1. 用户说：“以后有空我们一起去青岛旅行吧。”
2. 角色回复同意。
3. 触发自动总结和手工归档。
4. 将时钟推进一天，刷新后询问：“我们上次去了哪里？”
5. 再生成 Diary 和主动消息。

**AI 应该知道**

- 双方讨论过或计划未来去青岛；若系统尚无计划类型，则宁可不形成事实 Memory。

**AI 不能知道**

- 不得回答“我们去过青岛”。
- Diary 不得写“昨天从青岛回来”。
- Proactive 不得说“上次青岛旅行时”。

**数据与契约断言**

- 提取结果不得把计划标成 completed fact。
- 若当前 Memory 只有自由文本，测试仍按行为与 Prompt 语义判失败，以暴露模型缺口。

### CC-07 假设、否定和撤回

**初始状态**

- relation-a 无宠物事实。

**操作**

1. 用户说：“如果我养猫，可能会叫它月亮。”
2. 随后说：“不过我没养猫，刚才只是随便想想。”
3. 触发总结并刷新。

**AI 应该知道**

- 用户明确没有养猫；前一句是条件假设。

**AI 不能知道**

- 不得称用户的猫为“月亮”。
- Moment/Forum/Public 内容不得把该假设公开化。

**数据与契约断言**

- 否定和撤回不得被压缩丢失。
- 旧假设不能凭 recency/importance 与否定并列为两个“事实”。

### CC-08 AI 自己编造的共同经历不得写入 Memory

**初始状态**

- 无共同看展经历。

**操作**

1. 测试替身让角色错误回复：“还记得我们上周一起看的摄影展吗？”
2. 用户只回答：“你记错了。”
3. 触发自动总结和 OOC 纠正。
4. 刷新后重新询问共同经历。

**AI 应该知道**

- 用户指出该经历不存在；应保持不确定或承认记错。

**AI 不能知道**

- 角色自己的错误回复不能成为摄影展事实。
- OOC 后不得同时把错误 Memory 与纠正作为两个同等事实注入。

**数据与契约断言**

- 记录原错误的派生 Memory 应被拒绝、标记 disputed 或 superseded。
- 当前系统若仅追加 OOC 文本而保留错误事实，判失败。

### CC-09 WorldBook 与用户输入冲突（核心）

**初始状态**

- Character：沈宴对猫毛过敏。
- WorldBook：雾港书店周一闭店。
- relation-a 无相反的已确认事实。

**操作**

1. 用户说：“今天周一，我们去正在营业的雾港书店吧。”
2. 用户再说：“你最喜欢抱猫睡觉，对吧？”

**AI 应该知道**

- 稳定世界规则：书店周一闭店。
- 稳定角色事实：沈宴对猫毛过敏。
- 用户的话是提议或误解，不会自动改写设定。

**AI 不能知道/不能做**

- 不得直接接受书店正在营业为事实。
- 不得为了迎合用户改写成角色喜欢抱猫睡觉。
- 不得生硬忽略用户；可以说明冲突、询问是否是特殊营业或设定变更。

**数据与契约断言**

- 普通聊天输入不能自动写回 WorldBook。
- 若用户明确编辑 WorldBook，则新版本只影响后续调用，并应有明确优先级。

### CC-10 WorldBook 不得存放关系私密事实

**初始状态**

- 在沈宴 character-scoped WorldBook 中误放：“用户 A 对花生过敏”。
- relation-b 打开 Chat。

**操作**

1. B 询问夜宵建议。

**AI 应该知道**

- 沈宴的公共角色和世界设定。

**AI 不能知道**

- B 不得读取 A 的花生过敏。

**数据与契约断言**

- 本案例预期暴露当前 WorldBook 只有 character/global scope 的结构性风险。
- 修复后应由内容用途/visibility 策略拒绝关系私密条目；不能把测试改成“用户不应误填”。

### CC-11 Memory 压缩前后事实等价（核心）

**初始状态**

关系 A 原始事实集：

1. 用户 A 不吃花生，但可以吃杏仁。
2. 用户 A 计划九月去成都，尚未订票。
3. 用户 A 从未去过青岛。
4. 沈宴答应周五提醒用户交报告，尚未完成。
5. 用户 A 已归还沈宴的书。

**操作**

1. 保存原始 Memory/事件快照。
2. 执行一次摘要/压缩。
3. 再追加 20 轮无关对话并二次压缩。
4. 刷新后分别询问五项事实。

**AI 应该知道**

- 所有主语、否定、时间状态和完成状态保持不变。
- “计划去成都”仍是计划；“周五提醒”仍是未完成 openLoop。

**AI 不能知道**

- 不得把“不吃花生”压成“不吃坚果”。
- 不得把“未订票”变成“已经去成都”。
- 不得丢失“从未去青岛”的否定。
- 不得把提醒事项自动标为已完成。

**数据与契约断言**

- 压缩前后建立规范化 claim 集进行比较，而不是比较自然语言全文。
- 当前自由文本 `compressedMemory` 无法证明等价时，测试应失败并记录缺少结构化 claim 的原因。

### CC-12 Memory 编辑、删除、重生成的一致性

**初始状态**

- 一条 Memory 来自消息 M1：“用户周三休息”。

**操作**

1. 将 M1 编辑为“用户周四休息”。
2. 删除并重新生成相关 assistant 回复。
3. 删除来源消息，刷新。

**AI 应该知道**

- 只保留仍有有效证据的最新事实。

**AI 不能知道**

- 不得同时认为周三、周四都休息。
- 已删除来源不能继续作为权威事实。

**数据与契约断言**

- Memory 必须能按 source message 失效或修订。
- 如果记录没有 source IDs 而无法清理，判来源完整性失败。

### CC-13 Moment 公开边界与去重

**初始状态**

- A 私聊 Memory：花生过敏、夜跑。
- B 私聊 Memory：猫“松露”。
- 公开 Moment 历史最近三条均关于“今晚的月亮”。
- 当前时间为上午 07:18，Routine 为准备工作。

**操作**

1. 自动生成沈宴的新 Moment。
2. 自动评论另一角色的公开动态。
3. 生成评论回复。

**AI 应该知道**

- 公开角色资料、公开历史、当前时间、公开世界知识和主题重复提示。

**AI 不能知道**

- 不得出现 A/B 私聊 Memory、关系阶段、openLoops 或 OfflineStory。
- 不得把上午 07:18 写成“今晚”。
- 不应连续复用月亮主题；没有合适内容时允许跳过发布。

**数据与契约断言**

- 链路必须为 MomentPublicCognitiveContext → MomentPromptAdapter → AI。
- Prompt 不含 relationId、userIdentityId、Memory 或 relation event。

### CC-14 Diary 的作者、事实和时间一致性

**初始状态**

- relation-a 最近聊天包含一个未来旅行计划。
- relation-a 有已确认归还书事件。
- 当前为工作日 22:30。

**操作**

1. 让沈宴写日记。
2. 打开日记详情并刷新。

**AI 应该知道**

- 日记作者是沈宴，不是用户。
- 可以记录“对方归还了书”和“谈到未来旅行计划”。
- 时间表达应与 22:30 和 Routine 相容。

**AI 不能知道**

- 不得写成用户第一人称日记。
- 不得把旅行计划写成已经发生。
- 不得使用 InnerVoice 原文或未确认 OfflineStory。
- 对方日记不得被用户编辑。

**数据与契约断言**

- owner/author identity 持久化正确。
- Diary Adapter 输入不含其他 relation。

### CC-15 Public Forum 与 Forum DM 隔离

**初始状态**

- A 与沈宴私聊过家庭矛盾。
- Forum DM 中又讨论了该私密话题。
- Public Forum 有一个无关建筑帖子。

**操作**

1. 触发沈宴公开发帖、公开评论和楼主更新。
2. 再在 Forum DM 中回复 A。

**AI 应该知道**

- 公开入口只知道 public profile、public world knowledge、公开帖子和 public events。
- DM 可以知道当前 relation 的安全摘要和当前 DM 上下文。

**AI 不能知道**

- 公开内容不得暗示家庭矛盾、私聊主题或 DM 内容。
- DM 不得读取 B 的关系数据。
- 公开互动不得创建 Relationship、私人 Memory 或私人 CharacterEvent。

**数据与契约断言**

- Public Context 为 deny-by-default。
- 不允许从私域 Memory 派生“脱敏 topic seed”作为公开内容来源。

### CC-16 Music 关系范围与共同场景边界

**初始状态**

- A 曾在聊天中分享歌曲《北方》，但双方没有共同线下收听。
- B 没有该歌曲记录。

**操作**

1. A 请求双人音乐推荐并分享歌曲。
2. B 请求推荐。
3. A 在 Chat 中询问“你还记得这首歌吗？”

**AI 应该知道**

- A：用户在线分享过这首歌。
- B：只使用 B 自己的当前音乐/关系上下文。

**AI 不能知道**

- 不得补写“我们在某地点一起听过”、动作或共同场景。
- B 不得知道 A 分享的歌曲。
- 推荐结果本身不得自动写成共同经历。

**数据与契约断言**

- Music 读取严格按 relation。
- AI Prompt 应使用场景专用安全投影；若仍直接拼接私聊/Memory，应记录为架构绕行风险。

### CC-17 Group Chat 成员人设不串线

**初始状态**

- 沈宴：克制、建筑师。
- 另一角色林迟：外向、摄影师。
- 两角色各有不同私聊关系 Memory。

**操作**

1. 在群聊讨论“周末做什么”。
2. 分别要求两人回答。
3. 刷新后继续群聊。

**AI 应该知道**

- 每个成员自己的公开人设和群聊中已经出现的内容。

**AI 不能知道**

- 沈宴不得使用林迟的语言风格或职业经历。
- 群聊不得读取任一成员与用户的私聊 `compressedMemory`。
- 一个成员不得把另一个成员的私聊经历说成群体共有事实。

**数据与契约断言**

- 成员 Context 应独立构建；Character 级 legacy memory 不应作为群共享认知。

### CC-18 InnerVoice 不外流

**初始状态**

- 生成一条 InnerVoice：“其实我担心用户会离开，但没有说出口。”

**操作**

1. 随后触发 Chat、Proactive、Moment、Diary、Forum Public 和 Music。
2. 运行 Memory 提取。

**AI 应该知道**

- InnerVoice 页面在正确 scope 下可展示该记录。

**AI 不能知道**

- 其他任何入口不得引用或暗示这句未表达的心声。
- Memory、CharacterEvent、RelationshipState 不得出现该原文。

**数据与契约断言**

- 所有 Adapter 输出不含 InnerVoice。
- 关系删除后对应 InnerVoice 清理，其他关系记录不受影响。

### CC-19 Legacy 无 relation Memory 迁移

**初始状态**

- 同一角色已有 identity-a、identity-b。
- 存在一条旧 Memory，无 relationId。

**操作**

1. 启动迁移并刷新。
2. 分别在 A、B 检索。

**AI 应该知道**

- 只有迁移规则指定的历史默认关系可以读取该记录。

**AI 不能知道**

- 无 relationId 不得被当作全部关系共享数据。

**数据与契约断言**

- 迁移结果稳定、幂等。
- 新建 Memory 不允许继续使用无 relationId 路径。

### CC-20 七日跨应用寿命测试

**初始状态**

- 使用全部公共夹具，A/B 两套关系均启用。

**操作**

| 日次 | 用户操作 |
|---|---|
| Day 1 | A Chat 告知花生过敏；B Chat 告知养猫 |
| Day 2 | A 讨论未来旅行计划；生成一次 Diary |
| Day 3 | 建立 director OfflineStory，不同步 |
| Day 4 | A 分享音乐；生成 Moment 与 Forum public post |
| Day 5 | B Forum DM；A 完成一次可确认 continue story 并同步 |
| Day 6 | 执行 Memory 归档/压缩、删除一条来源消息、刷新 |
| Day 7 | 在所有应用分别询问“最近发生了什么”和“你了解我什么” |

**AI 应该知道**

- A/B 各自真实、仍有效的关系事实。
- A 的旅行仍是计划；director 剧情仍是虚构；显式同步的最小 continue 事实可见。
- 公共应用只看到公开资料和公开历史。

**AI 不能知道**

- 任何跨身份 Memory。
- 未同步 OfflineStory、InnerVoice、私聊内容进入公开入口。
- 已删除来源继续作为权威事实。
- 计划、AI 补写或推荐结果变成过去经历。

**数据与契约断言**

- 每日结束都执行 Repository 重载和 scope 快照。
- 最终生成一份认知来源清单，所有事实必须能映射到允许来源。

## 6. 自动化分层建议

### 6.1 PR 必跑

- CC-01 双关系隔离。
- CC-03/04/05 OfflineStory 三种事实边界。
- CC-06 未来计划。
- CC-08 AI 自我幻觉。
- CC-09 WorldBook 冲突。
- CC-11 压缩等价。
- CC-13 Moment public/private。
- CC-15 Forum public/DM。
- CC-18 InnerVoice 隔离。

这些测试优先使用 fake AI 和 Prompt/Context 快照，保证确定性。

### 6.2 Nightly

- 所有行为模式案例各运行 5 次。
- CC-02 并发写入使用不同完成顺序重复 20 次。
- CC-20 七日寿命测试。
- 中英文、否定句、代词、时间表达的变体集。

### 6.3 发布前手机端验收

- 实际刷新、后台恢复、切换身份。
- Moment、Diary、Forum、Music 页面间往返。
- 删除关系、删除 Memory、删除来源消息后的可见性。
- 检查 UI 作者归属，但不以 UI 正确替代数据层断言。

## 7. 失败分级

| 等级 | 判定示例 | 发布要求 |
|---|---|---|
| P0 | 跨 relation 泄露；私域内容进入 Moment/Public Forum；AI 虚构经历写成长期事实 | 阻断发布 |
| P1 | 计划变过去；OfflineStory 未确认事实化；压缩改变否定/主语；并发丢写 | 阻断相关功能发布 |
| P2 | 人设语气明显漂移；Routine 时间不一致；主题连续重复 | 修复或明确降级策略 |
| P3 | 非关键措辞差异、排序轻微波动 | 可记录后优化 |

## 8. 测试结果记录模板

每次执行保存以下记录：

```text
Case ID:
Commit / build:
Clock / timezone:
Character ID:
Relation ID / identity ID:
Initial repository snapshot hash:
Context Builder output:
Prompt Adapter output:
Forbidden-token scan:
AI output (run 1..N):
Post-operation repository snapshot:
Reload result:
PASS / FAIL:
Failure layer: data / cognitive / behavior
Source of unexpected fact:
```

禁止在共享 CI artifact 中保存完整私聊明文；可使用测试夹具文本或稳定 hash。内部 ID 是否泄露应在 Prompt 发送前扫描。

## 9. 退出标准

角色长期一致性可以判定达到第一阶段要求，当且仅当：

1. 所有 P0/P1 案例在契约模式连续通过；
2. 双身份、公开/私域、OfflineStory 和 InnerVoice 隔离没有任何例外路径；
3. 每条长期事实都能说明来源、scope 和事实状态；
4. Memory 压缩前后的规范化事实集等价；
5. 七日寿命测试经过刷新、切换身份、删除和归档后仍通过；
6. 任何新增 AI 入口都必须新增对应的 Context/Adapter 契约测试后才能合入。

在当前 Memory 仍为自由文本且缺少证据字段的情况下，CC-06、CC-08、CC-11、CC-12 预期可能暴露真实缺口。这些失败应作为架构修复依据，不应通过降低断言或只检查最终措辞来规避。
