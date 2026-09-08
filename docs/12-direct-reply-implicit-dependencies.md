# Stage 3B-2：Direct Reply 隐式依赖审计

## 结论

本审计以 `src/components/AppChat.tsx` 当前 normal direct send 的真实调用链为准，
不把 `executeDirectReplyPipeline` 的参数列表当成完整依赖。按“一个可独立治理的
能力/状态来源”为一项、把同一 service family 的函数合并计数，当前共有 **38 项
隐式依赖**。这不是一个适合直接搬到 `DirectReplyUseCase` 的函数：它同时捕获
页面状态、React setter、持久化回调、特殊消息策略和跨 feature side effect。

因此 Stage 3B-2 **不创建 `DirectReplyUseCase` shell**，也不移动生产编排。已有的
`chatReplyController` 是路由边界，不是完整 Use Case；另有 `useChatRegenerationAction`
负责 regenerate，避免把两种生命周期重新合并。

## 真实调用链

```text
ChatComposer
  → useChatController.handleSendAndReply
  → createChatUserMessage
  → onSendMessage (先持久化用户消息)
  → appendChatUserMessageToOfflineStory（仅线下路径）
  → generateResponseForUserMessage
  → chatReplyController.generate
  → getContext / getCognitiveContext
  → executeDirectReplyPipeline
  → context snapshot / history / retrieval
  → system instruction / PromptComposer 输入
  → requestDirectChatTurn
  → response directive 清理与解析
  → createDirectReplyCandidates
  → deliverDirectReplyCandidates
  → inline/offline/appointment/phone side effects
  → PostReplyCoordinator
      → ChatSideEffectController（memory eligibility、summary marker、cover patch）
      → Diary service（达到既有条件时异步生成）
  → DirectReplyLifecycleOutcome
  → controller/caller（当前主要 await 后忽略 outcome）
```

`sendCustomMessage` 是另一个页面入口：它同样先通过
`createUserTextMessage` 和 `onSendMessage` 持久化，再按 `triggerReply` 调用普通
回复；贴纸使用 `triggerReply: false`。通话字幕也复用 direct pipeline，但带有
独立 call transcript 与取消代数。

## Implicit Dependency Inventory

| # | 依赖/来源 | 使用阶段 | 读/写 | 归类 | 可直接注入 | Stage 3B 判断 |
|---:|---|---|---|---|---|---|
| 1 | `DirectReplyLifecycleInput/Outcome/Phase` 与 outcome factory | 初始化、终态 | 读/写 | application | 是 | 可进入 contract |
| 2 | `userMsg`、`customHistoryOverride`、`cognitiveContext`、`replyContext`、`signal` | 整个 turn | 读 | runtime snapshot | 是 | 复用现有 input，不建第二套 |
| 3 | `activeCharacter`、`latestActiveCharacterRef` | identity、prompt、candidate | 读 | runtime snapshot | 是 | 通过 scope snapshot |
| 4 | `activeRelationship`、`latestActiveRelationshipRef` | relation retrieval、post-reply | 读/写关系 | runtime snapshot / persistence | 需 adapter | 不直接搬入核心 |
| 5 | `activeChatCharId`、`activeRuntimeContext` | history、scope、delivery | 读 | runtime snapshot | 是 | 由 caller 解析 |
| 6 | `activeIdentityId/name/bio` 与 `settings.identities` | user profile、alias guard | 读 | business input | 是 | 作为已解析 identity snapshot |
| 7 | `settings`、`draftContextMemoryLimit`、`tokenEstimateScopeKey` | request、estimate | 读/写 UI estimate | application/UI adapter | 需 adapter | 不让 Use Case 依赖 React state |
| 8 | `currentChatMessages`、`messages` | history、retrieval、candidate policy | 读 | runtime snapshot | 是 | 由 context input 提供 |
| 9 | `characters`、`relationships` | alias、canonical scope、cross-contact hint | 读 | business input | 需 adapter | 先由 scope/identity adapter 收窄 |
| 10 | `memories`、knowledge claims、summaries、behavior corrections | Truth/Memory retrieval | 读 | Context / persistence | 需 adapter | 下层 retrieval service owner |
| 11 | `worldBookEntries` 与 World Book builders | scan、system blocks、language | 读 | Context / Prompt | 需 adapter | 不把查询算法带入 Use Case |
| 12 | Moments、music、forum share、diary share、user memo sources | system context | 读 | cross-feature context | 需 adapter | 先形成已格式化 context |
| 13 | offline story/handoff services 与 `pendingOfflineHandoffForReply` | context、delivery marker | 读/写 | cross-feature | 需 adapter | 不进入核心 direct contract |
| 14 | appointments 与 proactive-offline eligibility/directives | prompt、appointment persistence | 读/写 | cross-feature | 需 adapter | 留在专用 coordinator |
| 15 | `activeAttachModal`、`callingStatus`、`callTranscript`、`callSpeechGenerationRef` | call history、cancel、delivery | 读/写 | UI/voice adapter | 需 adapter | 不进入普通 direct core |
| 16 | `stickerGroups` 与 sticker prompt builder | prompt | 读 | Prompt input | 是 | 可由 prompt input 提供 |
| 17 | character-phone repository、password derivation、owner identity | pre-request password fact | 读/写 | cross-feature persistence | 需 adapter | 不进入核心 |
| 18 | `onSendMessage` / `onSendMessageRaw` / call transcript callback | delivery | 写 | delivery/UI adapter | 是 | 以 delivery port 表达 |
| 19 | `setIsTyping`、`setTypingCharacterOverride` | request/delivery/finally | 写 | UI state | 需 adapter | 只保留 lifecycle adapter |
| 20 | `showToast`、call error transcript publisher | parse/error | 写 | UI adapter | 需 adapter | Use Case 返回分类，不控制 React |
| 21 | `setCallTranscript` | call error | 写 | UI/voice adapter | 需 adapter | voice 专属 |
| 22 | `setLastChatRequestEstimate` | post-context estimate | 写 | UI/observability adapter | 需 adapter | 由 caller/telemetry adapter 消费 |
| 23 | `onSaveRelationships`、`onSaveAppointment`、`onSaveImageToCharacterPhone` | recognition、offline、image | 写 | persistence adapter | 需 adapter | 不直接注入核心 |
| 24 | `buildDirectChatContextSnapshot`（由 `directReplyPreparation.ts` 委托） | history/context boundary | 读 | Direct Reply preparation | 是 | normal preparation boundary |
| 25 | Truth/Memory/offline/forum/diary/music context builders | context assembly | 读 | Context service | 是（聚合后） | 先聚合，不搬算法 |
| 26 | `buildDirectChatMainPrompt`、`buildDirectChatSystemInstruction` 与 PromptComposer 输入 | prompt | 读 | Direct Reply preparation | 是 | builder 复用；不在 preparation 中实现检索 |
| 27 | alias/character/knowledge/time/voice/sticker/offline prompt policies | prompt blocks | 读 | Domain policy | 是（作为 builder 内部） | 不由 Use Case 重写 |
| 28 | `requestDirectChatTurn` | provider request | 写 | request service | 是 | 目标 dependency |
| 29 | response protocol、directive parsers、error classifier | parse/normalization | 读/写 data | parser/policy | 是 | 目标 dependency |
| 30 | `createDirectReplyCandidates`、emoji policy、`createId`、clock | candidate | 读/写 | candidate service/infra | 是 | 通过既有工厂与 ID governance |
| 31 | `deliverDirectReplyCandidates` | sequential delivery | 写 | delivery service | 是 | 目标 dependency |
| 32 | `innerVoiceController` 与 inner-voice repository | delivered reply side effect | 写 | cross-feature persistence | 需 adapter | 继续独立 service |
| 33 | `recordPendingOfflineHandoffDelivery`、`maybeAutoStartOfflineFromPresence` | delivered reply side effect | 写 | offline cross-feature | 需 adapter | 不进入核心 |
| 34 | red-packet parser/claim、延迟 `setTimeout` 通知 | pre-request side effect | 写 | special-message feature | 否 | 明确排除 |
| 35 | `createPostReplyCoordinator` | post delivery | 写 | application coordinator | 是 | 目标 dependency |
| 36 | `chatSideEffectController.afterReplySuccess` | memory summary、cover/offline update | 写/异步 | post-reply service | 通过 coordinator | 不复制算法 |
| 37 | `maybeGenerateDiaryAfterChat` | post delivery | 写/异步 | post-reply service | 通过 coordinator | 不进入核心 |
| 38 | `Date/Math/Intl/setTimeout` 及 `console` | time、delay、diagnostic | 读/写 | infrastructure | 需 clock/logger adapter | 不能由 Use Case 随意读取全局 |

其中第 1、24、26、28、29、30、31、35 项是未来真正的 application
dependency 候选；第 19–23、32–38 项说明当前函数仍然是页面闭包，而不是薄型
Use Case。把这些逐项作为参数会超过约 10–15 个 direct dependencies，因此本阶段
不建立 `AppChatDependencies` 或 30+ 项对象。

## React / AppChat closure 审计

`executeDirectReplyPipeline` 直接捕获的关键页面变量包括：

- React 状态/refs：`setIsTyping`、`setCallTranscript`、`setLastChatRequestEstimate`、
  `latestActiveCharacterRef`、`latestActiveRelationshipRef`、
  `callSpeechGenerationRef`、`innerVoiceController`；
- 页面快照：`activeCharacter`、`activeRelationship`、`currentChatMessages`、
  `messages`、`characters`、`relationships`、`settings`、`worldBookEntries`、
  `appointments`、`stickerGroups`、`activeRuntimeContext`；
- 页面回调：`onSendMessage`、`onSendMessageRaw`、`onSaveRelationships`、
  `onSaveAppointment`、`onSaveImageToCharacterPhone`、`showToast`；
- 页面闭包 helper：`ensureCharacterPhonePassword`、`publishReplyError`、
  `persistProactiveOfflineInvitation`、`maybeAutoStartOfflineFromPresence`。

这不是“30 个参数就能机械搬走”的情况：其中部分值需要同一 render 的快照，
部分回调要求当前页面 scope，部分 helper 会触发关系/离线/手机写入。未来应先
把这些 helper 的输出收敛为输入 snapshot 或独立 adapter，再移动 orchestration。

## User Message Persistence 边界

1. 普通发送的 user message **在 Use Case 之前**持久化：
   `useChatController.handleSendAndReply` 创建消息并调用 `onSendMessage`，随后才
   调用 `generateResponseForUserMessage`。`sendCustomMessage` 也遵循同一顺序。
2. send-only 必须保持 0 AI request：它只持久化消息和可选的 OfflineStory 更新，
   不调用 `generateResponseForUserMessage`；贴纸明确使用 `triggerReply: false`。
3. 如果持久化成功但 AI 失败，用户消息仍保留在聊天历史，pipeline 发布受控错误
   UI，`finally` 清除 typing，controller 的 in-flight lock 释放；不会回滚用户消息。
4. regenerate 不属于这一边界：它删除目标 assistant message，寻找已存在的最近
   user message，并通过独立 `useChatRegenerationAction` 生成替代候选；它不创建或
   持久化新的 user message。
5. 因此未来最安全的 DirectReplyUseCase 输入是“**已持久化 user message + 已解析
   runtime/history boundary**”，负责 generate/deliver reply。更高层 controller
   可以编排“persist + generate”，但不应让 Use Case 再次拥有 user-message
   persistence，否则会破坏 send-only 与失败后消息保留语义。

## Loading / Error / Composer 生命周期

| 生命周期 | 当前 owner | 结论 |
|---|---|---|
| in-flight lock | `useChatController.handleSendAndReply` | UI/controller；保持到 generator 完成 |
| typing 开始 | direct pipeline 请求前 `setIsTyping(true)` | lifecycle adapter；不进核心 Use Case |
| generating/typing 中间态 | `deliverDirectReplyCandidates` 的 `onTyping` | delivery adapter |
| typing 结束 | pipeline `finally`；stop 时 `onReplyStopped` 再清理 | UI/controller 双保险，暂不合并 |
| composer reset | controller 在发送前清 `quotedMessage`；输入栏自身管理文本 | UI/controller |
| error toast | `publishReplyError`；通话写入 call transcript | UI adapter；核心只返回 error kind |
| cancelled | `stopReply` abort + 删除 controller lock；pipeline 返回 cancelled | controller + lifecycle outcome |
| provider/parse failure | pipeline catch 分类并发布错误，finally 清 typing | pipeline 当前仍持有 UI adapter |
| delivery failure | delivery 抛错后 catch，用户消息不回滚，typing 结束 | 需 characterization，暂不迁移 |
| scroll | AppChat 的 `useEffect` 监听消息/typing | 页面 UI，不属于 Use Case |

## LifecycleOutcome 消费审计

`executeDirectReplyPipeline` 构造并返回完整 `DirectReplyLifecycleOutcome`，
`chatReplyController.generate` 原样转发。当前调用方主要只 `await` 它：

- `useChatController.handleSendAndReply` 等待结果以维持 in-flight lock，未消费字段；
- `sendVoiceCallMessage` 与日记分享自动回复使用 fire-and-forget/`finally`，未消费
  outcome 字段；
- `generateResponseForUserMessage` 是薄转发，不读取 outcome。

因此仍有两套状态源：outcome 的 phase/status/error，以及旧的
`setIsTyping`、toast/call transcript、controller lock、abort callback。现状必须
保留，因为 UI 仍依赖后者；未来只有在 caller adapter 消费 outcome 并承担 UI 恢复
后，才能删除旧 callback/throw 控制点。本阶段不删除。

## afterReplySuccess side effects

### 主回复成功前/交付期间的跨 feature 动作

- 角色手机密码可能在 prompt 前创建/修复并写入 repository；
- 图片留存 directive 触发异步写入角色手机；
- inner voice payload 在消息交付后同步写入 repository/controller；
- proactive-offline response/invitation 更新 appointment；
- pending offline handoff 标记交付，并可能按 presence 自动切换到 offline workspace；
- 红包消息在进入请求前安排延迟 claim notification；
- alias 明确披露会更新关系 recognition state。

### `PostReplyCoordinator` 调度

- 普通在线回复调用 `chatSideEffectController.afterReplySuccess`：离线故事追加
  （保留兼容分支）、达到阈值时延迟 memory extraction，并更新 summary marker；
  角色 Moments cover 通过既有 character patch 更新。
- 满足关系消息数与日记冷却条件时，调用既有 `maybeGenerateDiaryAfterChat`；其
  provider request、task/entry persistence 都在 Diary service 内完成。
- `regenerate` 仍不经过该 coordinator，保持 `regenerate_none` 语义。

Memory extraction 与 Diary 都是异步/后台动作，不应阻塞已投递的主回复；它们的
失败由各自 service/coordinator 降级，不应改变主消息。当前 pipeline 仍会捕获交付
后某些 inline side-effect 的同步异常并返回 failed outcome，这是已知边界，不能在
本阶段悄悄改变。

### 不应由 DirectReplyUseCase 接管

Group chat、voice call orchestration、Moments 生成、proactive scheduler/catch-up、
Forum、Reading、payment、独立图片生成、Character Phone background jobs、UI/DOM/
scroll/modal、localStorage/IndexedDB 实现、Provider protocol、WorldBook/Memory 内部
检索算法、Diary prompt 均不进入核心 Use Case。它们只能通过已有 service、post-reply
coordinator 或 caller adapter 参与。

## 最薄 dependency contract（设计，不实施）

未来可以将核心 contract 限制为 8 个高层能力：

```ts
interface DirectReplyUseCaseDependencies {
  context: DirectChatContextSnapshotBuilder;
  prompt: DirectChatPromptBuilder;
  request: DirectChatRequestService;
  parseAndCreateCandidates: DirectReplyCandidateService;
  delivery: DirectReplyDeliveryService;
  postReply: PostReplyCoordinator;
  lifecycle: DirectReplyLifecycleAdapter;
  clockAndIds: ClockAndIdPort;
}
```

这是设计目标而非当前可直接实现的类型：目前 context/prompt 输入还由页面从
多个 feature 读取，`lifecycle` 与 cross-feature adapters 也没有完全归一。若实际
注入仍需超过约 10–15 个 direct dependency，应停止迁移并先收敛 adapter。

## Stage 3B-3 / 3B-4 结果

Stage 3B-3 已完成**预构建 request 之后的 turn executor seam**：
把“request → response normalization → candidate creation → sequential delivery”
作为一个只依赖既有 request/parser/candidate/delivery service 的小模块，输入已由
当前 AppChat 生成的 prompt/context snapshot，输出 candidate/delivery/lifecycle
metadata。它没有移动 Context/Prompt、user-message persistence 或 inline cross-feature
side effects，也没有接触 regenerate。Stage 3B-4 在此之上只增加了 normal-send 的
`DirectReplyUseCase`：它接收既有 lifecycle input 与 prepared turn，调用该 executor，
再通过 caller-owned adapter 调度已有 PostReplyCoordinator；没有把 38 项页面依赖
整体搬入 service。
