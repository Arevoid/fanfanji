# Stage 4D-11O-R5A — Direct Chat Durable Message Persistence Investigation

## 结论摘要

本阶段是 investigation-only。没有发送新的聊天消息，没有执行 `extractNow()`，没有修改 Memory Admission、Campaign、Prompt、Provider 或消息业务逻辑。

在上一阶段唯一的 Direct Chat turn 中，用户 bubble 与 assistant reply 均在运行时出现；该 `chat_reply` 逻辑请求有 2 次 provider attempt（backend proxy 网络失败后 browser-direct fallback 成功），但 reload 后隔离 origin 的 `messages-v4` 仍为空，聊天界面也没有消息。静态代码与只读 storage 证据共同证明：消息写入的明确断点是 App 的 React state → `useEffect` → `saveMessages()` → 异步 `createLatestSnapshotWriter` 队列。`saveMessages()` 在 IndexedDB 写入完成前返回成功，Direct Chat 没有等待 `flushMessages()`，页面生命周期也没有消息 flush。当前证据足以将 readiness 定为：

`DIRECT_CHAT_DURABLE_MESSAGE_PERSISTENCE_BUG_IDENTIFIED`

本阶段没有实现修复；建议下一阶段单独处理 `Stage 4D-11O-R5B — Durable Message Persistence Fix`，完成后再做验证，不能直接恢复 R5 accumulation。

## 基线与范围

- refactor 起始/当前调查 HEAD：`c8e5be986d1a2d3f7f0db755cd96b01e5d297483`
- 原仓库稳定 HEAD：`f515f7408cfe19da145f15a8ddffceae06e608d`
- refactor 分支：`refactor/v2-architecture`
- 隔离 origin：`http://127.0.0.2:3000/`
- fixture：既有 Stage 4D-11O dedicated direct fixture；未重新 bootstrap identity、character、relation、conversation，也未创建第二 scope。
- R5A 新消息：0。上一阶段已有且仅有 1 个 synthetic Direct Chat turn，本调查没有重放。
- R5A 新 Provider call：0。只读读取既有 Ledger 与运行状态。
- 当前 fixture 只读状态：`exactScopeHealth=true`、`eligibleMessageCount=0`、`triggerCount=20`、`distanceToTrigger=20`、`archiveMarkerPresent=false`、Memory=0、`lifecycle=ready`。
- Campaign 未变化：approved/closed=2/2、artifacts=2、sessions=2、scopes=1、batches=2、controls=2、suppressions=0、days=2、`stickyFailure=false`、`promotionEligible=false`。

## 运行时与持久化证据

当前 origin 的安全元数据（不包含正文或凭据）如下：

- active provider preset 已配置：`custom-openai-compatible`。
- selected model：`【仿生玫瑰】gemini-2.5-flash`。
- endpoint 已配置，host/path 为 `https://api.ebutterfly.cc/v1`；没有 routing mismatch 证据。
- credential 仅确认 configured，不记录值。
- 当前 `FanfanjiReadingMetadataDB` 的 `metadata["messages-v4"]` 是空数组。
- `FanfanjiMessageEntryDB` 当前不存在；`phone_message_entry_store_enabled` flag 未启用。
- 其他 IndexedDB：`FanfanjiCharacterPhoneDB` 有 1 个 phone，`FanfanjiMemoryProjectionDB` 的 job=0，`FanfanjiOfflineStoryDB` 的 story=0，`StickerAppDB` 仅为既有贴纸元数据。
- 当前 `localStorage` 没有 `phone_messages_v3` 消息副本；Ledger 等非消息键仍存在。
- service worker 已 registered/activated 且是当前 origin 的 controller；只有 update check 的网络 warning，没有 stale bundle、版本错配或旧代码服务证据。

上一阶段既有 Ledger 的安全摘要显示：`chat_reply` 一条逻辑请求、2 次 physical/provider attempts、`fallbackCount=1`，最终 `transport=browser_direct` 成功；另有一条 background `moment_generate` 使用同一 fallback 后成功。Ledger schema 没有 `httpStatus` 字段，因此不能从 Ledger 声称 HTTP status。R5A 本轮没有新增 provider activity。

## Direct Chat message lifecycle map

| 阶段 | 函数 / 文件 | 职责与同步性 | 写入/读取目标 | 失败行为 |
| --- | --- | --- | --- | --- |
| 用户点击发送 | `useChatController.handleSendAndReply` / `src/features/chat/hooks/useChatController.ts` | 事件处理；async。先创建用户消息并调用发送回调，再等待 AI | 不直接写 storage | 空输入走继续生成；finally 释放 scope lock |
| 用户消息创建 | `createChatUserMessage` / `src/features/chat/controllers/chatController.ts` → `createUserTextMessage` | 同步构造 ID、scope、timestamp、作者快照 | 仅返回 `Message` 对象 | 构造本身不做持久化 |
| 用户消息进入应用 | `handleSendMessage` / `src/App.tsx` | 校验 direct relationship/character/conversation scope；同步 `setMessages`，去重 | React `messages` state | scope 不一致时拒绝写入并 warning；不抛 Provider 错误 |
| 用户消息排队持久化 | App 的 `messages` effect → `saveMessages` / `src/App.tsx`、`src/core/storage/repositories/messageRepository.ts` | effect 异步触发；`saveMessages` 立即返回，实际 IndexedDB 写入由 snapshot writer 异步执行 | 当前模式：`readingAssetDb.saveMetadataValue("messages-v4", snapshot)` | enqueue promise 仅以 warning 捕获；调用方看到的同步结果仍是 success |
| Provider 请求 | `executeDirectReplyTurn` → `requestDirectChatTurn`；`src/features/chat/services/directReplyTurnExecutor.ts`、`src/features/chat/controllers/chatGenerationController.ts`、`src/utils/apiHelper.ts` | async；先 backend proxy，失败可 browser-direct fallback | AI Ledger 记录安全 metadata | Provider failure 进入既有 error/retry/fallback 流，不直接控制消息 repository |
| assistant 消息创建 | `createDirectReplyCandidates` / `src/features/chat/services/directChatService.ts` → `createCharacterTextMessage` | 同步将解析出的 bubbles 变成多个 assistant `Message` | 仍是内存对象 | 空/格式无效返回无 candidate；解析失败由 executor 处理 |
| assistant 消息交付 | `deliverDirectReplyCandidates` / `src/features/chat/services/directReplyDeliveryService.ts`，由 `createDirectReplyTurnDelivery` 绑定 | async 顺序循环；每个 bubble 调用 `onSendMessage` | normal direct route 绑定 `onSendMessageRaw`，最终到 App | 已交付的部分通过 `DirectReplyDeliveryError` 保留；不另设 storage path |
| assistant 进入应用 | 同一 `handleSendMessage` / `src/App.tsx` | 与用户消息相同的 scope 校验与 `setMessages` | React `messages` state | scope 不一致时拒绝；成功后触发同一 messages effect |
| reload hydration | App 初始 state + `initializeMessages` / `src/App.tsx`、`messageRepository.ts` | 初始同步读取 fallback；mount 后 async authoritative read | 当前 flag=false 时读取 `FanfanjiReadingMetadataDB.metadata["messages-v4"]`；flag=true 时读 entry DB | IndexedDB 初始化失败时保留 localStorage session fallback |
| inspector / Memory input | `inspectDedicatedEvidenceFixture` / `src/features/archives/dedicatedRelationBootstrapDev.ts` → App 注入的 `readMessages` | async repository query；然后按 exact scope 与 marker 计算 eligible | 当前调用 `loadMessageWindow({characterId, relationId, conversationId, limit:10000})` | query 异常时回退 `messagesRef.current` 的 scope filter；不执行 extraction |

## User message 与 assistant message 分开审计

### User message

1. 创建函数是 `createChatUserMessage()`，底层为 `createUserTextMessage()`。
2. `handleSendOnly` / `handleSendAndReply` 创建后立即调用 `onSendMessage(userMessage)`；App 随即 `setMessages`，因此 runtime UI 立即可见。
3. 创建函数不调用 durable repository；App handler 也不直接调用 repository，只改变全局 App state。
4. 没有 debounce timer，但 repository 内有 latest-snapshot async queue；同一时刻只保留最新 snapshot。
5. 没有 Direct Chat later callback 或 page lifecycle flush；完成持久化依赖后续 `messages` effect 与 IndexedDB writer 自己完成。
6. 因此在 writer 完成前，它可能只存在于 component/App state；reload 可在完成前发生。
7. reload 后由 App 的 `initializeMessages(DEFAULT_MESSAGES)` 读取当前 canonical store；当前 `messages-v4` 为空，所以没有 user record。

### Assistant message

1. 创建函数是 `createDirectReplyCandidates()` → `createCharacterTextMessage()`，每个 bubble 一个 message。
2. `deliverDirectReplyCandidates()` 逐个调用发送回调，最终同样 `setMessages`；UI 可见。
3. 与 user message 相同，不直接调用 durable repository；依赖 App 的 messages effect。
4. 与 user message 相同，只有 latest-snapshot writer 的异步合并，没有 Direct Chat 专属 debounce/flush。
5. 与 user message 相同，没有 later callback 或 unload flush 保证。
6. 因此 assistant bubble 也可能只短暂存在于 App state；上一阶段 reload 后没有留下 durable record。
7. 与 user message 相同，reload 从 `messages-v4`（当前模式）或启用 entry store 时的 entry DB 读取。

## Canonical repository、adapter 与 key

- canonical repository：`src/core/storage/repositories/messageRepository.ts` 的 message repository API（`saveMessages`、`initializeMessages`、`loadMessageWindow`、`flushMessages`）。
- storage adapter：IndexedDB 由 `src/core/storage/readingAssetDb.ts` 的 `ReadingAssetDB.saveMetadataValue/loadMetadataValue` 访问；无 IndexedDB 时才退回 `storageAdapter` 的 localStorage 写入。
- 当前实际 durable target：数据库 `FanfanjiReadingMetadataDB`，object store `metadata`，key `messages-v4`。
- `messages-v4` 在当前 flag=false 架构中仍是 production 的 durable message snapshot source of truth，不是只读 cache；它是完整消息数组快照。
- 当 `phone_message_entry_store_enabled=1` 时，迁移后的 production source 会切换到 `FanfanjiMessageEntryDB`；该 entry store 是未来/已迁移模式，当前 isolated origin 没有启用。
- `phone_messages_v3` 与旧 legacy key 只作为 migration/session fallback；当前 origin 没有这些消息副本。
- reload hydration 确实通过 `initializeMessages` 读取 `messages-v4`（当前模式）；因此这次 `messages-v4=0` 不是 inspector 凭空读错 key 的证据，而是 canonical snapshot 实际为空。

## Inspector source 与 scope key 审计

`inspectDedicatedEvidenceFixture()` 不直接读 raw `messages-v4`，也不直接读 localStorage；它调用 App 注入的 `readMessages(scope)`，再由 `loadMessageWindow()` 访问 message repository。当前 flag=false 时，`loadMessageWindow` 使用 `cachedMessages || loadMessages([]).value` 并过滤 `characterId`、`relationId`、`conversationId`。因此 inspector 使用的是 production repository selector，source 类型正确。

存在一个独立的 dev-tool hydration timing debt：`loadMessageWindow` 的 snapshot fallback 不会主动 await `initializeMessages`，而 inspector bootstrap 等待的是 `charactersRepositoryHydrated`，不是 messages hydration。若 reload 后 durable record 存在，这个顺序仍可能让 inspector 短暂看到空 cache；但本次实际 metadata store 已确认空数组，所以该 race 不是本次零记录的唯一根因。建议 R5B 修复时同时加一个不改变业务语义的 hydration/readiness 约束或测试。

所有实际 scope key 的代码路径一致：

- write handler 将 direct message 的 `conversationId` 规范化为 relationship 的 `conversationId || getConversationId(relation.id)`。
- user/assistant 创建时都携带同一 `runtimeContext` 的 `characterId`、`relationId`、`conversationId`、`userIdentityId`。
- inspector 由 exact scope 传入相同四类字段，再在 `loadMessageWindow` 做三项消息过滤。
- current runtime fingerprints（identity、character、relation、conversation）在 reload 前后稳定；`exactScopeHealth=true`。
- 未发现 `direct:${relationId}`、relation、character、identity 或 conversation serialization mismatch，也未发现 archive marker/未来消息污染。

## Save、flush、fallback 与竞争分析

`saveMessages()` 在 IndexedDB 可用时递增 mutation version、更新 cache，然后调用 `writer.enqueue(cachedMessages)`；它不 await writer，立即返回 `{success:true}`。`createLatestSnapshotWriter` 会串行持久化 pending snapshot，并在写期间只保留最新完整快照。该设计可合并连续 state updates，但不会自动等待页面离开前的最后一个写入。

`flushMessages()` 只在 `src/features/settings/systemBackup.ts` 的 backup 流程中被调用。没有 Direct Chat 的 `pagehide`、`visibilitychange`、`beforeunload` 或 unmount flush。Ledger 自己有 pagehide flush，但那只针对 AI Ledger，不会 flush message writer。

因此最小的、已被 runtime 复现的时序是：

```text
setMessages(user/assistant state)
  → App effect 调用 saveMessages(snapshot)
  → writer.enqueue() 开始异步 IndexedDB transaction
  → saveMessages 已同步返回 success
  → reload/页面生命周期中断 writer
  → messages-v4 仍为空
```

当前没有证据表明旧 snapshot 后写覆盖新 snapshot：writer 的 pending/active 逻辑本意是 latest-snapshot serialisation，且 storage 中是空数组而非旧的非空数组。也没有证据表明 hydration 在已有非空 durable record 后把 runtime state 覆写成空；本次 reload 前已确认 durable target 为空。需要在 R5B 用 isolated repository test 覆盖这两个风险。

Browser-direct fallback 不绕过消息保存：backend failure 与 browser-direct success 都在同一个 `requestDirectChatTurn`/executor 后续 candidate delivery 中，最终调用同一个 normal direct `onSendMessageRaw` → `handleSendMessage`。Provider fallback 可能拉长未 flush 时间窗，但没有 fallback-only save omission 的代码证据；正常 backend success path 也同样依赖 App effect。

`moment_generate` 属于 background proactive pass 的独立 AI activity；它与 AI Ledger 共享 accounting/fallback，但没有证据写入 message repository、覆盖 `messages-v4` 或替换 App messages state。因此本次结论标记为 `BACKGROUND_ACTIVITY_NOT_CAUSAL`，不修改 scheduler。

Service Worker 处于 activated/controller 状态，cache 名称为当前构建的 fingerprinted cache；没有旧 bundle/version mismatch 证据。本阶段没有清 cache，也没有将问题归因于 SW。

## Root cause、影响与边界

已证明的 root cause 是 Direct Chat 的 durable write seam：App-level `messages` effect 触发异步 snapshot writer，但 Direct Chat 没有 await/flush，而页面 reload 可以发生在 IndexedDB transaction 完成前。该 seam 同时影响 user 与 assistant 消息，且不是 browser-direct fallback 专属；normal backend success 也经过相同 effect。当前能明确影响 online direct message persistence；group 也复用 App message repository/effect，理论上共享该风险，但本阶段没有再发送 group 消息作运行证明。offline story 有独立 story persistence，但其在线消息仍可能经过 shared message repository；本阶段不修改 offline 语义。

修复边界应是正常消息 repository/生命周期的 durable completion guarantee，并补 user、assistant、reload、exact scope、fallback-independent、no-stale-overwrite/no-duplicate 的 isolated tests。不得以 fixture 分支、Memory/Admission 改动、Prompt/Provider 改动或额外 chat turn 解决。

## 测试与工作树

本阶段没有新增 instrumentation 或测试，没有修改生产代码。运行的既有相关测试全部通过：

- `scripts/messageEntryRepository.test.ts`
- `scripts/messageWindowQuery.test.ts`
- `scripts/storagePreflight.test.ts`
- `scripts/contentStorageMigration.test.ts`
- `scripts/systemBackup.test.ts`
- `scripts/storageResourceHealth.test.ts`

这些测试证明现有 repository/entry-store/migration/backup 基础行为，但不能证明 App effect 在 reload 前等待 writer；这正是 R5B 的测试缺口。此前当前 HEAD 已验证的全量基线仍为 591/591、lint 通过、build 通过、dependency gate 105 allowlisted edges / 3 cycles；R5A 只改文档，未引入代码变化。

本调查文档本身的单一目的 commit 为：`docs: document direct chat durable message persistence investigation`（commit hash 在提交后回填到阶段报告）。

## Readiness 与下一步

- readiness：`DIRECT_CHAT_DURABLE_MESSAGE_PERSISTENCE_BUG_IDENTIFIED`
- 没有实现修复，因此不能宣称 `DIRECT_CHAT_PERSISTENCE_FIX_IMPLEMENTED_LOCAL_VALIDATED`。
- 下一阶段建议：`Stage 4D-11O-R5B — Durable Message Persistence Fix`；先做 repository/lifecycle 最小修复与 isolated tests，再单独验证真实 reload，最后才重新考虑 R5 accumulation。
- 本阶段停止，不创建 Window/Campaign token，不运行 collector/shadow/canary，不调用 `extractNow()`，不修改 Memory threshold，不重建 fixture。
