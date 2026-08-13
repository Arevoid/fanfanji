# 饭饭机项目接手与扩展指南

> 面向新的 Codex 窗口、后续维护者和新增应用开发。
> 核对基线：`feature/offline-appointments` 分支，2026-08-13，读取至提交 `627a298`。
> 本文描述的是当前真实代码结构和必须遵守的边界，不是未来设想。

## 1. 最重要的结论

饭饭机不是“每个页面各自拼提示词”的普通 React 应用。它目前由以下几层组成：

```text
App.tsx（应用壳、全局状态、路由和跨应用连接）
  ├─ components/App*.tsx（各应用页面）
  ├─ features/*（场景服务、Prompt Adapter、UI 子组件）
  ├─ domain/*（纯业务规则、身份/关系/记忆/日程模型）
  ├─ core/storage/*（持久化、仓储和迁移）
  ├─ utils/*（API、二进制资产、导入解析等）
  └─ server.ts / cloudflare/worker.ts（API 代理）
```

开发时必须始终守住五条原则：

1. **角色卡优先。** 通用“活人感”、情绪、对话策略和媒体规则只能软指导，不能把不同人物改成统一语气。
2. **关系是隔离边界。** 直接聊天数据必须按 `userIdentityId + relationId + characterId + conversationId` 校验，不能只按 `characterId` 读取。
3. **生成内容不自动等于事实。** AI 写出的帖子、日记、心声、IF 剧情、未完成约定不能未经确认直接写进长期事实。
4. **跨应用不是无条件互通。** 私聊可以读取经过筛选的关系事实；朋友圈和公开论坛只能读取公开安全投影；日记和论坛内容只有明确分享后才能进入私聊。
5. **新增应用不能重置老用户桌面和存储。** 应用注册、商店、图标和默认安装是四件不同的事，必须分别接入。

## 2. 快速启动与验收

常用命令：

```bash
npm run dev
npm run lint
npm test
npm run build
npm run check
```

`npm run check` 依次执行 TypeScript 检查、全部脚本测试和生产构建，是提交前的统一验收入口。

测试位于 `scripts/`，由 `scripts/runAllTests.ts` 自动收集。当前基线为 291 个测试。新增业务边界时不要只补 UI 测试，至少还要覆盖：

- 两个用户身份之间的数据隔离；
- 同一角色的两个不同关系之间的数据隔离；
- 私密数据不能进入公开场景；
- 旧存储数据的兼容读取；
- 删除、重生成、失败重试和重复调用的幂等性。

## 3. 目录职责

### 3.1 `src/App.tsx`

这是组合根，负责：

- 加载并保存全局数据；
- 维护 `activeApp`、当前聊天角色和当前关系；
- 注册懒加载应用；
- 桌面布局、Dock、应用安装状态；
- 把角色、关系、消息、世界书、记忆、日程等数据通过 props 传给各应用；
- 处理跨应用导航，例如日记分享进入聊天、日程进入聊天、聊天进入线下；
- 启动需要跨页面持续运行的论坛活动和主动联络逻辑。

不要继续把可复用的业务规则、长提示词或仓储实现直接堆进 `App.tsx`。新增逻辑应先落到 `domain/` 或 `features/`，`App.tsx` 只负责连接。

### 3.2 `src/components/App*.tsx`

这是应用页面层：

| 应用 | 入口文件 |
| --- | --- |
| 聊天/朋友圈 | `src/components/AppChat.tsx` |
| 档案馆 | `src/components/AppArchives.tsx` |
| 世界书 | `src/components/AppWorldBook.tsx` |
| 记忆书 | `src/components/AppMemory.tsx` |
| 线下模式 | `src/components/AppOffline.tsx` |
| 日程 | `src/components/AppSchedule.tsx` |
| 论坛 | `src/components/AppForum.tsx` |
| 日记 | `src/components/AppDiary.tsx` |
| 音乐 | `src/components/AppMusic.tsx` |
| 备忘录 | `src/components/AppNotes.tsx` |
| 应用商店 | `src/components/AppStore.tsx` |
| 设置/美化/API | `src/components/AppSettings.tsx` |

`AppChat.tsx` 仍然较大，但已经把控制器、服务、提示词、样式模板和部分组件拆到 `src/features/chat/`。新增功能优先继续拆分，不要重新把独立业务塞回巨型组件。

### 3.3 `src/domain/`

纯业务规则层，不应直接读取 React 状态、DOM 或 `localStorage`。重要目录：

- `character/`：规范角色 ID、联系实例和角色状态；
- `relationship/`：用户身份与角色的关系、会话 ID、线下关系变更；
- `characterCognitive/`：统一的角色认知上下文模型和 Builder；
- `characterKnowledge/`：Truth Layer、冲突、时间、可见性和写入策略；
- `characterLife/`：已确认事件、关系时间线、日常作息和主动话题；
- `memory/`：兼容记忆、检索、提取、去重和线下交接；
- `prompt/`：角色投影、语言、时间、跨应用上下文和 Prompt 组合；
- `worldbook/`：世界书作用域和可见性；
- `offlineStory/`：线下事实、现实性和重生成规则；
- `schedule/`：约定、提案、状态机、主动线下资格与线下交接；
- `forum*`、`moment*`、`diary/`：各公开/半公开场景的业务规则。

### 3.4 `src/features/`

场景实现层。典型结构是：

```text
domain Builder / Policy
  → features/*/promptAdapters（只投影允许内容）
  → features/*/services（组织请求和解析结果）
  → App 页面调用
```

### 3.5 `src/core/storage/`

- `storageKeys.ts`：集中登记主存储键；
- `storageAdapter.ts`：安全读写，统一处理不可用和容量错误；
- `repositories/`：按领域读写和规范化数据；
- `migrations.ts`：持久化结构迁移；
- `offlineStoryDb.ts`：较大的线下故事 IndexedDB 持久化。

新代码不要在各组件里随意发明裸 `localStorage` 写法。能建 repository 的必须建 repository，并返回可检查的写入结果。

### 3.6 二进制数据

大文件不应塞入 JSON/localStorage：

- 图片：`src/utils/imageAssetDb.ts`；
- 音频/TTS 缓存：`src/utils/audioDb.ts`；
- 表情包：`src/utils/stickerDb.ts`；
- 上传字体：`src/utils/fontAssetDb.ts`；
- 大型线下故事：`src/core/storage/offlineStoryDb.ts`；
- 阅读应用原始小说正文：`src/core/storage/readingAssetDb.ts`。

元数据留在普通仓储，Blob 留在 IndexedDB。删除实体时也要删除关联 Blob。

## 4. 身份、角色、关系和会话

### 4.1 四个容易混淆的 ID

- `characterId`：角色资料的规范身份；
- `userIdentityId`：当前用户使用的哪一套人设；
- `relationId`：该用户人设与该角色之间的具体关系；
- `conversationId`：稳定直接聊天线程，默认由 `getConversationId(relationId)` 生成。

核心定义：

- `src/types.ts`：`Character`、`UserIdentity`、`Message`；
- `src/domain/relationship/characterRelationship.ts`：`CharacterRelationship`；
- `src/domain/character/characterIdentity.ts`：规范角色与联系人副本解析；
- `src/features/chat/context/directInteractionScope.ts`：直接互动作用域。

### 4.2 多用户人设隔离

每个直接关系必须绑定 `userIdentityId`。同一个角色在不同用户人设下可以拥有不同：

- 聊天消息；
- 关系阶段；
- 长期事实与记忆；
- OOC 纠正；
- 心声；
- 线下故事；
- 日程约定；
- 音乐关系状态；
- 主动联络和主动来电节流状态。

禁止写法：

```ts
messages.filter(message => message.characterId === characterId)
```

直接聊天应优先使用 `relationId` 和 `conversationId`，并校验其 `userIdentityId` 与规范角色 ID。只有群聊或明确的旧数据兼容路径可以不带 `relationId`。

### 4.3 联系人副本与规范角色

联系人副本通过 `profileSourceId` 指回原始角色资料。规范化只用于找回同一个角色资料，**不能跨越用户身份或关系边界合并聊天数据**。

## 5. 角色如何读取人设、世界书、记忆和提示词

### 5.1 直接聊天主链路

当前直接聊天的大致调用链：

```text
用户消息
  → useChatController / chatReplyController
  → 确定 DirectInteractionScope
  → 构建 CharacterCognitiveContext
  → 检索 Truth Layer、兼容 Memory、事件、跨应用授权上下文
  → projectCharacterPrompt()
  → buildWorldBookSystemBlocks()
  → ChatPromptAdapter
  → assembleChatInstructions()
  → finalizeCharacterChatSystemInstruction()
  → chatGenerationController
  → apiChat()
  → server/worker 文本协议适配器
  → 解析成一个或多个消息气泡
  → 保存消息和允许的副作用
```

关键文件：

- 页面入口：`src/components/AppChat.tsx`；
- 回复路由：`src/features/chat/controllers/chatReplyController.ts`；
- API 生成与退化回复重试：`src/features/chat/controllers/chatGenerationController.ts`；
- 角色资料投影：`src/domain/prompt/characterPromptProjector.ts`；
- 认知 Builder：`src/domain/characterCognitive/contextBuilder.ts`；
- Chat Adapter：`src/features/characterCognitive/promptAdapters/chatPromptAdapter.ts`；
- 世界书筛选：`src/utils/worldBook.ts`；
- 世界书位置段：`src/features/chat/prompts/chatWorldBookPromptSections.ts`；
- 系统指令汇总：`src/features/chat/prompts/chatPromptBuilders.ts`；
- 消息序列化：`src/features/chat/prompts/messagePromptSerializer.ts`；
- 当日/跨日对话：`src/features/chat/prompts/directChatTurnPrompt.ts`；
- 通用边界：`src/features/chat/prompts/chatPromptPolicy.ts`；
- AI 请求：`src/utils/apiHelper.ts`。

### 5.2 人设优先级

当前实现的核心优先顺序应理解为：

1. 角色卡和参考资料中明确的稳定人设、说话习惯、称呼、禁用表达；
2. 角色专属、持续生效的 `persona_rule` 世界书；
3. 当前用户消息和角色正确归属的最近历史；
4. 当前关系中已确认的事实、事件、关系状态和有效世界书；
5. 时间、媒体能力、对话状态、情绪检测、活人感等软提示。

第 5 层不能覆盖前四层。即使两个角色都粘人、毒舌或冷淡，也不能使用统一句式、统一追问方式或统一安慰方式。

`characterPromptProjector.ts` 会把以下内容投影为独立 Prompt Block：

- Character Description：姓名、年龄、性别、MBTI、背景；
- Character Personality：性格、参考资料中的表达证据、角色保护规则；
- Current Relationship：当前关系的补充信息；
- Final Expression Anchor：在提示词末端再次锚定该角色的独有表达。

关系状态只补充角色卡没有写明的部分。角色卡明确写了称呼、亲疏和情感方向时，不能被默认 `friend` 状态削弱。

### 5.3 回复语言

关键文件：

- `src/domain/prompt/characterLanguage.ts`；
- `src/domain/prompt/characterPromptProjector.ts`；
- `src/utils/worldBook.ts`。

解析顺序：

1. `Character.replyLanguage` 或角色资料/参考资料/有效世界书中明确的说话语言；
2. 若没有明确语言，根据国籍和长期文化背景推断自然主要语言；
3. 完全没有语言与国籍线索时才回退简体中文。

最终语言指令会在系统提示词末端再次加入，防止中文界面或中文系统提示把角色强行变成简体中文。自动翻译是显示层功能，不应改变角色原文。

### 5.4 世界书

`WorldBookEntry.scope` 支持：

- `global`；
- `character`；
- `identity`；
- `relationship`。

可见性为 `public | private`，用途为：

- `world_canon`；
- `persona_rule`；
- `relationship_context`；
- `generation_rule`。

触发可为关键词、常驻或兼容向量类型；位置支持主提示词前后、角色定义前后、历史前和 `at_depth`。新增场景必须调用场景可见性策略，不能把所有世界书直接拼接。

### 5.5 时间感知与跨日聊天

关键文件：

- `src/domain/prompt/timeContext.ts`；
- `src/domain/prompt/historyTimeContext.ts`；
- `src/features/chat/prompts/directChatTurnPrompt.ts`。

开启时间感知后：

- “明天、今晚、下周”等相对时间绑定原消息发送日期；
- 跨日期的旧聊天只作为历史参考，不继续冒充当前实时对话链；
- 已经过期的约定只能描述为过去的约定；
- 新消息仍可以自然承接合理上下文，但不能把 7 月的“明天”重解释成 8 月的明天。

关闭时间感知时，不应用这些跨日约束。

### 5.6 主动联络

主动联络不是一套独立、简化的人设。它继续使用当前关系的 `CharacterCognitiveContext`，再由 `ProactivePromptAdapter` 投影，相关入口包括：

- `src/features/chat/services/proactiveMessageService.ts`；
- `src/features/characterCognitive/promptAdapters/proactivePromptAdapter.ts`；
- `src/domain/prompt/proactiveConversationContext.ts`；
- `src/domain/characterLife/proactive/`；
- `src/features/chat/services/proactiveCognitiveContext.ts`。

主动联络可以使用当前关系的安全摘要、已确认事件、角色作息、时间和去重后的话题历史，但不能读取其他关系或 InnerVoice。频率配置只是调度条件，不能要求所有人物用相同热情、相同开场或相同话量。

### 5.7 群聊

群聊保留已有群容器语义，不伪造一个直接关系。每位群成员的私有认知必须先通过 `groupMemberPrivateContext.ts` 建立隔离快照，再组合为群聊定义；群消息产生的记忆通过 `groupMemoryDistribution.ts` 分发，不能把整段群聊写进每个角色的单聊关系。

群聊相关文件：

- `src/features/chat/services/groupChatService.ts`；
- `src/features/chat/services/groupReplyParser.ts`；
- `src/features/chat/prompts/groupMemberPrivateContext.ts`；
- `src/features/chat/services/groupMemoryDistribution.ts`。

### 5.8 InnerVoice（心声）

心声使用独立 Prompt 和独立仓储：

- `src/features/chat/services/innerVoiceService.ts`；
- `src/domain/prompt/innerVoicePrompt.ts`；
- `src/core/storage/repositories/innerVoiceRepository.ts`。

它只能在当前 direct/group scope 下生成和查看，不是事实数据库，也不得传播进聊天、朋友圈、公开论坛、主动联络、日记、Memory、CharacterEvent 或 RelationshipState。

## 6. 记忆系统与事实写入

项目目前同时存在新旧两层数据，不能粗暴删除兼容层。

### 6.1 短期聊天上下文

来自当前 `relationId/conversationId` 的最近消息，受角色的 `contextMemoryLimit` 等设置限制。消息通过 `messagePromptSerializer.ts` 统一序列化，保证文字、语音转写、通话记录、图片、红包、位置、表情、论坛分享和日记分享不会交换说话人。

### 6.2 Truth Layer（权威事实层）

相关文件：

- 类型/策略：`src/domain/characterKnowledge/`；
- 仓储：`src/core/storage/repositories/characterKnowledgeRepository.ts`；
- 检索：`src/features/characterKnowledge/services/truthRetrievalService.ts`；
- 提取协议：`src/features/characterKnowledge/services/knowledgeExtractionProtocol.ts`；
- 派生摘要：`conversationSummaryRepository.ts`；
- OOC 纠正：`behaviorCorrectionRepository.ts`。

事实必须带来源、关系作用域和证据消息 ID。计划、假设、争议、偏好和已发生事实不能混成一种状态。

### 6.3 Memory Vault（兼容记忆视图）

相关文件：

- `src/domain/memory/MemoryService.ts`；
- `MemoryExtractor.ts`、`MemoryRetriever.ts`、`MemoryDeduplicator.ts`；
- `src/core/storage/repositories/memoryRepository.ts`；
- UI：`src/components/AppMemory.tsx`。

新 Truth Claim 可以生成带 `sourceKnowledgeClaimIds` 的兼容 Memory，供旧 UI 和旧数据路径继续工作。聊天检索时，已经被 Truth Layer 覆盖的旧 Memory 会被遮蔽，避免同一事实重复注入。

### 6.4 CharacterEvent 和关系投影

只有经过事件策略允许、已确认并具备正确作用域的行为才能成为 `CharacterEvent`。普通 AI 回复、心声、公开帖子或未完成线下剧情不能直接变成关系成长事件。

相关文件：

- `src/domain/characterLife/`；
- `src/features/characterLife/services/characterEventCaptureService.ts`；
- `relationshipCognitiveProjectionService.ts`；
- `src/core/storage/repositories/characterEventRepository.ts`。

### 6.5 删除和重生成

删除消息由 `App.tsx` 的 `handleDeleteMessage` 处理：

- 删除消息本体；
- 撤回以该消息为证据的 Truth Claim；
- 撤回相关 Conversation Summary 和 OOC Correction；
- 删除由这些 Claim 派生的兼容 Memory；
- 删除关联的生成图片记录和 IndexedDB 图片资产。

因此，删除有问题的回复后再重生成，不会继续把已删除回复作为聊天历史。已经存在但没有来源关联的手工记忆或旧版遗留记忆不会被猜测性删除，应由用户在记忆书中管理。

OOC 提交会保存当前关系下的行为纠正，然后用删去旧回复后的上下文重新生成。

## 7. 各应用的逻辑和互通边界

### 7.1 聊天与朋友圈

入口：`src/components/AppChat.tsx`。朋友圈 UI 位于 `src/features/moments/MomentsApp.tsx`，生成服务位于 `src/features/moments/`。

聊天可读取：

- 当前角色完整人设和参考资料；
- 当前关系安全事实、事件、摘要和兼容 Memory；
- 当前关系可见世界书；
- 当前关系明确分享的论坛/日记内容；
- 与当前关系相关的音乐状态；
- 允许的朋友圈公开记录；
- 已同步线下剧情交接；
- 时间和当前场景。

朋友圈生成走 `MomentPublicCognitiveContext` 和 `MomentPromptAdapter`。它默认只能使用公开资料、公开历史、明确授权事实和公开事件，不能直接读取私聊 Memory、私人关系事件、InnerVoice 或线下私密正文。

朋友圈生成成功本身不会自动写成关系事实。删除朋友圈时，会清理与该动态显式关联的自动 Memory。

安全拦截的朋友圈任务不会影响正常朋友圈频率；被拦截任务按独立策略静默延后重试。

### 7.2 档案馆

入口：`src/components/AppArchives.tsx`。

负责角色创建、编辑、导入导出、角色卡/PNG/DOCX 解析、参考资料、语言、主动联络、语音绑定和图片外观设置。导入逻辑集中在：

- `src/utils/pngParser.ts`；
- `src/domain/import/structuredCharacterDocument.ts`；
- `src/features/archives/characterExport.ts`。

角色资料是规范人设来源，不要把关系聊天数据反写进角色卡。

### 7.3 世界书

入口：`src/components/AppWorldBook.tsx`。

负责世界书编辑、导入、分类、作用域、可见性、用途、触发方式和注入位置。运行时必须由 `src/utils/worldBook.ts` 和各场景 Visibility Policy 筛选。

### 7.4 记忆书

入口：`src/components/AppMemory.tsx`。

显示兼容 Memory，并可创建手工事实、编辑/撤回 Truth Claim、设置提取模型和召回数量。手工记忆也必须绑定当前关系；不要恢复按角色全局共享的旧写法。

### 7.5 线下模式

入口：`src/components/AppOffline.tsx`，样式和子组件在 `src/components/offline/`，领域规则在 `src/domain/offlineStory/`。

模式：

- `director`：导演式剧情；
- `continue`：从线上聊天继续；
- `if`：假设线，不视为现实事实。

线上消息进入线下时只是不可见的上下文快照，不直接渲染成线下正文。线下结束时：

1. 先校验故事模式、关系、角色和事实策略；
2. 用户确认后提炼长期摘要；
3. API 没返回结构化摘要时使用安全、可核对的确定性摘要；
4. 写入 relation-scoped Memory/Truth；
5. 创建 pending online handoff；
6. 返回聊天时把线下经历作为位于两段聊天之间的时间线锚点；
7. 交接成功后再确认/记录相关事件。

关键文件：

- `src/domain/memory/offlineMemorySync.ts`；
- `src/domain/offlineStory/offlineStoryFactPolicy.ts`；
- `src/features/characterLife/services/offlineStoryEventCaptureService.ts`；
- `src/features/chat/prompts/onlineOfflineBoundary.ts`。

### 7.6 主动线下邀请与日程

日程入口：`src/components/AppSchedule.tsx`。领域模型：`src/domain/schedule/`。存储：`src/core/storage/repositories/scheduleRepository.ts`。

当前流程：

```text
聊天菜单中按关系开启“主动发起线下”
  → evaluateProactiveOfflineEligibility()
  → 模型只有在存在自然铺垫且距离可行时才获得邀请能力
  → 模型输出内部邀请指令
  → parseProactiveOfflineInvitationDirective()
  → createProactiveAppointment()
  → 用户接受/拒绝/改期
  → applyProactiveOfflineResponse()
  → Appointment 持久化
  → ScheduleEntry 只读投影
  → 到期后聊天中出现线下入口
  → startAppointmentOfflineSession()
  → 进入线下并让邀请方自动开启第一幕
  → 离开线下时 completeAppointmentOfflineSession()
```

硬性资格规则位于 `proactiveOfflineEligibility.ts`：

- 每段关系独立开关，默认关闭；
- 已有未结束约定时不能再建一个；
- 最短冷却 72 小时；
- 拒绝后退避 7 天；
- 7 天最多 2 次；
- 必须有自然上下文铺垫；
- 用户明确没空时阻止；
- 同城可立即或未来见面；
- 有合理出行证据时只能安排未来见面；
- 距离无法判断时不允许凭空邀请。

这些规则只判断“能不能提出”，不规定角色必须如何邀请。措辞、主动程度、称呼和反应仍由人物卡决定。

`Appointment` 是唯一持久化事实，`ScheduleEntry` 是派生展示，不要双写两个来源。日程 V1 只显示好友见面约定，不包含普通待办和经期记录。

**没有安装日程应用不会破坏邀请流程。** 约定仍写入 `phone_schedule_v1`，聊天和线下入口仍正常；日程应用只是查看器。新用户默认桌面带日程，老用户桌面不被修改，用户手动安装/卸载和刷新不会被重置。

### 7.7 日记

入口：`src/components/AppDiary.tsx`，服务：`src/features/diary/`，仓储：`diaryRepository.ts`。

日记按作者、用户身份和关系保存。角色日记生成使用 `DiaryPromptAdapter` 的安全认知投影。私聊不能遍历日记库；只有用户明确点击分享，生成冻结的 `DiaryShareSnapshot` 和带 `diaryShareId` 的聊天消息后，当前关系才能讨论该条日记。

### 7.8 论坛

入口：`src/components/AppForum.tsx`。普通论坛服务位于 `src/features/forum/`，故事论坛位于 `src/features/forumStory/` 和 `src/domain/forumStory/`。

公开论坛严格使用 `PublicForumCognitiveContext`。即使调用函数拿到了 `messages`、`memories` 和 `relationships`，Builder/Adapter 也必须执行 deny-by-default 投影，禁止私聊、关系 Memory、InnerVoice 和线下私密内容进入公开 Prompt。

论坛分享进入私聊时保存冻结 `ForumShare` 快照；聊天只讨论明确分享的那条内容，不能顺便读取整个论坛私域。

论坛活动引擎在 `App.tsx` 中持续运行，不依赖用户停留在论坛页面。

### 7.9 音乐

入口：`src/components/AppMusic.tsx`。播放逻辑：`src/features/music/services/musicPlayback.ts`。

音频文件在 IndexedDB，播放列表和关系状态在持久化数据中。双人音乐按 `ownerIdentityId + relationId + conversationId` 隔离。聊天只注入与当前关系有关的正在播放/最近选择信息。

### 7.10 备忘录

入口：`src/components/AppNotes.tsx`。这是本地工具，不应自动成为角色知识。除非未来设计明确的“分享给好友”流程，否则禁止把备忘录内容直接注入 AI Prompt。

### 7.11 设置和美化

入口：`src/components/AppSettings.tsx`。主题核心：`src/features/theme/`。

全局字体支持上传 TTF/OTF/WOFF/WOFF2 和字体直链：

- 设置字段在 `UserSettings`；
- 校验/规范化在 `src/features/theme/globalTypography.ts`；
- 运行应用在 `useGlobalTypography.ts`；
- 上传字体 Blob 在 `fontAssetDb.ts`；
- CSS 变量为 `--app-root-font-size`、`--app-font-scale`、`--app-font-family`。

全局字号会使 rem 和已登记的任意 px 字号按比例变化。极少数必须维持紧凑几何的分段控件使用固定控制类，例如 `schedule-filter-control`、`beauty-segment-control`。

聊天主题稳定接口位于 `src/features/chat/styles/chatThemeTemplate.ts`。消息类型已经拆为独立 hook：

- `.chat-message--text`；
- `.chat-message--voice`、波形和时长子元素；
- `.chat-message--call`、图标和时长；
- `.chat-message--image`、`.chat-message--text-image`；
- `.chat-message--sticker`；
- `.chat-message--payment`、红包和转账；
- `.chat-message--forum-share`、`.chat-message--diary-share`；
- `.chat-composer__attachment-panel`；
- `.chat-header__back-button`、`.chat-header__more-button`；
- `.chat-composer__send-button` / `.send-button`。

不要再使用 `.chat-bubble-self *` 这类全后代覆盖，它会污染红包、引用、语音和特殊卡片。主题只改视觉变量/稳定类，不能用 CSS 隐藏功能图标来改变业务能力。

## 8. 消息类型、语音、通话和图片

`Message` 的共同作用域字段是 `characterId/relationId/conversationId/sender/timestamp`。不同消息通过字段或内部 markup 表示：

- 文字；
- 语音与转写；
- 通话记录与通话转录；
- 上传/生成图片；
- 文字图；
- 红包/转账；
- 位置；
- 表情包；
- 论坛分享；
- 日记分享。

所有进入 Prompt 的消息必须通过 `messagePromptSerializer.ts`，不能直接使用 `message.content` 拼历史。序列化器负责保留说话人、媒体语义和通话内容，避免角色复读用户语音或把角色自己的台词归给用户。

### 8.1 TTS

相关文件：

- `src/features/voice/ttsConfig.ts`；
- `src/utils/minimaxTts.ts`；
- `src/server/mosslandTts.ts`；
- `server.ts` 和 `src/cloudflare/worker.ts` 的代理路由。

支持 MiniMax 和 Mossland。`enableMiniMaxTts` 是兼容保留的全局总开关；关闭时，即使角色绑定了 voice ID 也不能自动合成。角色可以分别绑定 MiniMax/Mossland voice ID。

电话模式中每个角色气泡进入独立语音队列，字幕在对应音频开始播放时显示；挂断会停止当前音频、清空队列并释放 URL。移动端会在用户操作时预先解锁同一个 Audio 元素。

### 8.2 图片

图片 API 协议判断在 `src/features/chat/services/imageProtocol.ts`，生成在 `characterImageService.ts`，后端适配在 `src/server/imageProtocolAdapters.ts`。必须同时满足全局图片生成开关和角色级图片生成开关，才允许角色生成图片。

图片二进制保存在 IndexedDB，消息只保存 `imageAssetId` 等元数据。关系隔离和删除清理不可省略。

## 9. API 路由

前端统一入口为 `src/utils/apiHelper.ts`，超时策略在 `src/utils/fetchWithTimeout.ts`。

文本请求优先调用同源 `/api/*`：

- `/api/chat`；
- `/api/translate`；
- `/api/test-key`；
- `/api/models`；
- `/api/extract-memories`；
- `/api/summarize-personality`。

图片和语音还有：

- `/api/image/models`、`/api/image/test`、`/api/image/generate`；
- `/api/minimax-tts`；
- `/api/mossland-tts`。

Node 路由在 `server.ts`，Cloudflare 对应路由在 `src/cloudflare/worker.ts`。修改 API 时必须同步两端。

当静态站没有后端路由且返回 404/405、空响应或 HTML fallback 时，文本 API 才尝试浏览器直连。真实供应商 HTTP 错误不能再直连重发，否则会重复请求并掩盖原始错误。

自定义文本 API 按 OpenAI Chat Completions 兼容协议处理；没有自定义 endpoint 时走 Gemini 原生协议。历史角色映射由 `promptTransport.ts` 统一处理。

## 10. 应用注册、桌面、商店与图标

新增一个应用至少要检查以下位置，缺一项都可能造成“代码存在但用户打不开”：

1. 创建 `src/components/AppXxx.tsx`；
2. 在 `src/App.tsx` 增加 `loadAppXxx`；
3. 加入 `APP_LOADERS`；
4. 创建 `React.lazy` 组件；
5. 在 `AppIcons` 增加默认图标；
6. 在 `desktopApps` 增加 `{ id, name, icon }`；
7. 在 `activeApp === "xxx"` 渲染区增加 `LazyAppBoundary`；
8. 在 `src/components/AppStore.tsx` 的 `APPS_LIST` 增加商店卡片；
9. 在 `src/components/AppSettings.tsx` 的 `appKeys` 增加自定义图标入口；
10. 如需默认安装，分别处理 `installedAppIds` 和 `DEFAULT_HOME_SCREEN_ITEMS`；
11. 为持久化数据增加类型、storage key、repository、规范化/迁移和备份覆盖；
12. 增加懒加载、商店、图标、旧用户保护和数据隔离测试。

### 10.1 应用安装与刷新

- 安装列表：`phone_installed_apps`；
- 桌面布局：`phone_homescreen_items`；
- `handleInstallApp` 会找空位、写入两者并切换到对应桌面页；
- `handleUninstallApp` 只移除安装和桌面入口，不应删除应用业务数据；
- 刷新后从持久化值恢复，不会重置手动安装结果。

### 10.2 默认安装规则

不要通过“每次启动缺少就 push”给老用户强塞应用。日程使用 `src/features/home/freshInstallPolicy.ts` 判断是否为真正未使用过的新安装：

- 新安装可以获得新默认应用；
- 只要已有桌面、安装列表或真实用户数据，就保留用户原布局；
- 空仓储脚手架不算用户数据。

新增另一个默认应用时，应把规则扩展为通用的新安装策略，并补旧用户保护测试，不能复制一个无条件修复 useEffect。

### 10.3 自定义图标

自定义图标保存在 `settings.customIcons[appId]`。桌面和商店会优先显示该 URL/Base64，否则显示 `AppIcons` 默认图标。

新增应用后必须加入 `AppSettings.appKeys`，否则“美化设置 → 自定义应用图标”看不到它。桌面模块备份已经包含整个 `customIcons` 对象和桌面布局，但新应用自己的业务数据仍需进入系统备份/仓储体系。

## 11. 存储、迁移、备份和清理

主键清单位于 `src/core/storage/storageKeys.ts`。核心数据包括角色、消息、关系、世界书、Memory、Truth Claim、事件、摘要、纠正、朋友圈、论坛、日记、线下故事、日程和主题等。

规则：

- 不要改已有 key 的含义；
- 结构变化要提供 normalize/migration；
- 读取失败要返回安全默认值和错误，不要覆盖原数据；
- 写入失败不能显示“同步成功”；
- 多步写入应验证持久化结果，必要时回滚；
- 大 Blob 使用 IndexedDB；
- 系统清理要同时清 localStorage、sessionStorage、Cache Storage 和全部二进制 DB。

`src/features/settings/clearApplicationData.ts` 已统一清理音频、图片、表情、线下故事、字体和阅读正文 DB。新增新的 IndexedDB 时，必须把 clearer 加进去。

## 12. 最近的重要修改（2026-08-11 至 2026-08-13）

### 12.1 架构与稳定性

- 删除失效旧代码和重复入口；
- 拆分聊天 UI、控制器、服务、提示词和稳定主题接口；
- 二级应用改为懒加载；
- 增加统一 `npm run check`；
- 增加存储安全适配和统一 API 超时；
- Node/Cloudflare 文本、翻译、图片、TTS 路由保持对应。

### 12.2 角色与聊天

- 恢复按角色资料、国籍和世界书识别回复语言；
- 最终语言锚点防止系统中文覆盖角色语言；
- 修复不同好友之间消息、输入状态、通知和名字串线；
- 语音消息、通话记录和普通文字统一走正确历史序列化；
- 增加复读检测和一次纠正重试；
- 防止角色给用户凭空添加职业等设定；
- 通用活人感、情绪和对话策略降为软指导；
- 增加最终角色表达锚点，避免九轮重构后人物语气趋同；
- 跨日聊天将相对时间绑定原消息日期；
- 删除、批量删除和 OOC 重生成会清理来源关联事实。

### 12.3 媒体与主题

- 修复翻译与聊天 API 路由不一致；
- 修复 MiniMax/Mossland 电话 TTS、总开关、字幕/播放同步和挂断清理；
- 语音、电话、图片、红包、转账、论坛/日记分享拥有独立主题类；
- 工具栏、导航、输入和发送按钮暴露稳定主题 hook；
- 经典气泡与液态玻璃样式分离；
- 增加全局字体上传/直链与字号调整；
- 日程筛选和美化分段按钮固定为紧凑控件尺寸。

### 12.4 线下、记忆与日程

- 修复线下摘要显示成功但未持久化；
- 兼容提取 API 的普通文本摘要并保留确定性安全 fallback；
- 线下结束创建可靠的线上时间线交接；
- 修复跨日线上/线下连续性和主语归属；
- 重建 V1 日程领域、仓储和 UI；
- 增加主动线下开关、资格、邀请协议、改期/拒绝处理；
- 日程到期可进入线下并由邀请方开启第一幕；
- 完成线下后约定状态变为历史；
- 日程只为全新用户默认加入桌面，老用户布局不变。

### 12.5 阅读应用第一阶段（Round 1～6，已完成）

- 产品基线位于 `docs/READING_APP_PRODUCT_BASELINE.md`，技术边界位于 `docs/READING_APP_TECHNICAL_DESIGN.md`；
- 已建立 `src/domain/reading/` 的书籍、章节、稳定段落锚点、进度、标注、偏好与完整关系作用域模型；
- 私人阅读统一按 `userIdentityId + bookId` 隔离，未来共读必须继续校验 `readingRoomId + relationId + characterId + conversationId`；
- 元数据键为 `phone_reading_store_v1`，原始 TXT/Markdown 正文 Blob 位于 `FanfanjiReadingDB`；
- 阅读字体只保存全局 `fontAssetId` 引用；阅读应用已完成懒加载、默认图标、商店卡、自定义图标和桌面渲染接入；
- “阅读”对新老用户均不默认安装，只能通过应用商店主动安装；卸载只移除入口，不删除阅读数据；
- 第一阶段只做 TXT/Markdown 和上下滚动，AI 分析、EPUB 与左右翻页不得提前混入。
- Round 3 已接入本地文件导入：UTF-8/UTF-16/GB18030 解码、正文 SHA-256、同身份重复检测、跨身份隔离、IndexedDB Blob 写入与元数据失败回滚。
- 导入时正文会规范化为 UTF-8 Blob；元数据仓库不可读时拒绝写入，避免以安全空值覆盖原始损坏数据。
- 当前阅读页已能展示当前身份的本地书架和导入反馈，但尚未实现章节解析与正文阅读。
- Round 4 已实现导入时分章、稳定段落锚点、旧书补解析、书籍详情、目录、资料编辑、归档恢复和永久删除。
- 删除先提交作用域内元数据和 `assetCleanupTasks`，再清正文 Blob；失败任务会在下次进入阅读应用时重试，且永不跨 `userIdentityId + bookId + assetId` 清理。
- 目录当前是只读预览；正文阅读、目录跳转和进度恢复从 Round 5 开始。
- Round 5 已实现上下连续正文、目录跳转、上一章/下一章和 `chapterId + paragraphAnchorId + characterOffset` 精确恢复。
- 阅读百分比按可阅读段落的累计字符计算，不受章名、空行、视口尺寸或字体变化影响；像素滚动量不作为持久位置真相。
- 正文加载与进度保存都强制校验 `userIdentityId + bookId`，相同书籍 ID 在不同身份下仍完全独立。
- 第 6 轮继续完成搜索、复制、高亮、笔记、书签、字体排版以及含正文 Blob 的完整备份恢复。
- Round 6 已完成本地全文搜索、选区复制、范围高亮/取消、范围笔记、段落书签和单书排版设置。
- 单书字体只引用全局 `FontAsset` 的 `fontAssetId`，不重复保存字体文件。
- 独立 Reading Archive 会携带当前身份的正文 Blob、元数据、进度、标注和偏好；恢复前校验版本、UTF-8 与 SHA-256，并为目标身份重新生成全套 ID。
- 系统 JSON 备份不包含阅读正文，设置页已取消“所有数据完整导出”的误导说法并引导使用阅读归档。
- 第一阶段已收口；Round 7 建立了独立 AI 好友共读房间，Round 8 加入 AI 阅读游标、已知章节/段落边界与显式剧透冻结，Round 9 已加入房间内评价和召唤讨论线程。下一轮接入真实 AI 段评/召唤生成时，必须复用安全上下文投影并继续保持关系隔离。

## 13. 新增 AI 应用时的强制流程

如果新应用会让角色生成内容，必须按以下顺序设计：

```text
1. 明确场景是 private / relationship / public / hypothetical
2. 明确 userIdentityId、relationId、characterId、conversationId
3. 选择或新增 Context Builder
4. 选择或新增场景 Prompt Adapter
5. Adapter 做 deny-by-default 字段投影
6. Service 组织请求，不直接读取所有仓储
7. API 返回先解析/校验，再保存
8. 若要写长期事实，走来源 + scope + policy + confirmation
9. 增加隔离和 private-to-public 拒绝测试
```

不要把 `Character`、`Relationship`、全部 `Memory`、全部世界书和全部消息直接 JSON.stringify 后交给模型。

## 14. 哪些代码可以动，哪些必须谨慎

### 14.1 通常可以直接扩展

- 新应用自己的 `components/AppXxx.tsx`；
- 新的 `features/xxx/`；
- 新的纯 `domain/xxx/`；
- 新 repository 和独立 storage key；
- 新测试；
- 新应用自己的 CSS，前提是有根节点作用域。

### 14.2 可以动，但必须配测试

- `src/App.tsx` 的应用注册、全局状态和跨应用 props；
- `src/types.ts` 的持久化字段；
- `storageKeys.ts`、migration、backup、clear；
- `AppSettings.tsx` 的设置与图标注册；
- `AppChat.tsx` 的上下文收集和渲染分支；
- Prompt Builder/Adapter/世界书可见性；
- 关系、事实、事件、线下和日程状态机；
- API 协议适配器和 Node/Cloudflare 路由。

### 14.3 禁止直接破坏

- 不得删除或改义已有 storage key；
- 不得只用 `characterId` 合并直接聊天数据；
- 不得跨 `userIdentityId/relationId` 读取私聊和记忆；
- 不得让公开朋友圈/论坛读取私密关系 Memory；
- 不得把 InnerVoice 当事实或共享 Prompt；
- 不得把 AI 生成文本未经确认写成长期事实；
- 不得让通用提示词硬覆盖角色卡；
- 不得在重生成时使用已删除的错误回答；
- 不得用全局 CSS 后代选择器污染特殊消息；
- 不得无条件修改已有用户桌面和安装列表；
- 不得显示成功后再忽略持久化失败；
- 不得只改 `server.ts` 而漏掉 Cloudflare Worker，反之亦然。

## 15. 新 Codex 窗口推荐开场提示

可以把下面这段和本文路径一起发给新窗口：

```text
请先完整阅读 docs/CODEX_PROJECT_HANDOFF.md，再检查当前 git 分支和工作区。
开发时必须保持 userIdentityId + relationId + characterId + conversationId 隔离，
角色卡和角色专属世界书高于所有通用活人感/情绪/对话策略提示，
公开应用不得读取私聊 Memory，生成内容不得未经确认写为事实。
新增应用时同时检查 App.tsx 懒加载/图标/桌面渲染、AppStore 商店卡片、
AppSettings 自定义图标、存储仓储/迁移/备份/清理、新旧用户桌面保护和测试。
不要修改无关代码；完成后运行 npm run check。
```

## 16. 推荐阅读顺序

新窗口无需一开始读完整个仓库，建议按任务选择：

1. 本文；
2. `src/features/chat/prompts/README.md`；
3. `docs/cognitive-entry-contract.md`；
4. `docs/character-truth-layer-design.md`；
5. `docs/character-system-global-audit.md`；
6. `docs/memory-integrity-audit.md`；
7. 涉及公开内容时读 `docs/moment-public-cognitive-design.md` 与 `docs/forum-cognitive-context-audit.md`；
8. 涉及线下时读 `docs/offline-story-relationship-scope-audit.md`；
9. 再进入对应 `App*.tsx`、domain、feature 和测试文件。

如果本文与代码不一致，以当前代码和测试为准，并在修改代码的同一提交中更新本文。
