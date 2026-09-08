# 小手机项目：角色可信长期陪伴系统完整实施计划与 Codex 主提示词

> 用途：将本文件完整发送给一个没有历史上下文的新 Codex 窗口。新窗口应先阅读本文件，再在当前仓库中按阶段执行。
>
> 文档基线：2026-08-01，分支 `agent/relationship-isolation`，最近已推送提交 `757c843 fix: isolate proactive voice calls by identity`。
>
> 本计划的核心不是继续堆叠 Prompt 或 Context，而是让角色看到的数据具有明确来源、真假状态、时间语义、关系作用域和撤销能力。

---

## 0. 可直接发送给新 Codex 的主提示词

下面整段就是执行指令。新 Codex 收到后，不需要用户再次解释项目背景。

```text
你正在维护一个名为“小手机”的 React + TypeScript AI 社交模拟应用。

请先完整阅读随本提示提供的《小手机项目：角色可信长期陪伴系统完整实施计划与 Codex 主提示词》，然后进入仓库执行。

你的总目标是：

1. 完成所有私域交互产物的关系/身份隔离审计，覆盖普通聊天以及相册、图片、语音、语音电话、红包、转账、位置、文件、贴图、引用、音乐、日记分享、论坛分享、心声、群聊等入口。
2. 建立 Character Truth Layer（角色事实治理层），让“事实、偏好、计划、信念、假设、摘要、OOC纠正、剧情内容”不再混成同一种 Memory。
3. 修复 Memory 的写入审核、来源追溯、时间语义、压缩失真、冲突合并和撤销链。
4. 让 RelationshipState / RelationshipTimeline 真正进入生产供数闭环，但禁止游戏化好感度和自动关系跳级。
5. 对 WorldBook 做公开世界观、角色稳定设定、关系私密内容的分层隔离。
6. 收口仍绕过 Cognitive Context / Prompt Adapter 的 AI 入口。
7. 建立删除、备份、迁移、审计和长期一致性测试闭环。

执行原则：

- 先审计，后设计，再实现；不要一上来重写 Memory。
- 按本文 Phase 0 → Phase 13 顺序渐进执行。
- 每一阶段都先执行 git status、git diff --stat、相关代码搜索，保护已有改动。
- 禁止 git add .。
- 不要修改或合并 main。
- 不要提交、不要推送，除非用户之后明确要求。
- 不要整体 checkout/revert 大文件。
- 不要改变 UI、CSS、交互体验，除非某个阶段明确授权。
- 保持旧数据可读；新写入必须走新规则，legacy 只能受限兼容。
- 任何 private direct 数据都必须以 relationId 为主边界，并校验 characterId + userIdentityId。
- 任何 public 生成都必须 deny-by-default；safe 不等于 public。
- Character 只保存稳定人设和角色级资料，不能存某个身份专属关系事实。
- Memory/Knowledge 不能因为“AI说过”就成为事实。
- CharacterEvent 只记录明确发生且可追溯的事件。
- RelationshipState 必须由事件投影，不允许普通聊天自动升级关系。
- OfflineStory 默认是虚构叙事域，只有现有 Fact Policy / Event Policy 允许且用户明确确认后才可出域。
- InnerVoice 永远不是事实来源，也不能泄露到 Chat、Moment、Public Forum、Proactive 或 Memory。

当前工作树可能保留以下未跟踪审计/测试文件，它们属于已有工作，不得删除、覆盖或误提交：

- docs/30-day-character-simulation-report.md
- docs/character-consistency-test-plan.md
- docs/character-experience-final-review.md
- docs/character-system-global-audit.md
- docs/memory-integrity-audit.md
- scripts/characterLongTermConsistency.test.ts

开始时执行：

git status --short
git branch --show-current
git log --oneline -20
git diff --stat
npm.cmd run lint
npm.cmd run build
git diff --check

然后先完成 Phase 0 和 Phase 1 的只读审计文档，再进入最小修复。每个阶段完成后都报告：

1. 发现的问题与根因
2. 修改文件
3. 数据兼容策略
4. 新增测试
5. lint/build/test/diff-check 结果
6. git status --short
7. 下一阶段风险

不要用“测试通过”代替证据；列出实际执行的测试文件和结果。
```

---

## 1. 项目是什么

“小手机”不是普通聊天壳，而是一个本地优先的 AI 社交模拟应用。用户可以创建角色、创建多个机主身份，并让同一个角色在不同身份关系中拥有隔离的聊天、记忆、线下剧情、朋友圈、日记、论坛私信、音乐互动和长期关系轨迹。

### 1.1 主要用户功能

- 桌面与外观：桌面图标、Widget、壁纸、主题、深浅色、状态栏、安全区、图标模式。
- 角色：角色人设、背景、MBTI、头像、相册、角色专属设置、导入导出。
- 多身份：机主可以切换身份；同一个角色可以在不同身份下形成不同关系。
- 聊天：单聊、群聊、主动消息、引用、贴图、图片、语音、电话、红包、转账、位置、文件、翻译、心声。
- 朋友圈：用户和角色动态、评论、回复、公开时间、主题去重。
- 日记：用户日记、角色日记、AI 生成、分享、删除、翻译。
- 论坛：公开帖子、评论、回复、楼主更新、活动、论坛私信、分享。
- 线下剧情：continue、IF、director 等模式，线上上下文导入、记忆同步、完成事件。
- 音乐：双人音乐、推荐、播放状态、关系音乐上下文、音乐分享。
- 记忆库：AI 提取、手工维护、OOC 纠正、压缩、检索、线下同步。
- 世界书：全局/角色绑定、Scope/Trigger、启用禁用、导入词条。
- 日历、设置、备份恢复等辅助能力。

### 1.2 技术形态

- React 19 + TypeScript + Vite。
- 本地数据主要通过 `localStorage` Repository 保存，图片等资源可能使用 IndexedDB。
- AI 请求集中使用现有 API helper，但仍有多个场景在组件中直接组装 Prompt。
- 测试以 `scripts/*.test.ts` / `*.test.tsx` 为主，通常通过 `npx.cmd tsx scripts/xxx.test.ts` 执行。
- `npm.cmd run lint` 实际执行 `tsc --noEmit`。
- `npm.cmd run build` 执行 Vite 与 server bundle 构建。

---

## 2. 当前架构地图

### 2.1 目录职责

| 目录 | 当前职责 |
|---|---|
| `src/components/` | 页面容器和历史业务编排。`AppChat.tsx` 仍然很大，包含若干旧 Prompt 和特殊消息流程 |
| `src/features/` | 按功能拆分的 controller、service、hook、UI 子组件、Prompt Adapter |
| `src/domain/` | 纯领域类型、规则、Policy、Projection、Context Builder；不应读取 localStorage、React 或 AI |
| `src/core/storage/` | storage keys、迁移、Repository、读写结果与兼容处理 |
| `src/styles/` | 全局与主题样式；本计划默认不修改 |
| `scripts/` | 自动化验收与回归测试 |
| `docs/` | 审计、架构设计、实施约束和验收报告 |

### 2.2 核心私域身份链

```text
UserIdentity.id + Character.id
               ↓
      CharacterRelationship
               ↓
 relationId + conversationId
               ↓
 Message / Memory / CharacterEvent / OfflineStory / InnerVoice
 Diary share / Forum DM / Music state / generated assets
```

直接关系中的数据不能只靠 `characterId` 区分。同一个 Character 可以被多个机主身份添加，`characterId` 是共享角色定义，`relationId` 才是私域关系边界。

### 2.3 当前认知体系

已经存在：

- `CharacterCognitiveContext`：私域认知快照。
- `ChatPromptAdapter`、`ProactivePromptAdapter`、`DiaryPromptAdapter`、`ForumDirectMessagePromptAdapter`。
- `MomentPublicCognitiveContext` 与 Moment Adapter。
- `PublicForumCognitiveContext` 与 Post/Reply/Activity Adapter。
- `CharacterEvent` Repository 和确定性事件捕获。
- `RelationshipState` 纯投影和 `RelationshipTimeline` 只读查询。
- `CharacterRoutine` 纯规则。
- Moment/Proactive Topic History 纯规则。
- OfflineStory Fact Policy、Event Policy 与完成事件捕获。

理想读取链路：

```text
Scoped repositories
       ↓
Context Builder
       ↓
Prompt Adapter
       ↓
Prompt assembly
       ↓
AI request
```

理想事实写入链路：

```text
Raw evidence / deterministic action
       ↓
Candidate extraction
       ↓
Truth Write Policy
       ↓
Knowledge Repository / CharacterEvent Repository
       ↓
Derived summaries / Relationship projection
```

### 2.4 已经完成并应保留的关键能力

- OOC Memory 已按 relationId 隔离；无 relationId legacy 只属于默认关系。
- OfflineStory 单关系 Scope、删除清理和 legacy 兼容已修复。
- OfflineStory 默认不是事实；IF、director、未完成、纯 AI 续写不能进入现实 Memory/Event。
- CharacterEvent 强制绑定 `relationId + characterId + userIdentityId`，具备幂等和关系删除清理。
- Chat、Moment、Proactive、Diary、Forum DM、Public Forum 已建立不同程度的 Context/Adapter。
- Moment Prompt 已移除私聊历史、Memory、Relationship、InnerVoice 等私域输入。
- Moment 与 Public Forum 都采用 public deny-by-default，且 safe 不等于 public。
- 主动语音通话已在提交 `757c843` 中绑定关系范围；切换身份会让旧通话失效，通话记录带 relationId/conversationId。
- 设置中的 active identity 已持久化。
- 删除关系会清理多类 relation-owned 数据。

这些能力不应在后续重构中回退。

---

## 3. 当前核心判断与技术决策

### 3.1 当前成熟度

项目已从“单纯靠 Prompt 的角色聊天”进入“有关系隔离和认知边界的 AI 应用”，但尚未成为可信长期陪伴系统。

当前最重要的问题已经不是继续增加 Context，而是：

1. AI 看见的数据到底是不是真的。
2. 数据属于哪个身份、哪个关系、哪个会话。
3. 计划、假设、剧情、AI 推测会不会被误写成已发生事实。
4. 压缩和合并后能否追溯原始证据并撤销。
5. 关系、情绪、作息、话题历史是否真的在生产链供数，而不是只存在于类型和测试。

### 3.2 总体技术方向

下一阶段建立 `Character Truth Layer`，建议领域名称使用 `characterKnowledge` 或 `characterTruth`，核心记录使用 `KnowledgeClaim`。不要把所有长期内容继续统称为 Memory。

推荐层次：

```text
Character Truth / Knowledge System
├── KnowledgeClaim
│   ├── fact
│   ├── preference
│   ├── plan
│   ├── belief
│   └── hypothesis
├── CharacterEvent               明确发生的事件
├── ConversationSummary          可重建摘要，不是事实
├── BehaviorCorrection / OOC     行为约束，不是事实
├── StoryKnowledge               剧情域内容，不默认出域
└── TemporaryContext             单次生成上下文，不持久化为事实
```

### 3.3 信任优先级

发生冲突时建议采用以下优先级：

1. 用户明确纠正或用户在 UI 中确认/编辑的结构化记录。
2. 应用真实发生的确定性动作，例如确实发送红包、完成通话、显式完成并同步线下故事。
3. 用户消息中的明确第一人称陈述。
4. 经来源保留的 AI 提取候选。
5. legacy Memory 与旧 compressedMemory。
6. AI 自己的回复、推断、想象、叙事补全。

第 6 级不能直接成为事实。

---

## 4. 不可违反的数据边界

### 4.1 Character 的边界

Character 可以保存：

- 姓名、年龄、性别、MBTI、人设、背景、稳定表达习惯。
- 角色公开头像、角色级公开相册、角色生成设置。
- 与任何用户身份无关的稳定角色 Lore。

Character 不能保存：

- 某个身份与角色的聊天摘要。
- 某个 relation 的共同经历、承诺、冲突、称呼、私密偏好。
- 某个身份的主动消息冷却或关系阶段。
- 角色在一个关系里生成的图片、通话、红包、音乐状态。

### 4.2 Relation 私域边界

所有 direct 关系产物必须满足：

- `relationId` 存在。
- 该 relation 的 `characterId` 与当前角色匹配（允许通过已有 canonical resolver 兼容旧联系人副本）。
- 该 relation 的 `userIdentityId` 与当前机主身份匹配。
- `conversationId` 与 relation 对应。
- 不允许通过 characterId-only 查询其他关系。

### 4.3 Public 边界

- Public Moment 与 Public Forum 不允许读取 RelationshipState、Timeline、openLoops、boundaries、私聊 Memory、Forum DM、InnerVoice、OfflineStory 私密内容。
- `safe` 只表示“可用于当前私域生成”，不表示 public。
- 共同经历只有经过明确公开授权后，才可成为公开候选。

### 4.4 剧情边界

- OfflineStory 默认是虚构空间。
- IF/director/纯 AI 续写永远不能自动成为现实事实。
- 用户显式同步仍需通过 Fact Policy；事件还需 Event Policy。
- 多角色故事在没有 `participantRelationIds` 前必须安全拒绝关系事实化。

### 4.5 InnerVoice 边界

- InnerVoice 是私密表达结果，不是角色对外说过的话，也不是发生过的事件。
- 不能进入 Memory、CharacterEvent、Chat Prompt、Moment、Forum、Proactive、Diary。
- 如未来允许它影响长期情绪，也只能通过明确、受控、非原文的状态转换 Policy。

---

## 5. 聊天工具与交互产物隔离总表

这是本轮新增的重点。审计不能只看普通文本消息。

| 交互产物 | 正确 Scope | 事实含义 | 必查风险 |
|---|---|---|---|
| 普通文本消息 | direct: relationId + conversationId；group: groupId + conversationId | 原始证据，不等于其中每句话都是真实事实 | characterId-only fallback、重生成错关系 |
| 引用消息 | 引用源与新消息必须在同一 relation/conversation，或使用受控跨域快照 | 引用动作发生；引用内容仍遵循原来源 | 通过 messageId 引到其他身份消息 |
| 语音消息 | Message scope；音频资源也要同 scope | 用户/角色说过一段内容 | 音频缓存或转写按 characterId 共用 |
| 语音电话/通话记录 | 启动时锁定 relationId；记录携带 conversationId | 通话发生；转写内容仅是话语证据 | 切身份后旧 timer/闭包、无 relation 记录；已由 `757c843` 初步修复，仍需回归 |
| 视频通话（如存在） | 与语音电话相同 | 通话发生 | 复用 characterId-only 状态 |
| 图片上传 | Message + asset record 同 scope | 用户分享了图片；图片描述未必是事实 | IndexedDB asset 只按 messageId/characterId；删除关系残留 |
| AI 图片生成 | relation 或 group scope + messageId + assetId | 生成了一张图，不代表图中事件真实发生 | AI 图像内容写 Memory；记录落到另一身份 |
| 角色相册 | 明确区分公开角色相册与关系内共享媒体 | 公开角色资料或关系媒体 | `Character.album` 若存关系私照会跨身份共享 |
| 贴图/表情 | Message scope | 仅表达行为，通常不形成事实 | 贴图库本身可全局，但发送记录必须 relation-scoped |
| 红包 | Message scope；打开/领取状态也需 message + relation scope | 确实发送/领取了红包 | 角色主动红包补充回复直接 apiChat、输出缺 relation；金额状态跨身份 |
| 转账 | Message scope；接受/拒绝/领取状态按 relation | 交易动作发生，金额可为确定性事件 | 只按 messageId 查找、跨身份领取、自动推动关系 |
| 位置 | Message scope | “分享了一个位置”，不自动等于“当前人在那里” | Prompt 把分享位置补写成共同场景或现实所在地 |
| 文件/笔记 | Message scope；资源或快照 scope | 分享行为发生；内容只是候选证据 | 文件内容自动全部写事实、跨 relation 读取 |
| 音乐分享 | Message scope + RelationshipMusicState | 分享/共同听歌行为发生 | 自动补写地点动作；relation music 回退到 identity-1 |
| 双人音乐推荐 | relationId + userIdentityId | 推荐结果，不是事实 | 直接拼私聊/Memory，绕过 Adapter；状态跨关系 |
| 日记分享 | targetRelationId + conversationId + ownerIdentityId | 分享动作发生；日记内容按作者和可见性处理 | 通过名字或 characterId 反查关系 |
| 论坛分享 | targetRelationId + conversationId + ownerIdentityId | 分享公开内容 | private author / DM 数据混入另一身份 |
| 心声 | direct relation scope 或明确 group scope | 私密生成结果，不是事实 | messageId 碰撞、原文进入外部 Prompt |
| 收藏/书签 | Message scope 或 identity scope | 用户 UI 状态 | 同 character 的另一身份看到收藏 |
| 未读、置顶、草稿 | relation/conversation 或 ownerIdentity scope | UI 状态 | key 使用 characterId，导致身份切换串联 |
| 主动消息/主动来电冷却 | relationId | 调度状态 | characterId 共享 cooldown 或旧 closure |

### 5.1 相册的特别决策

不能笼统地说“相册按 relation 隔离”。应区分：

- `Character.album`：如果定义为角色公开档案相册，可以是角色级，所有身份看到相同内容。
- 聊天中接收/发送的图片、AI 生成图、关系私密照片：必须 relation-scoped，不能写入 `Character.album`。
- 如果产品需要“某段关系里的专属相册”，应新增 RelationAlbum/SharedMediaIndex，而不是复用 `Character.album`。

### 5.2 特殊消息的事实决策

- 红包/转账：可以产生确定性的“发送/接受/拒绝”动作记录，但不能自动解释为爱意、关系升级或承诺。
- 电话：可以记录通话发生及持续时间；通话文本仍需按普通消息证据规则提取。
- 位置：只记录“分享位置”，除非用户明确声明，不能记录“用户当前在该地点”。
- 音乐：只记录“分享/播放/一起听了某首歌”的应用内动作，禁止 AI 自动补写线下场景。
- 图片：只记录“分享/生成图片”，禁止把图中内容当现实经历。
- 文件：只记录“分享文件”；文件正文若参与事实提取，必须保留文件来源和用户确认状态。

---

## 6. 分阶段实施总路线

## Phase 0：建立基线与保护工作树

### 作用

确保新 Codex 不误删已有文档、不覆盖用户改动，并确认当前分支能够 lint/build。

### 执行

1. 运行主提示词中的基线命令。
2. 阅读：
   - `docs/character-system-global-audit.md`
   - `docs/memory-integrity-audit.md`
   - `docs/character-experience-final-review.md`
   - `docs/character-cognitive-final-audit.md`
   - `docs/cognitive-entry-contract.md`
3. 记录 HEAD、分支和未提交文件。
4. 若基线失败，只诊断并报告，不把既有失败混入新实现。

### 验收

- 有明确 baseline report。
- 没有修改源码。
- 未跟踪文件仍完整存在。

---

## Phase 1：全交互产物身份/关系隔离审计

### 作用

在建立事实层之前，先确保“证据属于谁”是正确的。否则事实模型再完善，也会把别人的证据写进当前关系。

### 审计范围

逐项检查第 5 节全部交互产物的：

1. 类型字段。
2. 创建入口。
3. 保存入口。
4. 列表和详情读取。
5. Prompt 读取。
6. 删除关系、删除角色、删除消息后的清理。
7. 备份恢复与 legacy 迁移。
8. 切换 identity 时的 React state、timer、ref、closure。

重点搜索：

```powershell
rg -n "characterId|relationId|conversationId|ownerIdentityId|messageId|senderId" src/components src/features src/domain src/core/storage
rg -n "红包|转账|语音|通话|位置|文件|图片|相册|贴图|引用|分享|收藏|未读|草稿" src scripts
rg -n "localStorage|getItem|setItem|IndexedDB|imageAssetDb|stickerDb" src
```

### 输出

新增 `docs/chat-artifact-relationship-isolation-audit.md`，每个产物必须列出：

- 当前 scope。
- 是否存在 characterId-only fallback。
- legacy 行为。
- 删除清理。
- 风险等级。
- 最小修复文件。
- 必要测试。

### 验收

- 必须覆盖普通消息之外的所有工具。
- 必须明确区分角色公开相册与关系媒体。
- 本阶段只读，不修改源码。

---

## Phase 2：修复 P0 交互产物隔离缺口

### 作用

先堵住跨身份写入、读取、定时器和资源残留问题。

### 修复原则

1. 新 direct 数据没有 relationId 时拒绝写入，不再自动回退第一个身份。
2. legacy 无 relationId 数据只允许映射到默认身份，且不得当通配符。
3. 所有特殊消息统一通过 `ChatRuntimeContext` 或窄化的 `DirectInteractionScope` 创建。
4. 消息与资源记录必须同时绑定同一 scope。
5. 异步 callback/timer 启动时捕获 relationId，并在执行前再次验证 active identity。
6. 删除关系必须清理所有 relation-owned 记录；共享角色资料不可误删。

### 优先修复候选

- 角色主动红包后的补充 AI 回复：走当前 Chat scope/Adapter，输出消息显式带 relationId/conversationId。
- 红包/转账领取状态：按 messageId + relationId 验证。
- 引用：禁止引用其他 relation 的消息对象。
- 生成图片与 asset：消息、generation record、IndexedDB asset cleanup 一致。
- 相册：禁止关系图片写入 Character.album；必要时建立 relation shared media 索引。
- 语音音频/TTS 缓存：不能仅以 characterId 作为持久 key。
- 音乐状态和分享：严格 relation + identity。
- 日记/论坛分享：不使用名字反查关系。
- 未读/置顶/草稿/主动冷却：direct key 必须 relationId。
- Group 数据明确 group scope，不能伪造 direct relation。

### 测试

新增统一测试，例如：

- `scripts/chatArtifactIdentityIsolation.test.ts`
- `scripts/specialMessageRelationIsolation.test.ts`
- `scripts/chatAssetRelationIsolation.test.ts`
- `scripts/shareRelationIsolation.test.ts`

每类至少验证：同一 Character，identity A/B；A 创建的产物 B 不可见、不可领取、不可删除、不可进入 Prompt。

保留并运行：

- `scripts/proactiveVoiceCallIdentityIsolation.test.ts`
- `scripts/imageGenerationRelationIsolation.test.ts`
- `scripts/dualMusicRelationIsolation.test.ts`
- `scripts/innerVoiceRelationIsolation.test.ts`
- `scripts/diaryShareContext.test.ts`
- `scripts/forumDmIsolation.test.ts`
- `scripts/relationshipMigration.test.ts`

---

## Phase 3：Character Truth Layer 详细设计

### 作用

把“长期 Prompt 素材”升级为有来源、有真假状态、有时间语义的知识系统。

### 建议核心模型

优先使用 `KnowledgeClaim`，而不是把所有内容命名为 Fact：

```ts
type KnowledgeKind =
  | "fact"
  | "preference"
  | "plan"
  | "belief"
  | "hypothesis";

type TruthStatus =
  | "asserted"
  | "confirmed"
  | "inferred"
  | "disputed"
  | "retracted"
  | "legacy_unverified";

type TemporalStatus =
  | "past"
  | "present"
  | "future"
  | "timeless"
  | "unknown";

interface KnowledgeClaim {
  id: string;
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId?: string;
  kind: KnowledgeKind;
  statement: string;
  subject: "user" | "character" | "relationship" | "other";
  truthStatus: TruthStatus;
  temporalStatus: TemporalStatus;
  source: {
    kind: "user_message" | "deterministic_action" | "manual" | "ooc_correction" | "offline_story" | "import" | "legacy_memory";
    messageIds?: string[];
    eventId?: string;
    storyId?: string;
    sourceRecordId?: string;
  };
  confidence: number;
  userConfirmed: boolean;
  occurredAt?: number;
  recordedAt: number;
  validFrom?: number;
  validTo?: number;
  supersedesId?: string;
  status: "active" | "retracted";
  visibility: "relation_private";
  schemaVersion: number;
}
```

最终字段应根据当前代码类型再校准，但以下字段不可缺失：scope、source、kind、truth status、temporal status、confidence、confirmation、retraction/supersession。

### 必须独立的模型

- `ConversationSummaryRecord`：保存摘要及 source claim/message IDs；可重建；不能当权威事实。
- `BehaviorCorrectionRecord`：OOC 纠正与角色行为指导；不与事实检索混排。
- CharacterEvent：继续记录明确发生事件，不复制成自由文本事实。

### 输出

新增 `docs/character-truth-layer-design.md`，包含 ER 图、字段、信任等级、兼容策略、写入/读取时序、冲突处理和删除语义。

本阶段不要修改源码。

---

## Phase 4：Truth Layer 基础类型、Policy 与 Repository

### 作用

先建立独立、可测试的事实治理基础，不立即替换现有 Memory。

### 建议目录

```text
src/domain/characterKnowledge/
  characterKnowledgeTypes.ts
  knowledgeWritePolicy.ts
  knowledgeVisibilityPolicy.ts
  knowledgeConflictPolicy.ts
  knowledgeTemporalPolicy.ts

src/core/storage/repositories/
  characterKnowledgeRepository.ts
  conversationSummaryRepository.ts
  behaviorCorrectionRepository.ts   （也可先兼容现有 OOC 存储）
```

### Repository 要求

- `listByRelation(relationId)`，并校验 characterId + userIdentityId。
- `findBySource(...)`。
- `append/appendMany` 幂等。
- `supersede/retract`，禁止物理覆盖来源。
- `removeByRelations`。
- 旧数据兼容读取，但新写入强制完整 scope。
- 不在 domain 层读取 storage。

### Policy 最低规则

- AI 回复不能直接写 confirmed fact。
- 用户明确第一人称陈述可写 asserted claim。
- 含“如果、假如、也许、可能、以后、希望、计划”的内容不能归类为已发生 past fact。
- 问句、建议、角色扮演、括号动作、系统指令不能成为事实。
- 未来计划保持 `kind=plan + temporalStatus=future`。
- 被用户否认的旧 claim 必须 disputed/retracted 或被新 claim supersede。
- OfflineStory 必须复用现有 Fact Policy。

### 测试

- 同角色双身份隔离。
- 重复 source 幂等。
- 计划不变过去事实。
- AI 自述不成为 confirmed fact。
- retract/supersede 保留审计链。
- 删除关系清理。
- legacy 无 scope 只进入默认关系且标记 `legacy_unverified`。

---

## Phase 5：Memory 写入审核与候选提取

### 作用

解决“AI 幻觉 → AI 总结 → Memory → 后续当真”的主链问题。

### 新写入链路

```text
Messages / deterministic action / manual input
          ↓
Evidence normalizer
          ↓
AI extractor only produces candidates
          ↓
Knowledge Write Policy
          ↓
accepted / pending / rejected
          ↓
Knowledge repository
```

### 关键行为

- Extractor 的输出只是 Candidate，不是最终事实。
- Candidate 必须携带 source message IDs；无法定位来源则拒绝 confirmed。
- 对话中角色自己说的共同经历不能证明共同经历发生。
- 用户说“以后一起旅行”只能形成 plan。
- 用户说“如果我们住在一起”不能形成 fact。
- 红包、通话、音乐分享等应用动作由确定性 capture 产生事件/claim，不让 AI 猜。
- 手工 Memory 编辑应进入 manual confirmed 或 manual correction，并保留 superseded record。
- OOC 纠正进入行为纠正层，不和生日、偏好等事实混检。

### 兼容策略

第一阶段双写或“新 Truth + 旧 Memory 只读视图”，不要一次删除 `MemoryItem`。

建议：

- 新写入先写 KnowledgeClaim。
- 旧 UI 可通过 projector 显示兼容 MemoryItem。
- 旧 Prompt 在迁移期间读取“已通过 Policy 的 claim 投影 + legacy unverified 降权”。
- 不允许新系统把 rejected candidate 回写旧 Memory。

---

## Phase 6：Legacy Memory 迁移与双轨兼容

### 作用

保证刷新、备份恢复和已有用户数据不丢失，同时不把旧数据自动认证为事实。

### 迁移规则

- 有 relationId 的旧 Memory → `legacy_unverified` claim，保留原 id、timestamp、content 和 relation scope。
- 无 relationId 的 legacy → 只映射默认身份的默认关系；找不到唯一关系则保留隔离的 orphan/diagnostic 状态，不注入其他身份 Prompt。
- `Character.compressedMemory` 不再作为所有关系共享事实；仅可迁移给明确默认关系且标为 legacy summary。
- `Relationship.compressedMemory` 迁移为可重建 ConversationSummary，不是 Fact。
- OOC 前缀记录迁移为 BehaviorCorrection。
- Offline marker 迁移时保留 story/source 信息，不因文本 marker 直接升级为 fact。

### 必须支持

- migration version。
- 幂等重复启动。
- 失败回滚或保留原数据。
- backup round-trip。
- 新旧读取结果不跨 identity。

---

## Phase 7：压缩、合并与检索重构

### 作用

让压缩不改变事实含义，让检索能区分事实、计划、假设和摘要。

### 压缩原则

- 只压缩同 relation。
- 摘要必须记录 source claim IDs、source message IDs、生成版本和时间范围。
- 摘要是派生缓存，可删除重建。
- 不允许摘要引入来源中不存在的人、地点、时间和因果。
- 不允许把 future plan 改写为 past fact。
- 不允许把 hypothesis 改为 confirmed。
- 不允许跨 kind 合并导致语义改变。
- 冲突 claim 不静默合并，保留 disputed/superseded 链。

### 检索原则

- 强制 relation scope。
- 先按 scenario visibility 过滤，再排序。
- 排序考虑 relevance、importance、recency、truthStatus、source quality。
- confirmed/asserted 优先于 legacy/inferred。
- plan 与 fact 分开输出，并明确时间状态。
- ConversationSummary 只能作为摘要补充，不能覆盖具体高置信 claim。
- OOC correction 使用独立检索槽。

### Prompt 输出建议

Prompt Adapter 收到的不是任意 Memory 文本，而是分组投影：

```text
Confirmed facts
User assertions
Preferences
Future plans (not yet happened)
Open hypotheses (do not assume true)
Behavior corrections
Conversation summary (non-authoritative)
```

---

## Phase 8：RelationshipState / Timeline 生产闭环

### 作用

让关系连续性不再只依赖最近聊天或 compressedMemory。

### 实施

1. 新增 application service，从当前 relation 的 CharacterEvents 构建 State 和 Timeline。
2. Chat、Proactive、Diary、Forum DM 的 Cognitive Builder 每次按 scope 获取同一快照。
3. 如需缓存，缓存必须可重建并带 projection version；事件仍是来源真相。
4. 捕获更多确定性事件，但严格限制：
   - 用户明确设置关系阶段。
   - 明确 promise_made / promise_kept，且有来源与确认。
   - 确定性 care action、boundary_set、conflict/repair。
   - 已确认 OfflineStory completed。
5. 普通聊天、AI 猜测、一次红包或一次 care_shown 不能自动跳级。

### 关系与情绪分层

- `stage`：长期关系阶段，变化少且需要明确依据。
- `tone`：中期关系氛围，由明确事件投影。
- 临时情绪：只存在单次/短期 Context，不永久写 RelationshipState。
- InnerVoice 不能直接改 tone。

### 验收

- 刷新后可从 Event 重建相同 State。
- A/B identity 的 State/Timeline 完全隔离。
- openLoop 只在对应承诺被明确完成时关闭。
- conflict 后 Proactive 不再输出与关系状态冲突的亲密措辞。

---

## Phase 9：WorldBook 分层隔离

### 作用

避免把身份 A 的专属共同经历作为角色通用世界设定暴露给身份 B。

### 推荐模型

WorldBookEntry 增加或演进为明确 scope：

```ts
type WorldBookScope =
  | { kind: "global" }
  | { kind: "character"; characterId: string }
  | { kind: "identity"; userIdentityId: string }
  | { kind: "relationship"; relationId: string; characterId: string; userIdentityId: string };

type WorldBookVisibility = "public" | "private";
type WorldBookPurpose = "world_canon" | "persona_rule" | "relationship_context" | "generation_rule";
```

### 规则

- global/public：可进入公开场景，但仍需 public visibility。
- character/world_canon：稳定角色/世界 Lore，可跨身份。
- relationship/private：只进入当前 relation 私域 Context。
- identity/private：只属于当前机主身份，不自动给所有角色。
- 关系共同经历优先进入 Truth Layer，不应滥用 WorldBook。
- Legacy global/character entry 保持可读，但标为 legacy scope；不得自动推断 public。

### Prompt 规则

- Chat 只读取 global + character + current relation entries。
- Public Forum/Moment 只读取明确 public 的 global/character canon。
- Group Chat 需要成员级可见性合并，不能注入某成员 direct relation private entry。
- OfflineStory 可读取用户选择的剧情资料，但出域仍受 Fact Policy。

---

## Phase 10：所有 AI 入口最终收口

### 作用

保证 Context/Adapter 是实际入口契约，而不是可有可无的补充块。

### P0 入口

1. Direct Chat regenerate：必须复用与普通回复相同的 runtime context、Cognitive Context 和 Chat Adapter。
2. 角色主动红包补充回复：必须走当前关系的 Chat scope，输出 message 带 relationId/conversationId。
3. Public Forum legacy topic seed：禁止从 compressedMemory、私聊、Memory 提取公开主题。
4. Group Chat：建立专用 `GroupCognitiveContext`，不能把单一 relation context 或 Character legacy memory 当群共享事实。

### P1 入口

- Dual Music：建立 relation-safe Music Context/Adapter；禁止自动补写共同地点和动作。
- Diary：让 Adapter 成为唯一长期认知投影，最近消息继续按 relation 且作为原始上下文，不直接升级事实。
- Proactive：移除与 Adapter 重复/冲突的旧 compressedMemory 直拼。
- Direct Chat 主回复：逐步把旧 Memory/Relationship/WorldBook 拼接收敛到明确投影。
- InnerVoice：保留独立私密入口，但增加契约测试，禁止任何外流。
- Image generation：使用 scope-safe media context，不将生成图当现实知识。

### Group Context 最低设计

- groupId + conversationId + ownerIdentityId。
- 每个参与角色独立 persona。
- 群消息是群内共享证据。
- direct Memory、direct Timeline、direct WorldBook 默认不可见。
- 如产品需要角色与机主关系影响群聊，只能通过显式 group-safe 投影，不暴露私密细节。

---

## Phase 11：Routine 与 Topic History 生产闭环

### 作用

解决“今晚的月亮却早上发布”、主动消息模板化、朋友圈重复等体验问题。

### 实施

- 为 CharacterRoutine 提供明确配置来源或稳定默认构建规则。
- 所有 Moment/Diary/Proactive 生产入口实际传 routineContext。
- Routine 只影响生成参考，不直接替代 scheduler。
- 为 Moment Topic History 建 Repository；成功发布后追加标准化 topic，失败/SKIP 不追加。
- 为 Proactive Topic History 建 relation-scoped Repository；发送成功后追加，失败不追加。
- topic history 只用于多样性，不进入 Memory/Event/Relationship。
- 无合理新内容时允许 SKIP。

### 隔离

- Moment topic：character public scope，不跨角色；不含 relationId。
- Proactive topic：characterId + relationId，严格不跨身份。

---

## Phase 12：删除、撤销、备份和审计闭环

### 作用

长期系统必须能回答“这条认知从哪里来、删除源数据后怎么办”。

### 删除语义

- 删除消息：依赖该消息的 claim 不应静默保留为 confirmed；应 retracted、orphaned 或重算。
- 删除 Moment：清理其 topic/public candidate 和任何明确关联记录。
- 删除 OfflineStory：若用户已确认生成 Event/Claim，需按产品规则选择保留历史事件或显式撤销，不能留下无来源孤儿。
- 删除关系：清理所有 relation-owned Message、Knowledge、Summary、OOC、Event、Timeline cache、OfflineStory、InnerVoice、music、share、asset、draft、unread/cooldown。
- 删除 Character：清理所有关系及角色级资料，但不要误删其他角色共享 global worldbook。
- 删除 UserIdentity：清理该 identity 的全部关系和 identity-owned public/private 数据。

### 审计能力

至少在 Repository/诊断测试中支持：

- 查看 claim 的来源消息/事件/故事。
- 查看谁确认、何时记录、何时被替代。
- 查看 Prompt 投影为什么包含或排除某条数据。
- 备份恢复后 scope 和 source 不变。

本阶段默认不新增面向用户 UI；先建立可测试的诊断 API。

---

## Phase 13：长期一致性与安全验收

### 作用

确保不是“单元测试看起来正确”，而是真实长期使用不漂移。

### 必测场景

1. 同一 Character，identity A/B：消息、语音、电话、红包、转账、图片、相册关系媒体、文件、位置、音乐、日记分享、论坛分享、Memory、Event、Timeline 完全隔离。
2. 用户说“以后一起去日本”：只能形成 future plan，30 天后不能说“我们去年一起去了东京”。
3. AI 自己编造咖啡馆初遇：不能进入 confirmed fact。
4. 用户明确说生日：可形成有 source 的 asserted/confirmed fact。
5. 用户纠正生日：旧 claim 被 supersede/retracted，Prompt 只使用新值。
6. IF/director/纯 AI OfflineStory：不能进入现实 Memory/Event。
7. 用户明确同步符合 Fact Policy 的 continue story：生成受限事实和通用完成事件，不复制剧情细节。
8. InnerVoice：任何外部 Prompt 都查不到原文。
9. Public Moment/Forum：看不到 private Memory、Timeline、openLoop、relation WorldBook。
10. 群聊：成员不会共享彼此 direct Memory。
11. 关系 conflict → repair：State 可重建，Proactive/Chat 使用同一 tone；不自动 stage jump。
12. Moment/Proactive topic history：减少连续重复，且不跨角色/关系。
13. 压缩前后：事实、时间状态、来源和冲突保持一致。
14. 删除源消息/关系后：无孤立 confirmed claim，无资源泄漏。
15. 备份恢复后：scope、source、truthStatus、retraction 链不变。

### 现有测试优先复用

- `scripts/characterLongTermConsistency.test.ts`
- `scripts/memoryAndRelationshipIntegrity.test.ts`
- `scripts/oocMemoryIsolation.test.ts`
- `scripts/offlineStoryFactPolicy.test.ts`
- `scripts/offlineStoryEventPolicy.test.ts`
- `scripts/offlineStoryEventCapture.test.ts`
- `scripts/relationshipProjection.test.ts`
- `scripts/relationshipGrowthProjection.test.ts`
- `scripts/relationshipTimeline.test.ts`
- `scripts/characterCognitiveContext.test.ts`
- `scripts/promptAdapter.test.ts`
- 各 Chat/Moment/Forum/Diary/Music/InnerVoice isolation tests。

新增端到端测试建议：

- `scripts/characterTruthWritePolicy.test.ts`
- `scripts/characterTruthMigration.test.ts`
- `scripts/characterTruthRetrieval.test.ts`
- `scripts/characterTruthCompression.test.ts`
- `scripts/chatArtifactIdentityIsolation.test.ts`
- `scripts/groupCognitiveIsolation.test.ts`
- `scripts/worldBookRelationshipIsolation.test.ts`
- `scripts/characterThirtyDayDeterministicSimulation.test.ts`

---

## 7. 每个 Phase 的通用执行模板

新 Codex 每阶段都应遵循：

```text
1. git status --short
2. git diff --stat
3. 使用 rg 找到类型、创建、保存、读取、Prompt、删除和迁移入口
4. 先输出根因和最小改造范围
5. 使用 apply_patch 修改，保护无关工作树
6. 新增针对性测试
7. npm.cmd run lint
8. npm.cmd run build
9. npx.cmd tsx scripts/<affected-test>.test.ts
10. 运行相关隔离/迁移/备份回归测试
11. git diff --check
12. git status --short
13. 报告修改、验证、兼容和风险
```

如果一个 Phase 修改超过约 8–12 个业务文件，应拆成 Foundation、Integration、Migration 三个小阶段，不要一次大爆炸重构。

---

## 8. 禁止事项

- 禁止把 AI 回复本身当作事实来源。
- 禁止把 future plan 写成 past event。
- 禁止把括号动作、虚构叙事、图片生成内容当现实经历。
- 禁止把 public post 自动写成 relation private fact。
- 禁止 InnerVoice 外流。
- 禁止 characterId-only 查询所有 direct relation 数据。
- 禁止把无 relationId 当通配符。
- 禁止把 RelationshipState 变成好感度、经验值、等级系统。
- 禁止一次 care、红包、通话就自动升级关系。
- 禁止用 WorldBook 保存某个身份专属私密关系事实而不标 scope。
- 禁止只改 Prompt 文案来掩盖数据错误。
- 禁止在没有 provenance 的情况下压缩并覆盖原始事实。
- 禁止删除用户现有未提交文件。
- 禁止 `git add .`、未经授权提交或推送。

---

## 9. 最终完成标准

只有同时满足以下条件，项目才可被视为进入“可信长期陪伴系统”阶段：

1. 任意 direct 产物都能回答：属于哪个 identity、relation、conversation。
2. 任意长期知识都能回答：来源是什么、谁陈述、是否确认、何时发生、是否仍有效。
3. 计划、假设、摘要、OOC、剧情与事实不再混成自由文本 Memory。
4. AI 自己编造的经历无法无审核进入事实层。
5. 压缩可重建，不改变事实类型和时间语义。
6. RelationshipState 可从 Events 重建，并真实供给 Chat/Proactive/Diary/DM。
7. WorldBook 的 public/character/relation/identity scope 明确。
8. Moment/Public Forum 永远无法读取 private relation 数据。
9. Group Chat 不共享 direct Memory。
10. 所有特殊消息、媒体资源、分享和 UI 状态通过双身份隔离测试。
11. 删除关系后没有孤立 Memory/Event/asset/cooldown/share。
12. 30 天确定性模拟不产生不存在经历，不发生人格和关系无依据漂移。

---

## 10. 推荐提交拆分（仅供用户之后授权时使用）

不要在自动执行期间自行提交。若用户要求提交，建议按以下边界：

1. `docs: audit chat artifact relationship isolation`
2. `fix: isolate direct chat artifacts by relationship`
3. `docs: design character truth layer`
4. `feat: add character truth foundation`
5. `fix: gate memory writes through truth policy`
6. `feat: migrate legacy memory to scoped knowledge claims`
7. `refactor: make memory summaries provenance aware`
8. `feat: supply relationship projections in production`
9. `feat: scope world book knowledge by visibility`
10. `fix: enforce cognitive contracts across ai entries`
11. `feat: persist routine and topic generation context`
12. `test: add long term character consistency coverage`

每次提交必须精确 `git add` 文件，并先检查 cached diff。

---

## 11. 给新 Codex 的第一条具体任务

如果新窗口不能一次持续执行全部计划，先发送下面这条：

```text
请阅读 docs/character-truth-and-isolation-master-plan.md，并从 Phase 0 开始。

本轮先完成 Phase 0 和 Phase 1：

1. 检查当前分支、工作树、lint/build 基线。
2. 全面审计普通聊天及相册、图片、语音、电话、红包、转账、位置、文件、贴图、引用、音乐、日记/论坛分享、心声、收藏、未读、草稿、主动调度等交互产物的 relationId / conversationId / userIdentityId 隔离。
3. 覆盖类型、创建、保存、读取、Prompt、删除、备份、迁移、异步 timer/closure。
4. 生成 docs/chat-artifact-relationship-isolation-audit.md。

本轮只分析，不修改源码，不提交，不推送。报告 P0/P1/P2 风险和下一阶段精确文件清单。
```

完成审计后，再让它严格按本文 Phase 2 开始最小修复。
