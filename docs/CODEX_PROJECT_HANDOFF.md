# 饭饭机项目接手与扩展指南

> 面向新的 Codex 窗口、后续维护者和新增应用开发。
> 结构规则以当前代码和测试为准；最后更新：2026-09-04。当前分支、提交、动态未完成项和本次验收数字以根目录 `HANDOFF.md` 为准。
> 本文描述长期有效的代码结构和必须遵守的边界，不是未来设想。

## 0. 2026-08-31 长期记录：语音通话回复分发与第三方 API 排查边界

### 语音通话消息必须经过通话分发器

语音通话中的角色回复不能直接调用普通聊天的原始持久化回调。`AppChat` 的 `createChatMessageDeliveryHandler` 会根据通话状态把角色内容写入 `callTranscript`，并负责字幕提交与 TTS 队列；`onSendMessageRaw` 只适合普通聊天历史持久化。任何生成回复的异步路径如果复用 `deliverDirectReplyCandidates`，必须根据当前是否为已连接通话选择正确的 delivery handler，并覆盖“通话记录、字幕、TTS、取消/切换关系”回归测试。

### 媒体消息与自动回复必须分开

语音、表情等媒体消息的“显示/持久化”和“是否触发角色回复”是两个独立决策。媒体发送只应在明确允许自动回复时调用生成链；`triggerReply: false` 不能被后续包装层、重试或异步回调重新触发。提示词中应使用受控语义描述，不要把二进制图片、内部标记或未经确认的客户端字段直接拼入模型上下文。

### “角色声称用户发了乱码”不能作为事实

角色生成文本中声称“用户复制了乱码”不等于客户端真的发送过乱码。排查顺序必须是：

1. 查本地实际消息记录和用户气泡，确认是否存在对应用户消息；
2. 查发送前最终 `messages` payload，确认客户端序列化后的用户内容；
3. 查中转站收到的原始请求，确认是否被改写、串线、缓存污染；
4. 查中转站原始响应，再与页面显示文本对照；
5. 最后才判断是模型幻觉、字符集错误或前端渲染问题。

自定义 OpenAI 兼容 API 和 SSE 响应必须特别检查 UTF-8 `Content-Type`、分块边界、`data:` JSON 解码和 `choices[0]` 内容提取。看到 `Ã`、`å`、`�` 等典型替换字符时，优先定位中转站编码；看到自然语言“你发了乱码”但请求中没有乱码时，优先按模型幻觉/上下文污染处理。日志不得记录 API Key、完整敏感历史或原始私密内容。

### 新增功能和修复 bug 的最小安全流程

- 先读取根目录 `HANDOFF.md`、本文和实际 `git status --short`；把用户已有未提交改动与本次任务分离。
- 先画清数据来源、作用域、加载/保存边界和异步副作用，再修改 UI；截图只能作为现象证据，不能代替状态和请求链路分析。
- 业务规则优先放入 `domain/`/`features/` 的纯函数或服务；公共组件只做组合，避免在 `App.tsx`/`AppChat.tsx` 中继续堆积跨场景副作用。
- 每个异步请求都要有 scope、取消策略、过期结果保护和错误归属；切换身份、关系、会话或页面后，旧请求不能写入新上下文。
- 任何消息/身份/关系/记忆/备份改动都要配作用域隔离、旧数据迁移、失败回滚、重复调用幂等和删除边界测试。
- 先运行定向测试，再运行 `npm.cmd run lint`、`npm.cmd run build`；核心跨模块改动再运行 `npm.cmd run check` 或完整测试集。
- 提交前执行 `git diff --check`，检查 staged 文件名、统计和完整 diff；只提交明确属于本次任务的文件，构建生成物和用户旧改动不得混入。
- 全量测试有历史字符串断言失败时要记录具体失败项和与本次改动的关系，不得为了让断言通过而恢复过时实现。
- 未经用户明确要求不推送；推送前确认分支、提交内容、远端状态和工作区边界。

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

`npm run check` 先执行 `npm run install:check`（`npm ci --ignore-scripts --dry-run`），再依次执行 TypeScript 检查、全部脚本测试和生产构建，是提交前的统一验收入口。

测试位于 `scripts/`，由 `scripts/runAllTests.ts` 自动收集。2026-08-20 本地基线为 369 个测试，另有生产 smoke test。新增业务边界时不要只补 UI 测试，至少还要覆盖：

- 两个用户身份之间的数据隔离；
- 同一角色的两个不同关系之间的数据隔离；
- 私密数据不能进入公开场景；
- 旧存储数据的兼容读取；
- 删除、重生成、失败重试和重复调用的幂等性。

### 2.1 2026-08-20 长期运行计划复核

本轮补齐内容存储迁移中断后的显式恢复：用户确认后可接管过期锁，已完成模块跳过重写，未完成模块继续迁移并重新校验，旧副本仍保留。

本轮继续将 AppChat TTS 播放指示状态抽为 `useChatTtsPlaybackState`；不改变播放器、对象 URL、通话语音队列或 TTS 请求逻辑。最新门禁：`npm test` 400/400 通过，lint、build、release、smoke、security 全部通过。

本轮再将 AppChat 跨会话 typing 指示状态抽为 `useChatTypingState`；异步回复仍按 identity/relation/conversation scope 隔离。最新门禁：`npm test` 401/401 通过，lint、build、release、smoke、security 全部通过。

本轮再将 AppChat 位置输入、问候去重、Toast 和备忘录列表等瞬时 UI 状态抽为 `useChatTransientUiState`，不改变持久化或发送逻辑。最新门禁：`npm test` 402/402 通过，lint、build、release、smoke、security 全部通过。

本轮再将 AppChat 手动归档与记忆提炼的进行中状态抽为 `useChatOperationState`，不改变实际操作逻辑。最新门禁：`npm test` 403/403 通过，lint、build、release、smoke、security 全部通过。

本轮新增 Scheduler 长时间运行 soak 回归：模拟至少一天逻辑时间，验证串行执行、无重叠、租约释放和单条有界快照。最新门禁：`npm test` 404/404 通过，lint、build、release、smoke、security 全部通过。

固定迁移数据集现已显式覆盖空数据、超长线下故事、贴纸引用和接近配额 payload，并保留损坏 JSON、重复 ID、悬空引用、图片和语音场景；定向与全量测试均通过。

存储诊断页现已显示最近一次已完成迁移时间和是否存在未完成迁移。历史门禁：`npm test` 405/405 通过，当前门禁见本文最新增量记录。

本轮补充迁移预检恢复安全边界回归：普通预检阻止未完成迁移，显式恢复仅解除该状态阻塞，容量不足仍保持阻止。历史门禁：`npm test` 405/405 通过。

本轮补齐系统备份跨阶段回滚：导入前快照全部已知 IndexedDB 模块（含未启用条目库），后续模块失败时补偿恢复 IndexedDB、LocalStorage 和线下故事，避免半恢复状态。历史门禁：`npm test` 405/405 通过。

本轮修复调度器对象描述变化导致的无意义重建：metadata、recoveryPayload、冷却和拒绝状态改为运行时更新，不再因普通渲染 stop/start 定时器。历史门禁：`npm test` 406/406 通过。

本轮将 AppSettings 的系统备份导入、只读检查、完整/轻量导出和最近备份时间记录抽为 `useSystemBackupActions`，页面入口只保留参数和事件转发；备份格式、跨阶段回滚和 API Key 行为保持不变。历史门禁：`npm test` 406/406 通过。

本轮补充发布清单与存储迁移版本追踪：`dist/release-manifest.json` 记录 `dataSchemaVersion: 0` 和 `migrationScriptVersion: content-entry-storage-v1`，`release:check` 强制校验两者；最新门禁：`npm test` 407/407 通过，lint、build、release、smoke、security 全部通过。

本轮继续收紧数据健康与 IndexedDB 生命周期：健康扫描会纳入聊天/线下条目库中的图片引用，引用扫描不完整时禁止手动孤儿清理；图片、贴纸、音乐和字体数据库在 `versionchange/close` 后会清空缓存连接。最新门禁：`npm test` 407/407、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：聊天主题 JSON 与桌面模块备份的文件传输动作已抽为 `useSettingsTransferActions`，保持原有文件格式、确认提示、刷新和 API 配置行为。最新门禁：`npm test` 407/407、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppOffline`：故事快照更新、串行持久化队列和失败提示已抽为 `useOfflineStoryPersistence`，编辑、生成、记忆同步和退出流程继续复用同一保存边界。最新门禁：`npm test` 407/407、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppChat`：当前会话消息筛选和可见消息投影已抽为 `useChatMessageProjection`，只清理渲染层内部标记，原始消息、发送和持久化路径保持不变。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮补充 schema 兼容安全边界：迁移预检会阻止无法识别或高于当前代码支持范围的数据 schema，存储诊断页显示当前 schema 基线与迁移脚本版本。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮修复 Scheduler 同类型多实例恢复边界：同一 `taskType` 现在可保留多个工厂并按快照逐一匹配，单个实例卸载不会误删其他实例的恢复注册。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：图片 API 预设选择、草稿持久化、模型拉取、连接测试、协议推断和保存动作已抽为 `useSettingsImageApiActions`，保持现有 API 地址、Key 和图片预设格式行为。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：普通文本 API 预设选择、新增、删除、模型拉取和保存动作已抽为 `useSettingsTextApiActions`，保持现有自定义地址、Key、预设格式和保存行为。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：MiniMax/Mossland 语音配置保存动作已抽为 `useSettingsVoiceActions`，保持现有字段归一化、TTS 配置和 Key 行为。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：文本 API 连接测试动作已抽为 `useSettingsApiConnectionActions`，继续调用原有 `apiTestKey`，不新增地址限制、认证或 Key 处理。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：头像、壁纸和应用图标上传/压缩/恢复动作已抽为 `useSettingsAssetActions`，保持原有尺寸、质量、透明度和设置保存边界。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：样式预设保存动作已抽为 `useSettingsPresetActions`，保持原有 `StylePreset` 字段、默认主题色和保存回调。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：样式预设应用动作已抽为 `useSettingsApplyPresetAction`，保持经典预设结构化覆盖、壁纸来源和现有保存字段。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：身份切换动作已抽为 `useSettingsIdentityActions`，保持外部切换回调优先级和本地身份字段持久化行为。最新门禁：`npm test` 408/408、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppOffline`：消息编辑开始、保存和取消动作已抽为 `useOfflineMessageEditorActions`，继续复用故事快照串行持久化边界。最新门禁：`npm test` 409/409、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppOffline`：故事删除、标题和 IF 设定编辑动作已抽为 `useOfflineStoryManagementActions`，保持活动故事快照队列与非活动故事保存分流。最新门禁：`npm test` 410/410、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppOffline`：单条剧情记录删除动作已抽为 `useOfflineMessageActions`，继续复用故事快照持久化边界。最新门禁：`npm test` 411/411、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppOffline`：消息重新生成入口已抽为 `useOfflineRegenerationActions`，继续调用原有强制 AI 重生成流程。最新门禁：`npm test` 412/412、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppOffline`：工作区退出与回线上聊天流程已抽为 `useOfflineWorkspaceExitActions`，保持持久化等待、故事结束、会话清理和导航顺序。最新门禁：`npm test` 413/413、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppSettings`：清除应用数据流程已抽为 `useSettingsClearDataActions`，保持确认、清理失败恢复和重载行为。最新门禁：`npm test` 414/414、lint、build、release、smoke、security 全部通过。

本轮继续完成阶段五的展示层增量化：`MessageList` 新增可选 header/content wrapper，并将线下故事消息列表接入同一套 120 条窗口化渲染与上滑扩展逻辑；线下故事仍以完整消息数组支撑生成、编辑和持久化，只有 DOM 挂载量受限。`workspaceScrollRef` 纳入 `useOfflineStoryRuntimeState`，不改变退出、自动滚动和生成状态行为。最新 `npm run lint` 与 `npm test` 414/414 通过。

本轮新增 `offlineMessageWindow.test.tsx`：使用 10,000 条线下剧情记录验证仅挂载最近 120 条、保留绝对索引和完整数据源；覆盖长期计划中的 1000/5000/10000 条消息验收基线中的 10000 条场景。最新 `npm run lint` 与 `npm test` 415/415 通过。

本轮继续拆分 AppChat：消息单条删除、多选删除、关联图片资产清理、红包状态清理和关系作用域校验已抽为 `useChatMessageCleanupActions`；页面仅负责状态组合与事件转发。新增 Hook 契约测试并迁移既有图片清理/多选删除断言。最新门禁：`npm test` 416/416、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：保留关系记录但清理该关系全部业务数据的动作已抽为 `useChatRelationshipCleanupActions`，覆盖消息/资源、角色事件与事实、主动主题、记忆、心声、日记、红包、论坛私有作者与任务、线下故事、memo ledger、未读和主动消息运行态；删除好友流程仍保留独立的关系删除和群成员处理逻辑。新增关系清理 Hook 契约测试。最新门禁：`npm test` 417/417、lint、build、release、smoke、security 全部通过。

本轮继续拆分 AppChat：删除好友完整流程已抽为 `useChatDeleteFriendAction`，保留孤儿关系恢复、当前身份关系校验、跨域清理、群成员修剪和导航复位。新增删除好友 Hook 契约测试，并迁移角色事实清理断言。最新门禁：`npm test` 418/418、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：朋友圈长按/右键菜单、评论手势、复制、收藏、翻译和删除动作已抽为 `useChatMomentActions`，保留现有 API 翻译、状态持久化和事件回调行为。新增朋友圈动作 Hook 契约测试。最新门禁：`npm test` 419/419、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：群聊成员移除、成员邀请和对应系统旁白消息已抽为 `useChatGroupMemberActions`，保留成员列表更新、角色名称解析、旁白发送和邀请弹窗关闭行为。新增群聊成员动作 Hook 契约测试。最新门禁：`npm test` 420/420、lint、build、release、smoke、security 全部通过。

本轮继续拆分 AppOffline：故事创建动作已抽为 `useOfflineStoryCreationActions`，保留直聊/群聊校验、关系与身份作用域、聊天上下文导入、知识/世界书快照、离线存储标记和创建表单复位。新增故事创建 Hook 契约测试。最新门禁：`npm test` 421/421、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppOffline：记忆同步动作已抽为 `useOfflineStoryMemorySyncActions`，保留自动/手动同步意图、线下事实策略、多人关系分发、知识事实写入、摘要安全回退、持久化失败状态和完成事件记录；同步相关静态契约测试已迁移到新 Hook。最新门禁：`npm test` 422/422、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppOffline：剧情发送、线下提示词组装、线上上下文隔离、AI 生成、重生成和故事快照写入已原样搬迁到 `useOfflineStoryGenerationActions`，页面只负责依赖组合；相关静态契约测试已迁移到新 Hook，未改变原有提示词和持久化逻辑。最新门禁：`npm test` 422/422、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：从消息/预约进入线下故事的关系校验、预约状态迁移、群聊成员记忆快照、线上上下文导入、故事创建和导航动作已原样搬迁到 `useChatStartOfflineFromMessage`；相关预约/主动线下契约测试已迁移到新 Hook。最新门禁：`npm test` 422/422、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：消息翻译请求、翻译结果回写、空结果和失败提示已原样搬迁到 `useChatMessageTranslation`，保持现有 API 地址、Key、模型和消息作用域行为。新增翻译 Hook 契约测试。最新门禁：`npm test` 423/423、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：聊天背景草稿图片选择、压缩和草稿状态写入已搬迁到 `useChatBackgroundDraftUpload`，保持原有 `1000×1000`、`0.7` 压缩参数和失败处理。新增背景草稿上传 Hook 契约测试。最新门禁：`npm test` 424/424、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：设置保存、关系会话更新、主动线下偏好写入和设置项自动翻译已原样搬迁到 `useChatSaveSettings`，保持原有自定义 API、Key、关系作用域、弹窗关闭和保存失败处理；新增设置保存 Hook 契约测试并迁移主动线下偏好静态断言。最新门禁：`npm test` 425/425、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：记忆提炼动作已原样搬迁到 `useChatMemoryExtraction`，保留关系作用域、Truth claims 先写入、会话摘要、兼容 Memory 合并、API 失败返回值和压缩状态清理；新增 Hook 契约测试并迁移 Truth Layer 静态断言。最新门禁：`npm test` 426/426、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 AppChat：聊天图标草稿更新动作已搬迁到 `useChatDraftChatIcon`，保持 URL trim、空值删除和原有草稿状态写入行为。新增 Hook 契约测试。最新门禁：`npm test` 427/427、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮补齐阶段九的 API 调用量治理：新增 90 天有界的 `apiUsageMetrics`，只记录聊天、翻译、记忆提取和人设总结的请求次数、成功/失败及输入输出字符量，不保存 API Key 或请求正文；统一 API 包装器负责记录，存储诊断卡展示汇总。新增指标回归测试。最新门禁：`npm test` 428/428、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮补齐 Scheduler 注册缺口：`AppForum` 现在接入 `useForumActivityEngine`，论坛体故事推进新增 `useForumStoryScheduler` 并注册 `forum-story-progression` 任务；两者均暂停于隐藏/离线状态并携带受限恢复描述。新增运行时接入契约测试。同时新增 `.github/workflows/quality.yml`，在 push、PR 和手动触发时执行可重复安装与完整 `npm run check`。最新门禁：`npm test` 430/430、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppOffline`：离开前自动同步、线上交接、预约完成状态更新和故事持久化已原样搬迁到 `useOfflineStoryExitFinalization`，退出/回线上流程继续复用同一最终化边界；迁移了相关自动归档、线上召回和预约入口静态契约。最新门禁：`npm test` 431/431、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppForum`：论坛体故事手动推进动作已搬迁到 `useForumStoryUpdateAction`，保留点赞后结局判定、故事更新后的评论生成、提示语和错误/进行中状态。新增动作 Hook 契约测试。最新门禁：`npm test` 432/432、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppChat`：回复重生成的完整提示词组装、关系/Truth/线下交接上下文、错误处理和消息发送已机械等价搬迁到 `useChatRegenerationAction`；send 与 regeneration 的静态提示词、序列化、跨日历史和线下交接契约已迁移到页面+Hook 联合校验。最新门禁：`npm test` 433/433、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppForum`：论坛体故事读者评论提交、评论事件记录、分享、故事/评论删除和翻译提示动作已搬迁到 `useForumStoryReaderActions`，保留故事作用域、确认框、提示、后台评论生成与刷新顺序。新增动作 Hook 契约测试。最新门禁：`npm test` 434/434、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppSettings`：全局字体文件导入、字体 URL 校验、字体数据库回滚/清理和恢复默认动作已搬迁到 `useSettingsGlobalFontActions`，保持字体格式限制、25MB 限制、保存失败回滚与对象 URL 释放。新增动作 Hook 契约测试。最新门禁：`npm test` 435/435、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppForum`：论坛 NPC 角色卡的保存、编辑、选择、JSON 导入/导出和身份作用域处理已搬迁到 `useForumCommunityNpcActions`，保留字段截断、无效卡拒绝、导出对象 URL 释放和原有提示。新增动作 Hook 契约测试。最新门禁：`npm test` 436/436、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮补强阶段九持续治理：质量工作流新增每日定时触发，持续执行可重复安装、迁移/备份回归、调度长时间 soak、构建、smoke 与生产依赖审计；新增 cron 配置契约测试。最新门禁：`npm test` 436/436、lint、release、smoke、security 全部通过，构建门禁此前已通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮补齐浏览器端错误监控：新增 `runtimeErrorMetrics` 与 `useRuntimeErrorMonitoring`，应用根监听 `error`/`unhandledrejection` 并在 30 天、40 类桶上限内记录来源、错误类型、次数和时间；不保存错误消息、堆栈、请求正文或凭据。存储诊断卡展示近 30 天汇总，新增指标与监听器清理契约测试。最新门禁：`npm test` 438/438、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮补充普通聊天性能验收：新增 1,000 与 5,000 条聊天记录窗口测试，确认 `MessageList` 仅挂载最近 120 条、保留绝对索引和完整消息数据源；线下故事 10,000 条窗口测试继续保留。最新门禁：`npm test` 439/439、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮完成一次本地生产构建浏览器验收：通过 `npm start` 加载生产构建，实际打开设置/系统备份/存储诊断页面，确认应用版本、schema、备份版本、健康扫描、API 调用统计和运行时错误统计均可显示；生产页面加载成功，未产生新的浏览器错误日志。该结果仅代表本机生产构建验收，不代表 Android/iOS 或 staging 验收。

本轮继续拆分 `AppForum`：论坛资料保存、头像类型校验/压缩、图片资源写入和身份作用域处理已搬迁到 `useForumProfileActions`，保持字段截断、资源 ID、错误提示和原有保存边界。新增动作 Hook 契约测试。最新门禁：`npm test` 440/440、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮继续拆分 `AppChat`：语音消息格式归一化、通话字幕隔离、通话 TTS 排队入口、单聊作用域校验和群聊会话标记已搬迁到 `chatMessageDelivery` 服务；保留通话语音完成后再推进下一条的 Promise 语义，不改变 API 地址、Key 或备份行为。新增投递服务契约测试，并迁移 TTS 静态契约到新边界。最新门禁：`npm test` 441/441、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮完成 CSP 强制执行：首屏主题初始化从 `index.html` 内联脚本搬迁到同源 `public/firstPaintTheme.js`，静态入口、Express、Cloudflare Worker API 与静态资源响应统一发送 `Content-Security-Policy`；保留 `connect-src 'self' https:` 以不改变用户自定义 API 地址支持。新增强制 CSP、首屏脚本和 Worker 静态响应契约测试。最新门禁：`npm test` 441/441、lint、build、release、smoke、security 全部通过；安全审计为 0 vulnerabilities。

本轮继续增强 Scheduler 多标签运行边界：运行中的任务按租约周期续期，续期失败进入可恢复失败态；同源标签通过 advisory `BroadcastChannel` 快速广播租约取得/释放，localStorage 仍作为最终仲裁边界，不宣称替代真实多标签验收或跨部署 Durable Objects。新增续期与协议契约测试。最新门禁：`npm test` 442/442、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮补充 staging readiness 工作流：仅允许手动触发，使用 GitHub `staging` environment，执行 `npm ci` 与完整 `npm run check`，并保留 14 天的 release manifest、静态入口和服务端制品证据；工作流不自动部署，因此不把仓库门禁冒充真实 staging 发布。新增工作流契约测试。最新门禁：`npm test` 447/447、lint、build、release、smoke、security 全部通过。

本轮继续拆分 `AppChat`：通话 TTS 播放队列、移动端音频解锁、对象 URL 回收、取消代际、字幕同步和串行等待已搬迁到 `useChatCallSpeechPlayback`；页面仅组合控制状态和生命周期动作，保留通话完成后再推进下一条的 Promise 语义。新增 Hook 契约测试并迁移 TTS 播放静态契约。最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过；构建仍仅有 AppChat/vendor-docx 大 chunk 警告。

本轮清理 `AppChat` 中已由 `MomentsApp` 接管、且永远不会执行的旧朋友圈渲染分支，删除约 360 行死代码，不改变当前朋友圈入口或事件处理路径；组件源码从 9,682 行降至 9,321 行。最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过。

本轮继续清理 `AppChat` 中已被统一 `getWorldBookLocationReferences` 替代的旧位置提取算法块注释，删除约 89 行不可执行遗留代码；位置候选仍由领域服务统一生成，现有世界书位置契约测试继续覆盖过滤、去重和数量上限。组件源码进一步降至 9,232 行。

本轮将 `AppSettings` 的身份作用域设置保存逻辑抽为 `useSettingsScopedSave`，保留活动身份回退、资料字段同步和统一保存入口；新增 Hook 契约测试。最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过；构建仍仅提示 AppChat/vendor-docx 大 chunk。

本轮继续拆分 `AppChat` 群聊生成：将消息去重、时间排序、上下文窗口截取、成员显示名格式化和世界书扫描文本构建迁移到 `buildGroupChatHistoryContext`，保留自定义历史与当前用户消息的扫描语义；新增群聊服务契约覆盖。最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过。

本轮进一步将群聊成员级世界书、私有记忆、`at_depth` 注入和公开成员定义组装迁移到 `buildGroupMemberPromptContexts`；继续保持群级与成员级注入合并规则，以及私有上下文只进入对应成员请求的边界。最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过；构建仍仅提示 AppChat/vendor-docx 大 chunk。

本轮再将群聊路由成员选择、成员逐个生成、同轮公开历史追加和中止传播迁移到 `generateIsolatedGroupChatReplies`；页面继续负责打字动画、延迟消息投递和群聊记忆持久化。更新群聊提示静态契约以验证服务边界。组件源码进一步降至 9,130 行；最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过。

本轮将群聊回复的 500ms 缓冲、1500ms 打字模拟、成员间 400ms 间隔、取消清理和完成回调迁移到 `scheduleGroupReplyDelivery`，页面仅提供状态、发送和记忆保存回调；新增顺序投递与时间契约测试。组件源码进一步降至 9,075 行；最新门禁：`npm test` 445/445、lint、build、release、smoke、security 全部通过。

本轮将 `AppSettings` 聊天功能图标的 trim、空值删除和即时持久化动作抽为 `useSettingsChatIconActions`，页面保留字段渲染；新增 Hook 契约测试。`AppSettings.tsx` 降至 2,987 行。最新门禁：`npm test` 447/447、lint、build、release、smoke、security 全部通过。

本轮将全局聊天 CSS 模板复制的剪贴板 API、textarea 回退、复制状态反馈和失败提示抽为 `useSettingsCssTemplateCopy`；新增 Hook 契约测试。`AppSettings.tsx` 降至 2,974 行。最新门禁：`npm test` 447/447、lint、build、release、smoke、security 全部通过。

本轮将设置页预览气泡的颜色、圆角、边框和液态玻璃样式计算抽为纯函数 `getSettingsPreviewBubbleStyle`，新增普通边框与液态玻璃契约测试；`AppSettings.tsx` 降至 2,966 行。最新门禁：`npm test` 448/448、lint、build、release、smoke、security 全部通过。

本轮继续收紧组件边界：将系统备份数据清洗逻辑迁移到 `src/features/settings/systemBackupSanitizer.ts`，将主动联系时间窗计算迁移到 `src/features/chat/services/proactiveScheduleService.ts`，并将首次开场白 effect 迁移到 `useChatGreeting`；新增备份隐私、主动联系日间/跨夜和开场白清理边界测试。`AppSettings.tsx` 降至 2,825 行，`AppChat.tsx` 降至 9,007 行。最新统一门禁：`npm run check` 全部通过，`npm test` 450/450。

本轮补齐普通聊天 10,000 条消息窗口验收；`MessageList` 在 1,000、5,000 和 10,000 条消息场景均只挂载 120 条可见窗口，同时保留完整数据源与末尾定位。新增场景契约后，lint 与窗口测试通过。

已在当前工作区实现并通过本地验证：统一存储边界契约、存储诊断与用户确认清理、备份恢复回滚错误、备份只读检查与原始文件导出、迁移前备份下载确认、消息窗口查询、固定迁移数据集（3 身份、直聊/群聊、1000 条消息、媒体引用、重复/悬空引用和损坏备份）、调度元数据快照与隐藏/离线暂停、`pagehide/pageshow` 生命周期恢复、调度原因/任务类型/冷却/拒绝状态记录、任务类型注册表和 React hook 自动注册/恢复、逻辑时钟防回拨、租约写后确认与续期、advisory BroadcastChannel 标签协调、受限非敏感恢复描述、论坛活动统一调度、论坛体故事推进调度、跨标签短租约、可恢复任务状态筛选、刷新恢复与取消不复活测试、聊天预约 Hook、聊天已发起/未读状态 Hook、通话计时/超时/滚动 Hook、通话 TTS 播放 Hook、支付/红包状态 Hook、聊天个人资料与 Me 页状态 Hook、聊天贴纸选择器状态 Hook、聊天导航/朋友圈筛选状态 Hook、聊天设置面板状态 Hook、群聊历史上下文服务、群聊成员提示上下文服务、群聊路由与成员生成服务、群聊回复投递服务、统一安全优先 ID 生成、发布版本清单与回滚不变量检查、存储健康/迁移 Hook、API 调用量与字符量统计、浏览器运行时错误类型监控、普通聊天 1,000/5,000/10,000 条消息窗口验收、线下工作区导航组件拆分、线下剧本设置 hook 拆分、线下故事创建/编辑表单 Hook、AppOffline 阅读偏好与瞬时控制 Hook、AppOffline 故事编辑器运行时状态 Hook、AppOffline Toast 生命周期 Hook、`useOfflineWorkspaceScope` 关系/故事恢复 Hook、AppChat 群聊创建与待欢迎消息 Hook、AppSettings PWA 安装/独立运行 Hook、AppSettings API/图片预设状态 Hook、AppSettings 外观草稿状态 Hook、AppSettings 语音配置状态 Hook、AppSettings 导航状态 Hook、AppSettings 身份资料草稿 Hook、AppSettings 样式/字体草稿状态 Hook、AppSettings 瞬时测试/预设 UI 状态 Hook、AppOffline 消息编辑状态 Hook、AppSettings 聊天图标状态 Hook、AppSettings 备份 UI 状态 Hook、AppChat 消息交互 UI 状态 Hook、AppChat 朋友圈交互与持久化状态 Hook、AppChat 语音播放/转写标记状态 Hook、AppChat 通话 TTS 播放 Hook、AppChat 旧朋友圈死代码清理、AppSettings 身份作用域保存 Hook、AppSettings 聊天图标动作 Hook、AppSettings CSS 模板复制 Hook、AppSettings 预览样式纯函数、Service Worker 指纹缓存、服务端健康探针/请求关联、系统备份面板与心声 Hook/弹窗接入、离线退出最终化 Hook、论坛故事读者动作 Hook、全局字体动作 Hook、论坛 NPC 动作 Hook、论坛资料动作 Hook、AppChat 消息投递服务、staging readiness 门禁、CI 每日定时质量门禁。另补充了安全治理契约：API Key 不进入日志/聚合指标，备份导入路径不执行字符串代码，恶意 JSON 不得污染 `Object.prototype`，未知本地键在恢复前被过滤；实际 API 地址支持范围和备份 API Key 行为均未改变。`npm run lint`、`npm test`（461/461）、`npm run build`、`npm run release:check`、`npm run smoke:check` 和 `npm run security:check` 均通过；生产依赖 high/critical 审计为 0 vulnerabilities。构建仍提示 AppChat/vendor-docx 等大 chunk，这是性能警告，不是失败。发布构建现在额外生成 `dist/release-manifest.json`，记录应用版本、备份版本、SW 缓存、提交标识和回滚不变量。跨标签租约仍是 localStorage 的 best-effort 协调，完整真实多标签/刷新/关闭页面验收仍待进行。

以下仍不能视为完成：真实设备迁移验收、弱网/长时间运行矩阵、staging/灰度发布、跨部署 durable scheduler 和真实多标签/刷新/关闭页面验收、大型页面的进一步拆分余项、更广泛安全审计，以及用户明确暂缓的 API 安全策略和备份 API Key 行为。仓库内已补齐强制 CSP、生产依赖审计、受限恢复描述、逻辑时钟防回拨和 best-effort 租约确认。

最新增量已将备份清洗、主动联系时间窗、开场白副作用、Token 估算、主动消息 catch-up/冷却/随机触发策略、自定义 CSS DOM 注入、CSS 模板复制、通话字幕消息创建、图片生成结果交付/关系切换清理、朋友圈照片分析、通话结束记录/拒绝策略、直聊历史上下文构造、自动语音气泡资格适配、群聊上下文/多成员生成编排、朋友圈关系认知上下文构造、线下 handoff 时间线构造、朋友圈自动动态生成编排、自动评论生成编排、自动回复生成编排、图片生成身份/关系上下文解析以及直聊逐气泡投递/通话语音同步/取消保护移出页面组件；又将设置页气泡预览背景色/透明度计算迁移到 `settingsPreviewStyle.ts`、存储孤儿资源/迁移副本的确认与清理迁移到 `useStorageCleanupActions.ts`、离线故事首次 Act 自动启动迁移到 `useOfflineStoryAutoStart.ts`、线下故事记忆修复判定迁移到 `offlineStoryMemoryRepairPolicy.ts`、错过的线下回线上 handoff 恢复迁移到 `offlineHandoffRecoveryService.ts`；当前以最新记录为准：`AppChat.tsx` 8,440 行、`AppSettings.tsx` 2,788 行、`AppOffline.tsx` 1,338 行，`npm run check`（含 468/468 测试）通过。大型页面仍有进一步拆分余项，但已不再包含本轮已迁出的二十六个边界。

本轮新增 `docs/LONG_TERM_OPTIMIZATION_ACCEPTANCE.md`，按长期计划九阶段逐项记录仓库内完成证据、外部验收缺口和明确暂缓的 API/备份行为，避免将本地门禁误表述为真实设备或 staging 验收。

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

### 10.4 桌面小组件视觉与删除按钮规范

所有桌面小组件的编辑态删除按钮必须保持统一样式：红色圆形背景、白色 `×`、`h-5 w-5`、`z-30`，并使用 `absolute -right-1.5 -top-1.5` 放在小组件右上角外侧。不要把新小组件的按钮改成卡片内部定位、黑色减号或其他尺寸。

小组件最外层容器必须允许删除按钮溢出显示，不能在按钮所在层使用 `overflow-hidden`；如果正文、图片或网格需要裁剪，应在内部另加裁剪容器，不能裁剪最外层的统一删除按钮。按钮必须保留 `data-home-delete`、阻止 pointer/click 冒泡并调用 `onRemove`，以免触发桌面拖拽或打开小组件。

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

## 14. 影视应用规范（阶段一至四）

影视是可选安装应用，不能加入默认桌面或默认安装列表。用户必须在应用商店主动安装后，应用才进入桌面；卸载时不得删除其他应用或关系数据。观影房间页面采用“顶部房间信息 + 固定 16:9 视频窗口 + 连续讨论流 + 底部输入区”的结构。

影视内容仅允许本地视频文件。当前版本暂不支持 Bilibili URL。视频、字幕和截图使用独立 IndexedDB 保存，字幕只接受 `.srt` 与 `.vtt`。应用启动或小组件刷新相关代码不得假设主应用已经打开后才初始化 IndexedDB。

观影讨论必须在同一观影页面内完成，并且始终按 `userIdentityId + relationId + characterId + conversationId` 隔离。角色只能看到当前媒体、当前播放位置、已播放进度、当前字幕或用户明确附加的画面，不得读取其他关系的观影记录。邀请角色弹层必须使用独立的 `min-height: 0 + overflow-y: auto` 滚动容器，不能让长列表被页面裁切。

播放过程中的角色主动发言必须低频、可关闭、按播放进度去重，不得在每次 `timeupdate` 或页面重渲染时请求。用户手动讨论和一次主动反应尽量各只发起一轮 API 请求，避免重复扣费。

字幕和画面理解只用于当前观影讨论，默认不得写入长期记忆。没有字幕时，手动讨论和低频主动反应应自动截取当前视频帧并走视觉输入；若当前 API/模型不支持视觉，必须显示可读的错误提示，而不是出现白色不可读弹窗。只有用户点击“保存为观影记忆”后，才允许通过关系作用域的手动知识/记忆写入当前关系；自动反应、截图、字幕和普通讨论都不能自动成为长期事实。

本地视频二进制默认留在本机 IndexedDB，不应无提示塞入常规 JSON 备份；备份至少保留影视元数据、观影房间和讨论记录，并明确提示用户重新导入本地视频。清除应用数据时必须同时清除影视元数据和影视二进制资产。

影视接入清单：`App.tsx` 懒加载与图标、`AppStore.tsx` 商店卡片、`AppSettings.tsx` 自定义图标/桌面配置、独立 storage key/repository/IndexedDB、清除数据、备份恢复、关系隔离、字幕解析、低频主动反应、手动记忆确认，以及 Node/Cloudflare/浏览器三条 API 链路的画面参数一致性。

### 第三方 OpenAI 兼容 API 排查结论（2026-08-21）

- 自定义文本 API 会把填写的 `/v1` 地址规范化为 `/v1/chat/completions`，并通过同源 `/api/chat` 代理；只有同源路由确实不存在时才允许浏览器直连，真实供应商 HTTP 错误不得重试第二次。
- “连接测试”只发送很短的 `hi` 请求、少量输出限制；测试成功只证明该 Key/端点能完成这个最小请求，不等于正式聊天使用的模型、长历史、系统提示词或视觉输入都已获授权。
- `403` 并且返回 `You do not have a valid license of this product (#3501)` 应判定为供应商的产品/模型授权或渠道许可问题，不应泛化为余额不足。
- `503` 并且返回 `No available channel for model ... under group ...` 应判定为供应商没有该模型的可用渠道，必须核对供应商 `/v1/models` 返回的真实模型 ID；余额正常不代表模型线路可用。
- 后续若优化 API 设置或错误提示，应在测试结果中明确展示“实际端点 + 实际模型 + 请求类型”，区分 Key/余额、模型授权、渠道不可用、请求格式和视觉能力不支持，避免只显示“请检查 API Key”。

## 15. 哪些代码可以动，哪些必须谨慎

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

## 16. 新 Codex 窗口推荐开场提示

可以把下面这段和根目录 `HANDOFF.md`、本文路径一起发给新窗口：

```text
请先完整阅读 HANDOFF.md 和 docs/CODEX_PROJECT_HANDOFF.md，再检查当前 git 分支和工作区。
开发时必须保持 userIdentityId + relationId + characterId + conversationId 隔离，
角色卡和角色专属世界书高于所有通用活人感/情绪/对话策略提示，
公开应用不得读取私聊 Memory，生成内容不得未经确认写为事实。
新增应用时同时检查 App.tsx 懒加载/图标/桌面渲染、AppStore 商店卡片、
AppSettings 自定义图标、存储仓储/迁移/备份/清理、新旧用户桌面保护和测试。
不要修改无关代码；完成后运行 npm run check。
```

## 17. 推荐阅读顺序

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

## 18. 长期运行与架构优化验收（合并版）

本节是原 `LONG_TERM_OPTIMIZATION_ACCEPTANCE.md` 的唯一维护版本。它记录长期优化九个阶段的仓库内结论、证据边界和暂缓范围；具体实现规则仍以本文前面的架构、隔离、存储和应用章节为准。

更新时间：2026-08-20。当前分支和提交以 Git 实际状态为准，不要把本文中的历史提交号当成当前 HEAD。

### 18.1 阶段状态

| 阶段 | 当前结论 | 仓库内证据 | 仍缺的证据 |
| --- | --- | --- | --- |
| 一、安全基线和数据保护 | 已完成仓库内实现 | 存储健康、快照/恢复、迁移日志、错误与请求关联、固定迁移数据集、`npm run check` | 真实设备故障恢复演练 |
| 二、运行环境一致性 | 已完成仓库内契约 | Express/Worker/前端运行时契约测试、健康探针、CSP、smoke test | staging 真实部署后的同请求对照 |
| 三、统一存储层和迁移框架 | 已完成仓库内实现 | IndexedDB 仓储边界、schema 版本、预检、锁、检查点、回滚和中断恢复 | 多浏览器真实迁移和配额压力 |
| 四、重复加载/保存/竞态治理 | 已完成仓库内实现 | latest snapshot writer、消息增量写入、关系/身份作用域、取消与旧结果保护 | 真实刷新、关闭页面、断电恢复 |
| 五、消息/线下故事/资源增量化 | 已完成主要仓库实现 | 消息窗口、1000/5000/10000 条窗口验收、线下故事写入队列、资源健康扫描、分块备份 | 移动设备滚动、低内存和真实大数据量性能 |
| 六、统一后台 Scheduler | 已完成仓库内实现 | 任务注册表、状态/租约/时钟、生命周期恢复、跨标签 best-effort 协调、长运行 soak 测试 | 跨部署 durable scheduler、真实多标签长期运行 |
| 七、备份恢复和数据健康 | 已完成仓库内实现 | checksum、导入前快照、模块校验、失败回滚、只读检查、原始导出、孤儿资源检查 | 真实设备备份迁移；API Key 脱敏/加密按原计划暂缓 |
| 八、核心组件拆分 | 已完成主要仓库边界 | AppChat/AppSettings/AppOffline 的状态、服务、Hook、控制器拆分 | 可继续优化的非阻塞 UI 拆分 |
| 九、可靠发布/监控/自动化测试 | 仓库内完成，外部部分待验收 | CI、staging readiness、release manifest、Service Worker 指纹、健康探针、运行时错误/API 指标、质量门禁 | staging 实际部署、灰度、Android/iOS/PWA/弱网/长运行矩阵 |

### 18.2 最近一次统一质量门禁

以下是历史验收清单记录（2026-08-20），不能代替当前修改后的验证：

- `npm ci --ignore-scripts --dry-run` 通过；
- TypeScript lint 通过；
- `npm test`：468/468 通过；
- production build、release check、smoke check 通过；
- 生产依赖 high/critical audit：0 vulnerabilities。

每次代码修改都应重新运行与风险匹配的检查；提交前优先运行 `npm run check`。构建中出现 AppChat、`vendor-docx` 等大 chunk 属于性能提示，不等于质量门禁失败。

### 18.3 本阶段明确不扩大的范围

- 不改变当前 API 地址支持范围、认证方式或请求路径；
- 不新增 API 限流、域名白名单、内网地址拦截或强制认证；
- 不改变备份 API Key 当前明文/脱敏/加密行为，不引入密码备份流程；
- 不自动删除旧数据、迁移副本、失败快照、任务记录或孤儿资源，清理必须由用户确认；
- 不把仓库内测试通过描述成真实设备、staging、弱网或跨部署验收通过。

### 18.4 长期优化收尾条件

只有在代码门禁持续通过、本文与实际代码一致、API/备份暂缓边界未被改动时，仓库内目标才可视为完成。真实设备、staging、弱网和跨部署项目必须在对应环境完成后，才能把阶段表中的“待外部验收”改为完成。

### 18.5 新会话的双文档入口

新会话先完整阅读根目录 `HANDOFF.md` 获取当前任务和动态状态，再完整阅读本文获取长期规则；不再把 `LONG_TERM_OPTIMIZATION_ACCEPTANCE.md` 作为第三份必读规则文档。若旧链接仍指向该文件，它现在只是兼容入口；本文与代码不一致时，以当前代码和测试为准，并在同一提交中更新本文。

## 19. 2026-08-24—2026-09-04 会话增量：旧版备份聊天记录恢复与角色手机状态

本次会话新增根目录 `HANDOFF.md`，用于记录会话级未完成状态、工作区边界和下一步计划。新会话应先读 `HANDOFF.md`，再读本文。

### 19.1 旧版备份聊天记录

已确认旧版扁平备份 `饭饭机_20260811.json` 中存在 `phone_messages_v3`，共 986 条消息；问题不是备份没有聊天记录，而是旧导入路径只恢复到 LocalStorage，而当前消息初始化使用 IndexedDB 的 `message-entry-v1` durable store。

`src/features/settings/systemBackup.ts` 已将旧键映射为 `phone_messages_v3 -> message-entry-v1`，复用现有 IndexedDB 恢复和启用逻辑。相关测试已加入 `scripts/systemBackup.test.ts`。修复提交为 `8860f1a fix: restore legacy chat messages from backups`，已推送到 `staging/long-term-optimization-2026-08-20`。用户需要重新导入旧备份才能触发恢复。

### 19.2 角色手机当前状态

角色手机已从实验性工作区进入可用实现。它按 `ownerIdentityId + characterId` 独立保存，每个角色的聊天、联系人、朋友圈、浏览记录、日记、备忘录、日程、相册和音乐状态不得串线。进入角色手机时只做本地上下文同步；解锁只负责解锁，不调用生成 API。用户点击桌面右上角的纯图标后，才允许根据角色卡、人设、相关世界书、最近上下文和已有手机记录生成/追加少量内容。桌面会汇总最近生活轨迹并跳转到对应应用；相机支持本地真实图片导入/移动端拍摄入口，图片只落本机相册，不上传生成 API。具体实现、当前分支和实机验收记录见根目录 `HANDOFF.md`。

角色手机内容生成必须保持以下边界：联系人只能来自用户、已有角色关系或有明确上下文依据的 NPC；NPC 对话写入独立联系人线程，不能塞进角色与用户的聊天镜像；角色朋友圈只包含角色本人、用户和角色认识的联系人可见动态；用户不认识角色的好友不得被展示；文件名、世界书标题和字段名不能被当作角色姓名或正文；没有足够依据时保持空，不使用模板填充。

关系网补充边界：身份作用域关系图中与当前角色直接连线的轻量 NPC 会投影为角色手机联系人，使用关系边标签作为备注，并通过 `relationshipNetworkNpcId` 关联到已提升的完整角色；其聊天始终是独立线程。只有主手机已有且属于同一身份作用域、能由该 NPC 或提升角色关联的 Moment 才会投影到角色朋友圈，没有对应动态时不凭空制造朋友圈记录。

### 19.3 本次角色手机修复的验证边界

本次角色手机内容生成修复已通过定向测试、`npm.cmd run lint`、`npm.cmd run build` 和 `git diff --check`；全量 `npm.cmd test` 当前为 506/509，失败项为既有的 `scripts/chatLongTermRecallBudget.test.ts`、`scripts/cinemaApp.test.ts` 和 `scripts/memoryCrossAppScope.test.ts` 静态契约，与角色手机改动无关。右侧浏览器使用用户明确提供的 API 配置完成真实生成验收，并逐页检查锁屏、桌面、最近生活轨迹、聊天、联系人、朋友圈、浏览器、日程、相册、相机、日记、备忘录、音乐、通话和设置。生成后确认了生活痕迹持久化、应用间跳转、重复生成可恢复、证据不足的应用保持空状态；相机本地图片入口不上传生成 API；响应体和 UI 生成均有超时兜底。该验收仍不等于真实移动设备、staging 或弱网验收，且日志不记录 API Key 或完整私密请求。

### 19.4 用户反馈：聊天镜像与相册交互修复

- 角色手机用户线程改为当前主聊天的严格镜像。移除了主聊天为空时保留旧手机本地线程的 fallback；只有带 `sourceMessageId` 的主链消息才会进入角色手机，因此不会继续显示没有用户手机对应记录的残留聊天。
- 相册详情页移除没有行为的分享、下载和右上角更多菜单；隐藏/取消隐藏会切换图标、颜色并更新 `aria-pressed`，让状态变化可见且可访问。
- 相册详情页不再提供“生成文字图”按钮。文字图只由桌面右上角的角色手机内容生成流程创建：优先参考主手机聊天/朋友圈里的文字图描述，在角色相册中保存本地 SVG 文字图和原始描述，不调用真实图片 API。
- 浏览器历史记录点击标题会进入搜索详情二级页，页面顶端直接显示返回按钮和搜索框，不再显示应用导航栏或分类标签；旧记录无需迁移即可查看。
- 浏览器搜索详情现在采用移动搜索结果式布局：由 `searchResults` 生成 2—3 个不同平台的 AI 来源/标题/摘要卡片，并附带头像心声气泡；移除简易答案、外部来源入口、“查看原始页面”和“把搜索词带回地址栏”等交互。
- 角色手机生成协议新增 `searchReflection` 字段和专门提示约束：心声必须是贴合当前搜索动机的第一人称短反应，写出即时用途与未解决处，允许不完整和口语化，不得生成百科说明或统一模板；旧记录回退文案同步口语化。
- 角色手机各应用移除生成条目下方的“同一生活事件”证据标签；日程页移除“暂无角色日程/没有明确的课程……”空状态提示，不把内部证据说明展示给用户。
- 新增 stale user-thread、相册状态、无效入口、搜索详情和文字图生成回归断言；本轮角色手机定向测试、lint、构建和 `git diff --check` 均通过。全量 `npm.cmd test` 当前为 506/509，失败项为既有的 `scripts/chatLongTermRecallBudget.test.ts`、`scripts/cinemaApp.test.ts` 和 `scripts/memoryCrossAppScope.test.ts` 静态契约，与角色手机改动无关；右侧浏览器复验以现有本地图片证据为准，不上传凭空创建的测试文件。

### 19.5 用户反馈：相册固定详情与隐藏相册门禁

- 相册图片详情页使用固定的 flex 布局和 `overflow-hidden`，图片缩放到可见区域内，标题、描述和底部操作不再随页面纵向滚动。
- 相册图片详情进入时隐藏外层相册标题栏并铺满内容区；顶部只显示返回相册图标和日期，图片区域通过 pointer 手势支持左右切换当前相册模式下的图片，禁止纵向滚动。
- 隐藏相册需要单独输入密码；当前测试密码为 `3737`。角色手机记录新增可选 `hiddenGalleryPasscode`，暂未设置时使用测试密码，后续可接入基于实际角色人设/世界书的派生规则。
- 内容生成 Prompt 新增隐藏相册字段；只有经过来源校验且包含明确私密/隐秘证据时，才写入 `hidden: true` 的本地 SVG 文字图。普通公开图片或没有私密线索的模型字段会被丢弃。
- 相机页移除真实照片说明和空相册提示，新增可输入描述的“生成文字图”按钮；文字图以本地 SVG `dataUrl` 保存到角色相册并按相同描述幂等，避免重复生成。相机视图抵消父级横向内边距并铺满深色背景，不再显示白边。
- 关系网直连 NPC 已接入角色手机同步与生成上下文：首次打开时从当前身份的关系图解析直连 NPC，加入通讯录；生成时允许将已有直连 NPC 绑定到独立聊天线程；若主手机存在该 NPC 的公开 Moment，则同步到角色朋友圈，跨角色/跨身份关系不会泄漏。
- 日记详情页移除页内“‹ 返回”和顶部“编辑”文字操作；外层导航左上角在详情状态下显示“返回日记页”并返回日记列表，编辑按钮移到日记卡片底部与时间同行。
- 笔记编辑页的标题输入与正文编辑区域增加间距，避免两个浅色编辑卡片视觉粘连。
- 浏览器首页改为 Google 风格的文字图标、圆角搜索框、语音/以图搜图入口和“搜索记录/管理记录”列表；历史记录仍保留点击进入 AI 搜索详情的行为。
- 角色手机导航栏统一增量：以用户手机常规应用顶部栏实测 64px 为基准，普通应用顶部栏、聊天子页、浏览器搜索详情和相册图片详情统一使用 `box-border h-16 min-h-16 max-h-16`；浏览器首页透明返回区域也固定 64px，外层返回/Today/保存控件统一为 32px 命中区。
- 浏览器首页透明返回区域与日程共用 16px 横向内边距和 1.5 间距，返回按钮左缘保持同一条对齐线。
- 角色手机聊天底部栏固定 56px，与用户手机聊天底部栏一致；音乐和通话底部栏固定 64px。右侧浏览器已逐页复核日程、备忘录、浏览器首页/详情、聊天、相册详情、通话和音乐的导航尺寸与视觉位置。

## 20. 2026-08-28 会话增量：身份资料错配修复与安全修改流程

### 20.1 身份一致性规则

- `activeIdentityId` 是当前身份的唯一选择依据；不能用当前显示名称、数组下标或顶层 `settings.name` 反推身份。
- `settings.identities[]` 中每条身份必须有唯一、稳定的 `id`。读取旧数据时要校验缺失/重复 ID，并以可追踪的迁移方式修复。
- `settings.name/avatar/signature/bio` 只是当前身份的兼容镜像；身份资料的持久化必须同时更新当前 `identities[id]`，不能只写顶层字段。
- 桌面欢迎卡片、应用页面和关系查询必须读取当前身份投影；不得为了显示方便固定读取 `identity-1`。
- 同名身份不等于同一身份。迁移可以修复 ID 和作用域，不能猜测用户原本想要的昵称或覆盖重复昵称。
- 身份切换后必须验证：当前身份 ID、资料字段、关系列表和首页展示均指向同一个身份；若 ID 不存在，应安全回退并记录可诊断结果。

本次对应修复提交为 `ef432c1 fix: keep active identity profile consistent`，已推送到 `staging/long-term-optimization-2026-08-20`。本条记录不代表真实设备已验收；本地浏览器仍可能持有旧的重复昵称数据，用户需要重新编辑重复的人设名称。

### 20.2 新增功能和修复 bug 的防回归流程

每次任务都按以下顺序执行：

1. 先读 `HANDOFF.md`、本文和实际 `git status --short`；把用户已有未提交改动按功能分类。
2. 先定位数据来源、作用域、加载入口、保存入口和副作用，再动 UI；不要只根据截图改表现层。
3. 把业务规则放进 `domain/` 或 `features/`，让 `App.tsx` 只做路由、状态组合和跨模块连接；仓储变化必须配迁移、备份/恢复、清理和失败处理。
4. 任何身份、关系、聊天、记忆或公开内容都明确携带作用域；私聊至少校验 `userIdentityId + relationId + characterId + conversationId`。
5. 新增应用必须同时检查注册/懒加载、商店与安装、桌面布局、设置图标、存储、备份、清理、权限和隔离测试；不能只把入口接进 `App.tsx`。
6. 先补最小回归测试，再运行定向测试、`npm run lint`、`npm run build`；涉及核心存储或跨应用逻辑时运行 `npm run check`。
7. 提交前查看 `git diff --cached --stat`、`git diff --cached --name-only` 和完整 staged diff；用 `git add -p` 或明确文件列表分离用户旧改动。
8. 只有用户明确要求推送、门禁结果可解释且 staged 内容边界正确时才提交/推送。测试被不相关的用户未提交实验代码阻断时，要记录原因，不得修改实验代码掩盖失败。

### 20.3 本项目必须保持的隔离边界

- 角色手机现在是已接入的正式应用边界；后续修改仍需与其他功能分离、配套测试，并保持每个角色手机的数据隔离。若用户明确要求暂停或只验收而不修改，才暂停该范围的代码动作。
- 不使用破坏性 Git 命令清理工作区；不把“构建自动生成的文件”或其他功能 hunk 混进当前提交。
- 不以全量测试数字代替本次验证；历史门禁只能作为参考，必须报告本次实际命令和失败项。
- 不把本地浏览器预览称为真实移动设备或生产环境验收。
- 发现数据已经损坏时，先保存原始值并提供可追踪修复；不能为了让 UI 看起来正常而静默覆盖用户数据。

## 21. 2026-09-02 长期规则增量：记忆分层、召回去重与变更安全

本节只记录应长期保持的项目规则；当前分支、提交、动态未完成项和本次验证数字放在根目录 `HANDOFF.md`，不要在这里复制容易过期的会话状态。

### 21.1 记忆分层不可混用

- 短期实时上下文是当前 `relationId/conversationId` 的最近消息窗口，负责保持正在进行的对话连续性；它不是长期事实库。
- Truth Layer 是带关系作用域、来源和证据消息 ID 的权威长期事实层；Truth 不等于所有长期记忆。
- Conversation Summary 是可重建的派生摘要，不能和 Truth 竞争权威性。
- Memory Vault 是旧 UI/旧路径的兼容视图；Truth 派生的兼容 Memory 必须带来源 claim 引用，并在 Truth 已覆盖时被遮蔽。
- InnerVoice 只属于当前 direct/group scope，不能自动进入聊天历史、朋友圈、公开论坛、日记、Memory、CharacterEvent 或关系状态。
- AI 生成的帖子、日记、心声、IF 剧情和未完成承诺都不是事实，除非经过明确的事实写入策略和必要确认。

### 21.2 召回去重的安全边界

当短期消息已经进入当前 prompt 时，长期召回必须优先使用来源消息 ID 去重；没有来源 ID 时才使用规范化后的精确文本做保守 fallback。派生摘要在完整来源窗口已进入 prompt，或其来源 claim 已由选中的 Truth 覆盖时应被抑制。不得使用宽松的语义相似度直接丢弃记忆，避免把不同时间、不同关系或有细微差异的事实误判为重复。

去重必须发生在最终 prompt 组装前，并同步影响 token 估算；估算仍是 provider-neutral 近似值，第三方模型 tokenizer 和实际请求才是计费/容量的最终依据。后续若修改检索排序、预算或 prompt adapter，必须同时更新 Truth 检索、短期上下文、摘要、兼容 Memory、token 估算和重生成/群聊/主动消息路径的回归测试。

### 21.3 记忆操作语义

- `暂停召回` 是可恢复的临时开关，不删除记录。
- `撤回长期事实` 是使 Truth 失效并停止召回，原聊天和来源审计仍保留。
- `永久删除` 是删除记忆库记录，不应误删独立保存的原始聊天；没有来源关联的旧记忆或手工记忆不能被猜测性连带删除。
- 编辑必须保持 identity/relation scope、来源和 Truth/摘要/兼容视图的一致性。

### 21.4 新应用和 bug 修复的最小回归门禁

任何新增应用或跨模块 bug 修复，都必须先确定数据来源、作用域、保存入口、读取入口、异步取消和失败回滚边界；然后按“领域/服务纯逻辑 → 仓储/迁移 → prompt 或应用集成 → UI”分层实现。必须补作用域隔离、旧数据兼容、重复调用幂等、删除边界、失败恢复和跨应用泄露测试，不能只补截图对应的 UI 断言。

完成前依次执行定向测试、`npm.cmd run lint`、`npm.cmd run build`；核心跨模块改动再执行 `npm.cmd test` 或 `npm.cmd run check`，涉及发布时加上 release/smoke/security 检查。涉及 UI 时要在目标 viewport 真实点击、输入、刷新、返回并检查控制台、网络和持久化。报告必须区分仓库内通过、真实设备/部署待验收和已知 warning。

### 21.5 外部 API 错误不得通过清空用户数据修复

“离线错误”、结构化回复失败或换模型后暂时恢复时，先保留聊天、Truth、摘要和记忆，采集脱敏 request ID、最终 payload、HTTP/SSE、响应 envelope、解析阶段和重试次数，区分网络、HTTP、编码/SSE、schema、模型拒答和中转站改写。恢复只能采用有界重试、缩减可重建动态区块、协议 fallback 和可解释提示；不得默认清空上下文、记忆、摘要，也不得把无痕模式当成修复方案。
