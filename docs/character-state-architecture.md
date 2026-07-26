# 小手机角色状态架构说明

> 适用范围：当前 `feature/ui-redesign-v1` 的实现。本文描述的是现有代码已经采用的边界与引用规则，不是新增的数据迁移方案。

## 1. 总览

小手机将“一个人是谁”“用户与其是什么关系”“双方现在是否同处”“过去发生过什么”分开处理。最重要的原则是：

- **Identity** 用稳定的 canonical `characterId` 确认实体；
- **Relationship** 不能由普通聊天自动升级；
- **Scene** 决定当前是否允许同场物理动作；
- **Event** 区分过去事实、当前上下文与未来意图；
- **Memory** 是历史参考，不能直接改写当前关系或场景。

这样可避免同名角色误合并、旧 contact 副本变成第二个角色、线下经历泄漏为线上当前场景，以及记忆把事件主体/客体反转。

## 2. canonical `characterId` 的作用

`Character.id` 是角色的唯一实体标识，也是所有跨功能关联应使用的键：

- 档案馆中的角色实体；
- 聊天会话和消息的 `Message.characterId`；
- 记忆的 `MemoryItem.characterId`；
- 线下剧情的 `OfflineStory.characterId` 与 `characterIds`；
- 朋友圈动态的角色作者/关联 `characterId`；
- 世界书角色专属条目和群成员引用。

`contact` 不是第二个角色实体。历史版本可能保留 `isContactInstance` 与 `profileSourceId`：前者是旧聊天联系人副本，后者指向其档案馆来源。`resolveCanonicalCharacterId()` 只依据这一明确来源映射回 canonical ID，绝不按名称、头像或人设相似度合并。因此，同名但不同 ID 的真实角色仍然是两个独立实体。

### 可用实体与历史兼容

`getAvailableCanonicalCharacterIds()` 只将非 `isContactInstance` 记录视为可操作实体。旧 contact 副本、旧消息和旧故事可保留作历史追溯，但不能：

- 开启新的单聊；
- 作为好友列表中的独立人物；
- 作为新的线下剧情角色选择。

## 3. 模块关系

| 模块 | 角色引用方式 | 责任 |
| --- | --- | --- |
| `character` / 档案馆 | `Character.id` | 唯一实体与人设来源 |
| `contact` / 好友关系 | canonical ID；旧副本经 `profileSourceId` 解析 | 表示“可聊天关系”，不是独立人物 |
| `Message` / 聊天 | `characterId`；群聊可附 `senderId` | 会话历史与消息归属 |
| `MemoryItem` / 记忆 | `characterId` | 某角色可召回的历史事实 |
| `OfflineStory` / 线下剧情 | `characterId`、可选 `characterIds`、`sourceChatId` | 独立剧情分支与可选线上续写交接 |
| `Moment` / 朋友圈 | 作者/关联角色 ID 与作者身份字段 | 发布者归属；不能按当前用户身份推断作者 |

所有新功能都必须从 canonical ID 开始查询角色，而不是用 name、avatar 或旧 contact ID 创建新实体。

## 4. 五个状态边界

代码中的非持久化状态词汇位于 `src/domain/character/characterState.ts`，用于统一判断而不强迫旧数据迁移。

### 4.1 Identity

回答“这是谁”。

- 唯一来源：canonical `characterId`；
- contact 只是关系映射；
- 同名不等于同一角色；
- 删除 canonical 实体后，引用它的关系应失效，而不是把旧 contact 副本提升为实体。

### 4.2 Relationship

回答“用户与角色是什么关系”。可用词汇为：`unknown`、`friend`、`close_friend`、`ambiguous`、`partner`。

当前默认值是 `unknown`。`canTransitionRelationship()` 要求关系变化有明确事件；普通聊天、关心、玩笑或单次互动不能自行升级为恋人、同居等确定状态。

当前关系词汇是**规范性状态模型**，不是新增的持久化字段。现有角色人设、世界书、明确剧情事件与已保存记忆仍是关系事实的来源。

### 4.3 Scene

回答“双方当前是否在同一物理空间”。场景值：

- `online_chat`：默认远程线上聊天；
- `offline_story`：线下剧情；
- `imagined_scene`：已明确的想象/假设场景；
- `memory_recall`：回忆过去。

只有 `offline_story` 和 `imagined_scene` 可被视为共享物理场景。`memory_recall` 是过去事实，不会把当前线上聊天变成同处一地。

### 4.4 Event

回答“该事实处于哪个时间层”。

- `event_history`：已发生的过去事实；
- `active_context`：当前正在进行的明确上下文；
- `future_intention`：未来约定或计划。

过去线下事件不能直接变成当前行为；未来约定也不能被当成已经发生的事实。

### 4.5 Memory

回答“角色可参考什么历史”。当前 `MemoryItem` 持久化字段包括 `characterId`、`content`、`timestamp`、`importance`、`isManual`。来源、作者、场景等语义目前由生成路径、内容标记和调用上下文确定，并未新增强制字段。

因此，未来若扩展 `source`、`owner`、`scene` 等字段，必须设计为可选字段并保持旧记忆可读。无论是否扩展，记忆都只能提供历史参考，不能直接改写 Relationship 或 Scene。

## 5. 角色创建与添加好友流程

1. 档案馆创建或导入角色，生成/保留其 `Character.id`。
2. 在聊天中“添加好友”时，只将该 canonical ID 写入好友关系列表 `phone_friend_ids`。
3. 不再创建 `contact-*` 形式的第二个 `Character`。
4. 读取旧数据时，历史 contact ID 会通过 `profileSourceId` 映射到档案馆角色。
5. 好友列表、聊天列表与线下选择器只展示仍存在的 canonical 实体。

## 6. 删除角色流程

档案馆删除角色时：

1. `App.tsx` 删除对应 canonical `Character`，并按现有设计清理其消息与动态；
2. 当前正在打开的该角色聊天会被关闭，相关通知被清除；
3. `AppChat` 使用 `pruneUnavailableCharacterRelations()` 从好友关系中移除已失效的 canonical/contact 引用；
4. 旧 contact 副本不会再显示为好友或新聊天入口；
5. `AppOffline` 会从角色选择器中移除该角色，并关闭引用已删除角色的活动剧情工作区；
6. 历史 Memory 与 OfflineStory 不会被本次关系清理批量物理删除，保留既有追溯策略。

## 7. 线上聊天状态规则

普通单聊和重新生成请求均注入“线上会话空间边界”。默认场景是远程 `online_chat`：

- 禁止凭空触碰用户、递现实物品、走到用户身边、坐在用户旁边；
- 禁止观察用户当前外貌、动作或进入用户房间；
- 禁止把过去的线下剧情或记忆视为当前共享地点；
- 允许角色描述自己的所在与动作，例如“我去厨房倒杯水”；
- 允许提出未来建议，例如“下次见面给你带”；
- 只有当前对话明确建立同场场景时，才允许同场行为。

## 8. 线下剧情状态规则

`OfflineStory.mode` 有三种：`continue`、`director`、`if`。

- `continue`：只有同时具备 `sourceChatId`、`sourceChatMsgCount` 或导入聊天快照，且存在未同步新增剧情时，才会在退出/返回线上聊天时自动生成 handoff memory；
- `director` 与 `if`：可导入线上历史作为写作参考，但属于独立分支，不自动回流线上记忆；
- 手动同步入口仍保留原有语义；
- 导入的线上消息标记为上下文，不会被当作新的线下剧情事实；
- 回流内容优先提取第三人称、主体明确的事实，排除旁白、动作演出和原始剧本对白。

## 9. Memory 生成与回流

### 在线聊天

MemoryService 基于某个 `characterId` 的聊天上下文提取与召回记忆。召回时必须按角色 ID 隔离，不能因为系统中存在另一个角色就读取对方记忆。

### 线下续写回流

`shouldAutoSyncOnlineContinuation()` 仅在“明确从线上续写且有新增内容”时为真。同步流程：

1. 从未同步的线下消息中过滤导入上下文、旁白和空内容；
2. 以当前角色的 canonical ID 调用记忆提取；
3. 提取失败时创建带稳定 marker 的简洁 handoff memory；
4. 成功持久化后才更新故事的同步计数、状态与 marker；
5. 下一次线上聊天仅将事实型 handoff 注入 Prompt，避免复述原始剧情演出文本。

### 朋友圈

朋友圈发布者由实际作者身份决定；角色发布不能被记作用户发布。朋友圈内容不支持聊天表情包/语音 markup，允许文字、图片以及项目已有的视频能力。

## 10. 未来功能接入规则

新增 AI 功能、页面或服务时必须遵守：

1. 输入/输出统一使用 canonical `characterId`；
2. 遇到旧 contact ID，先用 `resolveCanonicalCharacterId()` 映射；没有明确 `profileSourceId` 不得按名称或头像猜测；
3. 创建前先检查 `isAvailableCanonicalCharacterId()`，已删除或仅为 legacy contact 的角色不能新建聊天、任务或线下选择；
4. Relationship 变化必须携带明确事件来源，不能由普通聊天自动提升；
5. 默认 Scene 为 `online_chat`，只有明确场景切换才能产生同场互动；
6. Memory 写入要指定正确 `characterId`，并把过去事实、当前场景、未来意图分开；
7. 线下自动回流必须复用 `shouldAutoSyncOnlineContinuation()`，不得为导演、IF 或实验分支另开自动同步通道；
8. 不要从 `name`、`avatar`、显示备注或群成员数组创建新角色实体；
9. 任何新增持久化字段都应为向后兼容的可选字段，旧数据必须继续可读。

## 11. 关键实现位置

- `src/domain/character/characterIdentity.ts`：canonical ID 解析、可用实体判断、失效关系裁剪；
- `src/domain/character/characterState.ts`：关系、场景、事件的统一状态词汇与边界；
- `src/components/AppChat.tsx`：好友关系裁剪、聊天入口过滤、线上空间边界注入；
- `src/components/AppOffline.tsx`：线下角色选择与线上续写自动回流；
- `src/domain/memory/offlineMemorySync.ts`：续写同步资格、事实 handoff 与去重 marker；
- `src/App.tsx`：角色删除后的顶层会话与通知清理。
