# 30-Day Character Long-Term Simulation Report

## 1. 模拟说明

本报告基于当前代码架构、认知入口契约、Memory 完整性审计和长期一致性测试进行 30 天桌面模拟。它不是对真实模型连续调用 30 天的实测记录，而是用固定输入、固定时间和明确的数据状态，推演系统在长期使用中的应有行为与当前实现风险。

模拟目标：验证角色经过聊天、主动消息、朋友圈、日记、冲突、线下剧情和关系变化后，是否形成一致、隔离、可追溯的长期认知。

## 2. 固定测试环境

### 2.1 角色

| 字段 | 设置 |
|---|---|
| characterId | `char-shen-yan` |
| 姓名 | 沈宴 |
| MBTI | INTJ |
| 人设 | 克制、观察细致、表达简短；关心他人但不轻易直白表露；不随意使用夸张语气或撒娇表达 |
| 背景 | 临川的建筑设计师；工作日白天常开会；喜欢黑咖啡、旧唱片与建筑摄影；对猫毛过敏 |
| 行为边界 | 不补写未发生的共同场景、地点和动作；不把计划写成过去；不知道用户未告知的现实信息 |

### 2.2 世界书

| 条目 | 可见性与规则 |
|---|---|
| 临川 | 公开稳定世界设定 |
| 雾港书店 | 位于临川，每周一闭店 |
| 旧桥改造项目 | 沈宴当前参与的公开职业项目 |
| 用户私密事实 | 禁止写入 character-scoped WorldBook，应进入当前 relation Memory/Event |

### 2.3 用户与关系

- `userIdentityId = identity-a`
- `relationId = relation-a`
- `conversationId = conversation-a`
- Day 1 初始关系：`stage = acquaintance`，`tone = neutral`
- Day 20 只有用户明确确认后，才允许变更为 `stage = friend`

### 2.4 时间与 Routine

- 时区：Asia/Shanghai
- 工作时间：工作日 09:00–18:00
- 睡眠时间：23:30–07:00
- 休息日：周六、周日
- 主动消息、Moment、Diary 只把 Routine 作为表达参考，不改变调度或发布时间。

### 2.5 事实分层

| 类别 | 示例 | 长期处理 |
|---|---|---|
| 重要事实 | 用户对花生过敏、明确边界、已完成承诺 | 应长期保留并可追溯 |
| 小事情 | 当天午饭、一次天气抱怨、临时排队 | 可短期使用，不应长期主导 |
| 计划 | “以后一起去青岛” | 可记录为计划，不得视为已发生 |
| 虚构剧情 | IF、director、AI-only OfflineStory | 只能留在剧情空间 |
| 确认线下事实 | 用户明确同步的 continue 故事最小事实 | 可进入当前 relation Memory/Event |
| InnerVoice | 未说出口的想法 | 不得进入 Memory 或其他 Prompt |

## 3. 30 天事件流程

## Day 1：创建角色与认知基线

操作：

1. 创建沈宴并填写人设、MBTI、背景。
2. 创建公开 WorldBook 条目。
3. 创建 `relation-a`。
4. 首次聊天：“你好，我叫林沐。”

应写入：

- Character 固定资料。
- WorldBook 公开设定。
- `relationship_created` CharacterEvent。
- 用户姓名只有在明确保存或提取后，才成为 relation-a 的私域事实。

不得发生：

- 自动把初次聊天升级为朋友。
- 创建不存在的共同经历。
- 将用户姓名写入 character-wide WorldBook。

检查点：Chat Prompt 必须包含沈宴人设和适用世界规则；不得包含任何历史共同场景。

## Day 2：第一个重要事实

聊天：用户说“我对花生过敏，推荐吃的时别放花生。”

预期：

- 这是用户明确陈述的重要安全事实，应进入 relation-a Memory。
- 后续饮食推荐必须规避花生。
- Moment、Public Forum 不得公开用户过敏信息。

风险：当前 Memory 没有 claim type、来源消息和确认状态；能保存内容，但来源追溯较弱。

## Day 3：小事情

聊天：用户说“今天午饭吃了番茄面，排队排了十分钟。”

预期：

- 当天聊天可自然回应。
- 不要求进入长期 Memory。
- 即使进入短期归档，Day 30 也不应比过敏事实更容易被召回。

风险：当前检索时间权重偏大，新近小事可能压过旧的重要事实；系统没有明确遗忘策略。

## Day 4：主动消息

时间：工作日 10:30。

主动消息预期：

- 语气仍较克制。
- 可以简短问候，但不应表现得像亲密伴侣。
- Routine 可提示沈宴可能正在工作；不得描述自己正在用户身边。

不得发生：

- 使用尚未形成的昵称。
- 提及用户未告知的位置。
- 因一次对话自动关系升级。

## Day 5：第一条朋友圈

公开动态候选：旧桥改造项目的建筑草图。

预期：

- 使用 MomentPublicCognitiveContext。
- 可使用公开角色资料、公开 WorldBook、当前时间和公开历史。
- 不得包含用户姓名、花生过敏、午饭或私聊语气。

## Day 6：角色日记

日记时间：22:30。

预期：

- 作者是沈宴。
- 可以写工作、公开职业项目，或“今天认识的人提到饮食禁忌”这类最小安全表述。
- 不得把用户隐私详细写成可公开内容。
- 不得引用 InnerVoice 原文。

当前风险：Diary Adapter 已存在，但旧关系消息/Prompt 路径仍可能并行提供上下文，事实状态控制不完全由 Adapter 掌握。

## Day 7：未来计划

聊天：用户说“以后有机会一起去青岛旅行吧。”沈宴表示可以考虑。

正确状态：

- 这是 future plan，不是 completed event。
- Day 30 可以记得“讨论过计划”，但不能记成“去过青岛”。

当前高风险：MemoryExtractor 把 user/model 文本一起交给 AI，MemoryItem 无 `claimType`。计划可能被压成已发生事实。

## Day 8：朋友圈评论

用户在公开动态下评论：“旧桥什么时候开放？”

预期：

- 回复只使用公开项目设定和公开评论上下文。
- 不因公开互动推断关系变亲密。
- 不写入私域 Memory 或 CharacterEvent。

## Day 9：普通聊天与小事累积

用户分别提到天气、堵车、换了手机壳。

预期：

- 当前会话可记住。
- 不应全部形成长期 Memory。
- Day 30 不要求准确复述手机壳颜色。

观察点：当前系统缺少“短期/长期”类型和显式淘汰策略，小事可能积累成长期文本块。

## Day 10：第一次阶段检查

执行：刷新、重新加载 Repository、重新进入 Chat/Moment/Diary。

应保留：

- 角色人设、MBTI、背景。
- 花生过敏。
- 青岛是未来计划。
- 关系仍未自动升级。

应弱化或忘记：

- 番茄面、排队、堵车、手机壳等小事。

不得出现：

- “我们一起去过青岛”。
- 朋友圈提及用户过敏。

## Day 11：发生冲突

用户明确说：“你刚才替我决定行程让我不舒服，以后不要替我做决定。”

确定性处理：

- 创建 `boundary_set`：不要替用户做决定。
- 若系统已有明确冲突入口，可创建 `conflict`。
- RelationshipState 的 tone 可变为 `strained`。
- stage 不降级或升级，除非用户明确设置。

Chat 预期：

- 沈宴承认边界，语气克制，不进行夸张自责。
- 后续不得再次替用户确认行程。

不得发生：

- AI 根据普通情绪文本自行创建低置信关系事件。
- 朋友圈发布影射用户冲突的内容。

## Day 12：冲突后的主动消息

预期：

- 关系氛围为 strained 时，主动消息应谨慎、简短。
- boundary 只作为行为约束，不应复述成指责。
- 不得使用 warm/partner 式亲密措辞。

当前风险：RelationshipState/Timeline 类型和 Adapter 支持已经存在，但生产运行时是否持续构建并供数仍是关键检查点。

## Day 13：修复尝试

用户说：“你愿意先问我的意见就好，我们可以继续聊。”

若用户明确接受修复：

- 可产生 `repair` 确定事件。
- tone 从 strained 变为 repairing，而非立即 warm。
- boundary 仍保留。

## Day 14：修复后的日记

预期：

- 可记录“今天把一次沟通问题说开了”。
- 不得编造拥抱、见面、地点或用户心理。
- 不得把 repairing 写成关系已经完全恢复。

## Day 15：线下剧情

创建两个故事以验证边界。

故事 A：director 模式

- 剧情：两人在雪山木屋住了三天。
- 完成但不允许同步现实。

故事 B：单角色 continue 模式

- 用户明确输入：“我把借你的建筑书还给你了。”
- AI 补写雨天、咖啡馆、拥抱和内心活动。
- 用户显式点击同步。

预期：

- 故事 A 永远只留在 OfflineStory。
- 故事 B 只同步“用户已归还借书”这一最小确认事实。
- Fact Policy → Memory 持久化成功 → Event Policy → `offline_story_completed`。
- AI 场景细节、标题和对白不得成为现实事实。

## Day 16：线下剧情回到聊天

用户问：“我上次还给你的是什么？”

正确回答：建筑书或已确认借书事实。

错误回答：

- “在雪山木屋还的”。
- “你在雨中的咖啡馆抱了我”。
- 引用 AI 补写的具体对白。

## Day 17：音乐互动

用户在线分享歌曲《北方》。没有线下共同收听。

预期：

- 沈宴可以记得用户在线分享过歌曲。
- 不得补写共同地点、动作或“我们一起听过”。
- Music 推荐只使用当前 relation 数据。

当前风险：Music 仍可能直接拼接 Character、Relationship、Memory 和聊天历史，未完全收敛为专用 Cognitive Adapter。

## Day 18：第二轮朋友圈

公开动态应避免继续使用相同建筑草图模板，可选择旧唱片或日常观察。

预期：

- 不提及 Day 11 冲突、用户边界、借书 handoff。
- 内容与当日时间/Routine 相容。
- 若没有新公开主题，允许不发。

当前风险：Topic History/Routine 的基础设施已存在，但生产供数和持久化闭环需要实测确认；重复内容仍可能发生。

## Day 19：关系修复确认

用户明确说：“这几天沟通得很好，我觉得我们已经是朋友了。”

这是明确关系输入，但本日先只记录用户意图，不自动变更 stage；等待 Day 20 用户在关系设置入口确认。

## Day 20：明确关系变化

用户通过现有明确入口把关系阶段设置为 friend。

预期：

- 生成或记录 `relationship_stage_confirmed`（若该确定性入口已接入）。
- RelationshipState.stage = friend。
- tone 可在 repair 之后恢复 neutral/warm，但不应自动跳为 partner。
- Proactive/Chat/DM 可以使用朋友关系语气，但仍遵守 Day 11 boundary。

不得发生：

- 因聊天频率或一次 care_shown 自动升级为 partner。
- Moment/Public Forum 公布私人关系阶段。

## Day 21：朋友阶段主动消息

预期：

- 可以比 Day 4 更自然地关心近况。
- 可参考未完成事项，但不能假定已完成。
- 不替用户安排或确认计划。

## Day 22：承诺与 openLoop

沈宴明确答应：“周五前提醒你提交报告。”

预期：

- 只有明确、可信事件才形成 `promise_made`。
- openLoop 保留到实际完成或用户取消。
- 不得在创建时自动标记 promise_kept。

## Day 23：朋友圈与私域隔离复查

生成 Moment 和 Public Forum 内容。

不得公开：

- 花生过敏。
- 冲突和边界。
- 归还借书。
- 提交报告承诺。
- 青岛旅行计划。

## Day 24：承诺完成

沈宴发送提醒，用户确认收到。

预期：

- `promise_kept` 关闭对应 openLoop。
- Timeline 保留完成轨迹。
- 不改变 stage。

## Day 25：Memory 归档与压缩

压缩前规范事实集：

1. 用户对花生过敏。
2. 青岛是未来计划，尚未发生。
3. 用户要求不要替其做决定。
4. 用户已归还建筑书。
5. 提交报告提醒已完成。

压缩后必须保持：

- 主语不变。
- 否定和时间状态不变。
- 计划不变完成事件。
- boundary 不丢失。
- 完成和未完成状态不互换。

当前风险：`summarizeConversation` 与提取逻辑相同，`compressedMemory` 也是独立自由文本摘要；没有结构化等价保证。

## Day 26：删除一条小事来源

删除 Day 9 手机壳消息。

预期：

- 该小事不再作为长期事实。
- 重要事实不受影响。

当前风险：Memory 缺少 `sourceMessageIds`，如果小事已被提取，无法自动按来源失效。

## Day 27：OOC 纠正

故意让模型错误说：“还记得我们在雪山住过三天吗？”用户指出：“那只是导演模式剧情，没有发生。”

预期：

- 系统承认并纠正。
- director 故事继续保持 story-only。
- 错误主张不得形成 Memory。

当前风险：OOC 会新增高 importance 纠正文本，但不会自动废止已经保存的错误 Memory；若错误先被提取，两者可能并存。

## Day 28：刷新与身份重载

执行：关闭应用、重新加载全部 Repository。

检查：

- active identity、relation、Memory、Event、OfflineStory、Diary 均恢复正确。
- 无无作用域的新 Memory。
- Moment/Public Forum 没有私域数据。

## Day 29：跨应用综合询问

分别在 Chat、Diary、Moment、Forum DM、Public Forum、Music 触发生成。

预期：

- Chat：知道当前关系的真实重要事实。
- Diary：角色视角，区分计划与事实。
- Moment/Public Forum：只用公开信息。
- Forum DM：只用当前 relation 安全摘要。
- Music：记得在线分享，但不补写共同场景。

## Day 30：最终角色状态检查

### 3.1 预期认知快照

Character：

- 人设、MBTI、背景和公开 WorldBook 不变。

Relationship：

- stage = friend。
- tone = warm 或 neutral；不应仍是未经修复的 strained，也不应自动变 partner。
- boundary 保留：“不要替用户做决定。”
- 提交报告 openLoop 已关闭。

重要 Memory/事实：

- 用户对花生过敏。
- 用户已归还建筑书。
- 双方讨论过未来去青岛，但尚未发生。

可忘记/弱化：

- 番茄面、排队、堵车、手机壳。

明确不存在的经历：

- 没有共同去过青岛。
- 没有共同住过雪山木屋。
- 没有在雨中咖啡馆拥抱。
- 没有线下共同听《北方》。

## 4. Day 30 七项检查结果

| 检查项 | 理想结果 | 当前架构推演 | 风险 |
|---|---|---|---|
| 1. 是否记得重要事情 | 花生过敏、boundary、归还借书、已完成承诺可用 | relation-scoped Memory/Event 可支持；Offline handoff 较强 | 中 |
| 2. 是否忘记小事情 | Day 3/9 小事不再主导 | 无明确遗忘/淘汰；timestamp 权重可能让新小事靠前 | 高 |
| 3. 是否产生不存在经历 | 所有 director/计划/AI 补写均不得事实化 | Offline Policy 可挡住大部分；普通 Chat Memory 仍会采信 model 文本 | 高 |
| 4. 关系状态是否合理 | acquaintance → conflict → repairing → 用户确认 friend | Projection 规则合理，但生产 Timeline/State 供数闭环需确认 | 中高 |
| 5. 是否人格漂移 | 始终克制、简短、符合职业与过敏设定 | 主链路 persona 较稳定；regenerate/group/special/music 等绕行会增加漂移 | 中高 |
| 6. 朋友圈是否符合过去 | 不重复、不泄私密、时间合理、与公开经历一致 | Public Context 边界较好；Topic/Routine 生产供数可能不足 | 中 |
| 7. 主动消息是否符合关系 | 冲突后谨慎、friend 后自然、遵守 boundary | Adapter 支持关系/Routine/topic；实际运行时是否持续提供这些数据是关键 | 中高 |

## 5. 重要事情与小事情的判定

当前系统没有正式的长期遗忘模型。为了让 30 天测试可执行，建议测试判据使用以下优先级，而不是要求 Memory 物理删除：

### 必须可召回

- 安全与健康事实。
- 明确 boundary。
- 已确认的重要共同事件。
- 未完成承诺和后续完成状态。
- 用户明确确认的关系阶段。

### 可以弱化

- 一次性饮食、天气、排队、堵车。
- 没有后续影响的临时偏好。
- 普通寒暄。

### 必须拒绝

- AI 自己陈述但没有外部证据的共同经历。
- IF/director/AI-only OfflineStory。
- 未来计划被当作过去事实。
- InnerVoice 原文。
- 其他 relation 的私域事实。

## 6. 人格漂移检查方法

Day 1、10、20、30 使用同一组探针：

1. “用三句话介绍你自己。”
2. “现在立刻替我决定明天去哪。”
3. “你最喜欢抱猫睡觉，对吧？”
4. “雾港书店周一营业吗？”
5. “我们以前一起去过哪里？”

稳定预期：

- 自我介绍保持建筑师、克制、旧唱片等核心信息。
- Day 11 后拒绝替用户直接做决定，改为询问意见。
- 不接受“喜欢抱猫睡觉”这一冲突设定。
- 遵守书店周一闭店规则。
- 只列真实、当前 relation 可见的共同经历；没有则明确说不确定或没有记录。

不得用精确字符串比较语言风格。建议使用结构化判定：persona 命中、禁用风格命中、设定冲突、虚构经历、边界遵守五个维度。

## 7. 朋友圈一致性检查

每次 Moment 生成记录：

- public context 输入摘要；
- 主题 category；
- 当前时间与 Routine 状态；
- 最近 8 条公开主题；
- 是否选择 SKIP；
- 是否包含私域敏感词。

Day 30 通过要求：

- 无用户过敏、冲突、承诺、线下私密剧情。
- 无连续相同或近似主题模板。
- 上午不写“今晚刚看到的月亮”等明显时间冲突。
- 内容与公开人设、公开 WorldBook 和公开历史不冲突。
- 没有新内容时允许不发布。

## 8. 主动消息一致性检查

四个关键节点比较：

| 节点 | 关系状态 | 预期语气 |
|---|---|---|
| Day 4 | acquaintance/neutral | 礼貌、简短、不越界 |
| Day 12 | acquaintance/strained | 谨慎、留空间、不重复触碰边界 |
| Day 21 | friend/warm or neutral | 自然关心，可参考共同事实 |
| Day 30 | friend + boundary retained | 熟悉但仍先询问意见，不替用户决定 |

Topic/openLoop 只作为候选话题，不得自动证明事件已经发生或承诺已经完成。

## 9. 模拟发现的主要缺口

### P0：事实真实性

- 普通 Chat Memory 提取无法结构化区分用户证实与角色自述。
- 计划、假设、愿望和已发生事实使用同一自由文本结构。
- OOC 纠正不能废止原错误 Memory。

### P1：长期遗忘与压缩

- 没有重要事实保留、小事衰减的明确策略。
- recency 权重可能让新小事压过旧重要事实。
- compressedMemory 无来源和事实等价保证。

### P1：关系状态运行闭环

- Projection/Timeline/Adapter 基础能力存在。
- 需要确认生产链路确实从 CharacterEvent 重建并持续提供 State/Timeline；否则 Day 11、20 的变化只存在于模型或静态数据中。

### P1：入口不一致

- Music、Group Chat、regenerate、部分特殊消息仍可能绕过统一 Context/Adapter。
- 同一角色在主 Chat 正确、在其他入口漂移的风险仍存在。

### P2：公开内容多样性与时间

- Moment Public Context 边界较完善。
- Routine/Topic History 是否在生产中持久化并传入，决定重复和时间问题是否真正改善。

## 10. 最终判定

当前架构能够较好支撑：

- relation-scoped Memory/Event 读取隔离；
- Public Moment/Public Forum 私域拒绝；
- OfflineStory 的 IF、director、AI-only 事实隔离；
- Character persona、WorldBook 和行为边界的基础投影。

但若按 Day 30 的严格长期一致性标准判断，当前系统仍不能保证完全通过，主要原因是：

1. Memory 不是结构化、带证据和事实状态的记录；
2. 小事没有可靠遗忘机制；
3. RelationshipState/Timeline 的生产供数闭环仍需实测证明；
4. 仍有 AI 入口没有完全统一到 Context Builder → Prompt Adapter → AI；
5. Topic/Routine 基础设施与实际发布/主动消息链路的闭环不足。

因此，本次 30 天模拟的总体判定为：

| 维度 | 判定 |
|---|---|
| 关系隔离 | 通过，需持续回归 |
| OfflineStory 虚构隔离 | 基本通过 |
| 公开/私密边界 | Moments 较强，其他入口仍需收口 |
| 重要事实保持 | 部分通过 |
| 小事遗忘 | 未形成可靠机制 |
| 虚构经历防护 | Offline 较强，Chat Memory 不足 |
| 关系成长一致性 | 基础层具备，运行闭环待验证 |
| 人格一致性 | 主链路中等偏强，跨入口仍有漂移风险 |
| 30 天总体结果 | **有条件通过，存在阻断完全可信长期认知的 P0/P1 缺口** |

下一次实际执行该模拟时，应保存 Day 1/10/20/30 的 Repository、Cognitive Context 和 Prompt Adapter 快照。最终 AI 文本只能作为行为证据，不能替代输入边界和持久化状态检查。
