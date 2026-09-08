# Stage 3B-4：Normal DirectReplyUseCase 边界

## 结论

Stage 3B-3 后重新审计了 `AppChat` 的 normal direct-send pipeline。原来的
38 项隐式依赖仍然存在于页面闭包中，但可以安全收敛出一个很薄的应用层边界：

```text
已持久化 user Message
  → AppChat 收集 runtime facts 与 feature-owned material
  → DirectReplyPreparation
      → DirectChatContextSnapshotBuilder
      → DirectChatPromptBuilder / PromptComposer 输入
      → prepared DirectReplyTurn request
  → DirectReplyUseCase
      → DirectReplyTurnExecutor
      → caller-owned post-reply adapter
          → existing PostReplyCoordinator
  → DirectReplyLifecycleOutcome
```

`DirectReplyUseCase` 只服务普通一对一 `send / normal_send`。它不接收原始
composer text，也不负责 user-message persistence；`useChatController` 仍先创建、
持久化 user message，再调用 `generateResponseForUserMessage`。空输入的既有
“继续故事”路径保留 `userMessage: null` 兼容语义，但没有把原始输入带入 UseCase。

## 直接依赖与输入形状

`src/features/chat/services/directReplyUseCase.ts` 的直接运行时依赖只有：

1. `DirectReplyLifecycleInput/Outcome` contract；
2. `executeDirectReplyTurn`；
3. `Message` 与既有 candidate result 类型；
4. 一个 caller-owned post-reply adapter（可选）。

输入是三段式的 `DirectReplyUseCaseInput`：现有 lifecycle input、一个已经准备好的
`DirectReplyTurnExecutorInput`、以及一个 post-reply adapter。它没有复制 Context/Prompt
字段，也没有 40 字段的万能 snapshot。UseCase 输出既有 `DirectReplyLifecycleOutcome`，
另带内存中的 response/candidates/delivered messages，供 caller 完成已有 side-effect
适配；这些字段不写入 Ledger 或 lifecycle outcome。

## 依赖分类（Stage 3B-4 re-audit）

| 类别 | 当前真实依赖 | 处理 |
|---|---|---|
| A Application service | lifecycle contract、TurnExecutor、PostReplyCoordinator 调度 | UseCase 直接使用前两者；Coordinator 通过 adapter 调用 |
| B Runtime snapshot/input | character、relationship、identity、history、signal、scope | 由 AppChat 在同一 render/turn 中解析并封装；不由 UseCase 再读取页面状态 |
| C Context/Prompt material | `buildDirectChatContextSnapshot`、WorldBook/Truth/Memory、`buildDirectChatSystemInstruction`、PromptComposer 输入 | feature producer 仍由 caller 提供 material；`directReplyPreparation.ts` 复用现有 snapshot/prompt builders 并输出 prepared request；UseCase 只消费结果 |
| D UI-only | React state/setter/ref、toast、typing、call transcript、scroll、modal、selection、navigation | 保留在 AppChat/controller；delivery 仅以既有 adapter 传入 |
| E Persistence | user message persistence、assistant delivery、relationship/appointment/phone repositories | user message 在 UseCase 前完成；assistant 与跨功能写入继续由 delivery/caller adapter 完成 |
| F Post-reply/cross-feature | inner voice、offline handoff/proactive、memory、diary、Moments/cover | 不复制实现；delivery 后由 caller-owned adapter 调用现有 helper 与 PostReplyCoordinator |
| G Infrastructure | request protocol、candidate IDs/clock、sequential delivery、AbortSignal | request/candidate/delivery 仍封装在 TurnExecutor 和既有 service；UseCase 只编排结果 |

## 生命周期与异常语义

- provider、parse、delivery、cancelled 结果沿用既有 phase/status/error 分类；原始
  异常仍只在内存中交给 caller 的旧 UI error flow，lifecycle outcome 只含分类。
- successful delivery 后 post-reply adapter 只调用一次。Coordinator 返回的
  scheduled/failures 映射到 `post_reply_scheduled`；adapter 异常降级为
  `failures: ["post_reply"]`，主回复仍保持 `delivered`。
- partial delivery 仍只报告实际 delivered IDs，不虚报完整成功。
- `AbortSignal` 仍产生 `cancelled`，不改变 controller 的 lock/typing 清理。

## 明确不属于 UseCase

regenerate (`useChatRegenerationAction`)、send-only、group chat、voice call orchestration、
offline story branch、payment/red-packet、独立 image generation、Moments/Forum/Reading、
Character Phone background jobs、Prompt/WorldBook/Truth/Memory 查询算法、storage
implementation 与 UI 生命周期均不进入此边界。

## afterReplySuccess 当前语义

主回复交付后，inline inner voice、offline/proactive marker 等 caller-owned 动作仍按
原顺序执行；`PostReplyCoordinator` 再调度已有 `chatSideEffectController.afterReplySuccess`
和 Diary service。Memory/Diary 仍是 best-effort background work：其失败记录在
coordinator metadata，不抛回已交付的主回复。此阶段没有把这些功能迁移进 UseCase。

## Stage 3B-5 preparation boundary

`src/features/chat/services/directReplyPreparation.ts` 是一个 84 行的薄边界：

- `prepareDirectReplyContext` 只委托现有 `buildDirectChatContextSnapshot`；
- `prepareDirectReplyTurn` 只委托现有 `buildDirectChatSystemInstruction`，并组装现有
  `direct-chat` PromptContext、settings、signal 与 alias guard；
- 它不读取 React、storage 或 feature implementation，也不调用 Provider、PromptComposer、
  retry/fallback、delivery、Ledger 或 post-reply service；
- Truth/Memory、WorldBook、Offline、Moments、Music、Forum、Diary、Memo 的具体 producer
  仍由 caller 生成 material，避免形成新的 God Service；
- send-only 与 regenerate 不经过该 normal preparation boundary。
