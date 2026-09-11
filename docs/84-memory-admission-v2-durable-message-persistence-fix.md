# Stage 4D-11O-R5B — Durable Message Persistence Fix

## 状态

本阶段修复了 R5A 已证明的 Direct Chat durable message persistence seam。当前修复是 production-general 的，不包含 fixture 分支、Memory/Admission、Campaign、Prompt 或 Provider 逻辑。

R5A 的根因保持不变：消息先进入 App React state，再由 `useEffect` 调用 `saveMessages()`；IndexedDB 写入由 latest-snapshot writer 异步执行，而 Direct Chat 在回复结束前没有明确等待点，reload/lifecycle interruption 可使 `messages-v4` 仍为空。

## 修复设计

### Repository contract

- `saveMessages(snapshot)` 继续负责立即更新内存快照并 enqueue 一次 latest-snapshot durable write；其同步返回语义不变。
- `createLatestSnapshotWriter.flush()` 现在显式循环观察 active promise，直到 writer 真正回到 idle；如果 active transaction settling 期间又排入 snapshot，flush 会继续等待。
- writer 会保留最近一次已完成但尚未被 flush 观察到的写入错误；`flushMessages()` 会把它转换为受控失败结果，避免异步 writer 已经 settle 后错误被静默吞掉。
- `flushMessages()` 继续复用既有 repository API，不建立第二套持久化系统；写失败返回受控失败结果，不抛出 raw storage 内容。
- latest-snapshot serialisation 与中间 snapshot coalescing 保持不变，不按 token 或 bubble 重建大快照。

### Message write ownership

App 的统一 `handleSendMessage` 现在以当前 `messagesRef` 构造下一份完整消息快照，并立即调用 `saveMessages(nextMessages)` 后再更新 React state。对应的 state effect 会识别这份同一快照并跳过重复 enqueue；其他 message mutation 仍由原有 effect 持久化。

这样 user message 与 assistant message 都不会依赖一次稍后才运行的 React effect 才开始写入，同时仍由同一个 `messageRepository` 拥有 durable write authority。

### Direct Chat completion boundary

- send-only：`useChatController.handleSendOnly` 在统一发送回调后等待 `onMessagePersistenceComplete`。
- normal send + reply / continue generation：`DirectReplyUseCase` 在 `executeDirectReplyTurn` 返回后、`postReply` side effects 之前执行一次 `durableCompletion`。
- 多 bubble：delivery 仍逐 bubble 展示；durable completion 只在全部已交付 bubbles（或部分交付失败已经返回）后执行一次。
- Provider failure / no response / cancellation：completion boundary 仍执行，因此已进入 runtime 的 user message 可以被 durable flush；不会凭非 durable history 触发 Memory。
- backend success 与 browser-direct fallback success 共享同一个 boundary；没有 fallback-only 分支。

UI 仍可先 optimistic render，Provider 请求不等待 user message 的 IndexedDB transaction。只有 turn 完成边界等待 writer idle，因此不会每个 token/bubble 做 full flush。

## 错误与性能行为

`flushMessages()` 失败时，App/Direct Chat 只记录安全 warning（`quota`/`write` 类别），不伪称 durable success，不改变已显示的 provider/delivery 结果，不污染 runtime state，也不启动无限重试。下一次受控 message mutation 仍可再次 enqueue。

一次 turn 最多在 user/assistant state 变更时 enqueue 最新快照，并在 turn 完成时执行一次 flush；writer 会串行处理 transaction 并合并中间 snapshot。没有新增数据库、state manager、leader election 或 raw storage hack。

本阶段没有加入 `beforeunload` async 依赖。页面在 turn 未完成时被强制终止仍是浏览器固有限制；正常 send-only 或 reply completion 返回前，已有明确的 awaited durable boundary。

## Group / Offline / Backup 边界

- Group Chat 复用 App `messages` state 与 `handleSendMessage`，因此新增的 immediate enqueue 与 duplicate-effect 抑制天然覆盖其消息写入；group scheduler 仍有独立的非 awaitable `onComplete`，未在本阶段扩大为新的 group orchestration，记录为后续 debt。
- Offline story 的独立 story persistence 没有修改，也没有把 offline story storage 与 message flush 强行合并。Inline chat 当前 `isOfflineModeActive=false`；离线故事仍保持原语义。
- system backup 继续调用同一个 `flushMessages()`，未改变 backup sequencing；相关 backup/migration 测试保持通过。

## 测试覆盖

新增：

- `scripts/messagePersistenceDurability.test.ts`
  - awaited IndexedDB flush
  - A→B latest snapshot
  - reload hydration（fresh repository module）
  - exact character/relation/conversation scope
- `scripts/directReplyDurableCompletion.test.ts`
  - multi-bubble single completion
  - provider failure still completes user-message durability boundary
  - partial assistant delivery persists delivered subset
  - storage completion failure does not rewrite main delivery status
- 扩展 `scripts/latestSnapshotWriter.test.ts`，确认 flush 不会早于实际 persist completion。

既有相关 repository、message window、migration、system backup、DirectReply、controller 测试也全部通过。测试使用 mock transport/fake IndexedDB，不消耗真实 Provider，不发送真实 Direct Chat turn。

## 未解决 debt

- R5A 发现的 dedicated inspector hydration timing debt（`loadMessageWindow` 不主动 await `initializeMessages`，inspector readiness 只等待 character hydration）本阶段未修改；R5C 可单独确认是否仍需 readiness barrier。
- group scheduler 的 callback 仍不是可 await 的 turn completion boundary。
- `beforeunload` 不提供可靠 async 保证，因此不作为 durability contract。

## Readiness

当 targeted tests、full tests、lint、build、dependency gate 均通过且工作树 clean 后，本阶段 readiness 为：

`DIRECT_CHAT_PERSISTENCE_FIX_IMPLEMENTED_LOCAL_VALIDATED`

下一阶段仅建议进入 `Stage 4D-11O-R5C — Durable Message Persistence Real Runtime Validation`：最多 1 个真实 Direct Chat turn，等待 completion，reload，验证 user/assistant 消息与 inspector count；通过前不得恢复 accumulation，也不得执行 extraction/window/campaign 操作。
