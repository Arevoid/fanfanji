# 聊天交互产物关系/身份隔离审计

审计日期：2026-08-01
审计基线：`agent/relationship-isolation` / `757c843 fix: isolate proactive voice calls by identity`
审计方式：Phase 0–1 只读静态审计；未修改业务源码、存储结构或 UI

## 1. Phase 0 基线

### 1.1 工作树与构建

- 当前分支：`agent/relationship-isolation`。
- HEAD：`757c843 fix: isolate proactive voice calls by identity`。
- `npm.cmd run lint`：通过，实际执行 `tsc --noEmit`。
- `npm.cmd run build`：通过；Vite 构建 2278 个模块，server bundle 构建成功。仅有既存的 chunk 大于 500 kB 警告。
- `git diff --check`：通过。
- 本轮开始时无 tracked diff；下列七个计划声明的既有文件仍为 untracked，审计未删除或覆盖：
  - `docs/30-day-character-simulation-report.md`
  - `docs/character-consistency-test-plan.md`
  - `docs/character-experience-final-review.md`
  - `docs/character-system-global-audit.md`
  - `docs/character-truth-and-isolation-master-plan.md`
  - `docs/memory-integrity-audit.md`
  - `scripts/characterLongTermConsistency.test.ts`

### 1.2 已读基线文档

已阅读 `character-system-global-audit.md`、`memory-integrity-audit.md`、`character-experience-final-review.md`、`character-cognitive-final-audit.md`、`cognitive-entry-contract.md`。既有架构已经确立 direct 数据以 `relationId + characterId + userIdentityId` 为边界，public 场景 deny-by-default；本报告只补全“普通消息之外的交互产物”证据归属审计。

## 2. 总结与风险排序

当前 direct 消息的列表读取、Chat/Diary/Forum Share、生成图片、InnerVoice、双人音乐和语音来电已经有较好的 relation scope 基础。但 `Message` 的 `relationId` / `conversationId` 仍为可选，多个创建入口依赖 `AppChat.onSendMessage` 在最后一刻补 scope，且该包装器只补缺失字段，不拒绝与当前关系冲突的预置字段。这使异步闭包、引用状态和按 ID 修改成为主要跨身份入口。

### P0：进入 Phase 2 后应先修复

1. **引用与聊天草稿跨关系残留。** `useChatController` 的 `quotedMessage`、`chatInputText` 是组件级 state，没有按 `relationId/conversationId` 存储或在关系/身份切换时清空。用户可在关系 A 选中引用，切到同一 Character 的关系 B 后把 A 的原文序列化进 B；未发送输入也会跟随切换。
2. **异步附件/AI 完成时使用了新的 active relation。** 上传图片先 `await compressImage`，完成后才调用使用当前 React closure 的 `sendCustomMessage`。关系 A 开始压缩、切到 B 后可把图片发送到 B。`sendPartnerRedPacket` 的直接 `apiChat` 路径同样在等待后创建无 scope 消息，再由当前 `onSendMessage` 补 scope。
3. **消息写入和修改没有强制 scope 校验。** `AppChat.onSendMessage` 仅在消息缺少 `relationId` 时补当前关系；若调用者携带其他 relation，则原样写入。`handleDeleteMessage`、`handleUpdateMessage`、`handleToggleBookmark` 只按 `messageId` 操作全库；引用也不验证源消息属于当前 relation/conversation。
4. **红包状态和钱包未按 identity/relation 隔离。** `wechat_redpacket_statuses` 是全局 `messageId -> status` map，打开、领取、过期退款不校验 relation；`wechat_wallet_balance` 也是所有身份共享。过期扫描遍历全量 `messages`，切换身份仍可能处理其他身份红包。
5. **删除 direct relationship 的清理链不完整。** `AppChat.handleDeleteFriend` 清理消息、Memory、Event、Moment、Offline、InnerVoice、生成图片、音乐、论坛 share/DM 和部分 UI state，但没有调用 `cleanupDiaryForRelations`，因此 Character diary、DiaryShare、DiaryGenerationTask、DiaryTranslation 可成为孤儿。红包状态/钱包交易状态、TTS cache 也未清理。
6. **系统备份不是 relation-owned 数据的完整 round trip。** `BACKUP_KEYS` 缺少 `phone_character_events`、`phone_inner_voice_records`、`phone_diary_translations`、`phone_forum_translations`、`phone_moment_generation_tasks`、`phone_last_read_timestamps`、`phone_initiated_chat_ids`、红包状态等；IndexedDB 图片/语音二进制明确不在 JSON 中。恢复后无法保持完整 scope、资源和 UI 状态。

### P1：紧随 P0

1. `Message` 没有判别式 `direct/group` scope，红包、转账、位置、文件、贴图、引用等仅靠 `content` marker 区分，Repository 也不验证 relation-character-conversation 三元组。
2. 用户上传图片仍把 data URL 直接放入 `Message.content`，没有独立 asset record/source metadata；生成图片已有双记录模型，两条图片链语义不一致。
3. TTS IndexedDB cache key 仅由 voice 参数和原文组成，不记录 relation/message provenance，删除消息/关系无法撤销缓存；播放中的 audio/interval 也未在 relation switch 上形成统一清理契约。
4. `Character.album` 是角色级公开档案且会用于朋友圈封面，当前聊天图片没有写入它，这是正确的；但类型/服务层没有阻止未来调用者把关系私照写进 `album`。
5. 转账状态嵌入消息正文的第四段，没有 relation-aware 状态 Repository，也没有接受/拒绝的确定性事件模型。
6. 群聊继续用 `characterId === groupId` 作为容器边界，消息通常没有显式 `conversationId`；direct Memory/WorldBook 的群场景暴露属于后续 Group Cognitive Context 风险。
7. 自动翻译、重生成、心声等异步结果最终按全局 `messageId` 回写；现有 ID 通常近似唯一，但缺少 `messageId + relationId/conversationId` 防御式验证。

### P2：可在边界稳定后处理

1. 收藏仍是 `Message.isBookmarked` 内嵌字段，没有独立 identity-scoped 索引；scope 正确完全依赖消息本身。
2. 位置、文件和音乐分享 Prompt 已有“不等于线下事实”的部分约束，但仍是自由文本 marker，应在 Truth Layer 阶段保留来源/种类而非直接作为事实。
3. 角色贴图库可以全局共享；目前发送记录经 Message 保存，边界基本正确，但贴图资源本身没有发送使用索引和 relation 删除审计。

## 3. 通用读写、迁移与删除链

### 3.1 类型与创建

- `src/types.ts`：`Message.relationId`、`conversationId` 可选，特殊消息没有独立 kind/payload；`DiaryEntry`、`DiaryShare`、Forum 数据、ImageGenerationRecord 已有更明确的 owner/relation 字段。
- `src/features/chat/services/messageFactory.ts`：允许 legacy 字段优先于 `ChatRuntimeContext`。当调用者显式传 `characterId` 时，context 不再自动提供 relation boundary。
- `src/components/AppChat.tsx`：最终包装器只给缺 relation 的 direct 消息补 active relation；它既不拒绝 direct 新写入缺 scope，也不验证已有 scope 与 active identity/character 是否一致。
- `src/core/storage/repositories/messageRepository.ts`：Repository 只读写数组，不做 scope validation。

### 3.2 读取与 Prompt

- 正常 direct 列表主要按 `message.relationId === activeRelationship.id` 读取，优于 character-only。
- 未读计数保留 legacy fallback：无 relation 消息按 `characterId === chatKey` 计算；由于 `chatKey` 对 direct 通常是 relationId，这不会把所有同角色历史当通配符，但 legacy 可见性仍由迁移质量决定。
- Chat、Diary、Forum DM、音乐等主要生产路径已按 relation 过滤近期消息；特殊消息正文仍作为普通历史文本进入 Prompt，文件正文、位置等靠 marker 转译。
- 重生成仍有独立 Prompt 路径，且消息删除/替换按 ID 操作，需在 Phase 2/10 与统一 runtime context 一并收口。

### 3.3 Legacy 迁移

- `relationshipMigration.ts` 将无 `relationId` 的 direct Message/Memory/OfflineStory 只映射到 `DEFAULT_IDENTITY_ID` 的默认关系，不把无 scope 当作所有身份通配符；这一策略正确且幂等。
- 已有 relation 的记录会规范化 `characterId + relationId + conversationId`；找不到 relation 的显式 scoped record 会被保留而不是悄悄改绑。
- 迁移尚未覆盖红包状态、收藏/UI state、引用源、TTS cache、生成图片 record 等派生产物。

### 3.4 删除与备份

- 删除 Character 的 App 级路径比删除单一 relationship 更完整，包含 diary、forum、music、InnerVoice、生成图片和部分 UI state。
- 删除单条消息仅由 AppChat 对“生成图片 record + IndexedDB asset”做联动；App 层 `handleDeleteMessage` 本身只按 ID 过滤。其他派生状态（红包、翻译、引用中的冻结文本、Memory source）没有统一撤销链。
- 清空关系消息 `handleClearMessages` 不清理生成图片 record/asset，和逐条删除语义不一致。
- JSON 备份会保存 Message 与 ImageGenerationRecord 元数据，但不保存 IndexedDB 图片/TTS/本地音乐二进制；备份 UI 对“100% 完美还原”的表述与实际行为不一致。

## 4. 交互产物逐项矩阵

| 产物 | 当前 scope / character-only fallback | Legacy 行为 | 删除清理 | 风险 | 最小修复文件 | 必要测试 |
|---|---|---|---|---|---|---|
| 普通文本消息 | direct 读取按 relation；创建常先 character-only，再由 AppChat 包装器补 relation；group 用 group characterId | 无 relation direct 只迁默认身份 | relation 删除可清消息；单条删除只按 ID | P0 | `types.ts`, `messageFactory.ts`, `AppChat.tsx`, `messageRepository.ts` | `chatArtifactIdentityIsolation.test.ts`, `chatRuntimeContext.test.ts` |
| 引用消息 | 引用对象只存 React state，发送时序列化原文；不校验同 relation/conversation | 旧引用只是正文，无法追源 | 源消息删除后冻结正文仍保留；无撤销语义 | P0 | `useChatController.ts`, `chatController.ts`, `AppChat.tsx` | 新增跨身份引用拒绝、切换清空测试 |
| 语音消息 | 发送记录经 Message；TTS cache 仅 voice 参数 + 原文，无 relation/message | legacy marker 可播放 | 消息删除不清 TTS cache；播放 timer 无统一 relation cleanup | P1 | `minimaxTts.ts`, `AppChat.tsx`, 新建 audio asset index | 语音 A/B 隔离、删除 cache、切换停止播放 |
| 语音电话/记录 | `voiceCallScope` 锁 relation+conversation；记录显式带 scope，identity switch 回归已有 | 无 scope 老记录仍是普通 Message legacy | relation 删除清记录；运行时 queue/state 由 scope 检查保护 | 低/P1 回归 | `voiceCallScope.ts`, `AppChat.tsx` | 保留 `proactiveVoiceCallIdentityIsolation.test.ts`，补切换时队列/转写 |
| 视频通话 | marker 跟随普通 Message；未发现独立 scope service | 旧 marker | 同消息 | P1 | 与 voice call 合并到通话 scope service | 视频通话切身份/记录 scope |
| 用户上传图片 | data URL 写 Message.content，最后由当前 active relation 补 scope；无 asset record | legacy data URL 可读/可备份 | 删除消息即移除 data URL；压缩异步可错投关系 | P0 | `AppChat.tsx`, `characterImageService.ts` 或新 upload asset service | A 开始压缩、切 B、结果不得写 B；删除关系无 asset |
| AI 生成图片 | `ImageScope` 判别 direct/group；Message + record + IndexedDB asset 一致 | 老无 record 图片仍由 Message 显示 | 单条/关系/Character 删除已有联动；清空消息遗漏 record | P1 | `characterImageService.ts`, `imageGenerationRepository.ts`, `App.tsx` | 保留 `imageGenerationRelationIsolation.test.ts`，补 clear-history cleanup/backup |
| 角色相册 | `Character.album` 明确角色级、跨身份共享；聊天图不写入 | 角色导入可把头像放 album | 删除 Character 清元数据；base64 随 Character | 低，需契约 | `types.ts`, `AppArchives.tsx`, 新建 media policy | 关系图片不得进入 album；公开 album 可跨身份 |
| 贴图/表情 | 发送记录跟随 Message；贴图库全局 | marker legacy | 消息随关系删；资源库不按 relation 清理（可接受共享资源） | P2 | `messageFactory.ts`, sticker usage policy | A 发送记录 B 不可见；删关系不误删全局贴图库 |
| 红包 | Message 最后补 relation；status 全局只按 messageId；钱包全局 | 无 scope status 无迁移 | relation/消息删除不清 status；过期扫描全量 messages | P0 | `types.ts`, 新建 payment repository/service, `AppChat.tsx`, backup | A/B 不可打开/领取/退款；删除 relation；备份 round trip |
| 角色主动红包补充回复 | 红包和补充文本都先无 scope；直接 `apiChat`；等待后由当前 active relation 补 | 无 | 同消息 | P0 | `AppChat.tsx`, `directChatService.ts`, Chat Adapter | A 触发、切 B，红包和补充回复都只能落 A |
| 转账 | 状态内嵌 content，消息边界依赖包装器；无 relation-aware领取记录 | marker legacy | 仅随消息删除 | P1 | payment repository/service, `AppChat.tsx` | A/B 不可确认对方转账；状态/事件按 relation |
| 位置 | Message scope；Prompt 明确“分享位置”，但无 typed payload | marker legacy | 随消息删除 | P2 | special message codec + truth policy | 只形成 share-location 动作，不形成 current-location fact |
| 文件/笔记 | 标题/正文 URL-encode 在 Message；无独立快照 provenance | marker legacy | 随消息删除；由消息进入的 Memory 无撤销链 | P1 | typed attachment snapshot, truth write policy | A/B 不可读；删除源后 claim retracted/orphaned |
| 音乐分享 | Message scope；RelationshipMusicState 按 relation，IdentityMusicState 按 identity | Repository 有 legacy normalize | Character/relation 删除有 music cleanup | 中/P1 | `musicWidgetRepository.ts`, `musicContext.ts`, `AppChat.tsx` | 保留 `dualMusicRelationIsolation.test.ts` / cleanup backup；补分享 A/B |
| 双人音乐推荐 | service 传 ownerIdentityId+relationId，消息/Memory 按 relation 过滤；绕过通用 Cognitive Adapter | legacy music state normalize | relation/Character 删除已有 cleanup | P1 | `dualMusicRecommendationService.ts`, music adapter | 现有隔离测试 + 不补写共同地点/动作 |
| 日记与日记分享 | Entry ownerIdentity；角色日记 relation+conversation；Share 明确 target relation | restore sanitizer 校验 relation 三元组 | Character 删除完整；单 relation 删除遗漏 diary cleanup | P0 | `AppChat.tsx`, 抽取统一 relationship cleanup service | `diaryShareContext.test.ts` + 删除 relation 全链测试 |
| 论坛分享 | share 明确 owner+target relation+conversation，冻结 public snapshot | restore/load 有校验/规范化 | relation 删除 share 和 DM，public author 私有链接被解除 | 低/P1 回归 | `forumShare.ts`, `forumRepository.ts` | 分享 A/B、删除 relation、backup round trip |
| Forum DM | Conversation ownerIdentity；实名角色 participant 含 relation | virtual actor 与 relationship actor 分支兼容 | `cleanupForumDmForRelations` 已覆盖 | 低/P1 回归 | `forumDmData.ts`, `forumDmService.ts` | 保留 forum DM isolation/deletion tests |
| 心声 | direct relation 或明确 group scope；Repository 查找校验 messageId+scope | 无 relation/group 的记录不会作为 direct/group 命中 | relation/Character 删除已清理；backup 缺失 | P1 | `innerVoiceRepository.ts`, `AppSettings.tsx` | 保留 `innerVoiceRelationIsolation.test.ts`，补备份与 ID 碰撞 |
| 收藏/书签 | 内嵌 Message；更新只按 messageId | 跟随 legacy Message | 随消息删；无独立索引 | P1 | scoped message mutation service | A/B 同 ID 不能互改；列表只看当前 relation |
| 未读/已发起 | map key direct 用 relationId、group 用 characterId；读取保留 legacy character fallback | 旧 character key 兼容 | relation/Character 删除有清 key；backup 缺失 | P1 | UI state repository, `AppChat.tsx`, `AppSettings.tsx` | A/B unread 隔离、删除/恢复 |
| 置顶 | `Character.isPinned` 是角色级而非 relation 级，同一 Character 的不同身份共享 | 旧 Character 字段 | 删除 Character 才清 | P1 | 移入 `CharacterRelationship`, migration | A/B 可分别置顶，legacy 只映默认关系 |
| 聊天草稿 | `chatInputText` 单实例 state，无 relation key；切换不清 | 无持久 legacy | 关闭/切换没有显式 relation cleanup | P0 | `useChatController.ts`, 可选 draft repository | A 输入后切 B 不可见；切回 A 恢复或明确丢弃 |
| Diary draft | ownerIdentity scoped，但不是 relation scoped（用户私人草稿合理） | restore 校验 owner/body | identity cleanup helper存在；系统备份包含 | 低 | 保持 identity scope | A/B identity 不共享；backup round trip |
| 主动消息调度/冷却 | schedule、in-flight、catchup、call cooldown 主要按 relationId | Character 上仍有 deprecated/legacy scheduling 字段 | relation 删除清当前 refs；持久 schedule 随 relation 删除 | 中/P1 | proactive runtime service, `AppChat.tsx` | A/B schedule/in-flight/catchup 完全隔离，删除后不触发 |
| Moment | ownerIdentity + optional generating relation；公开输出 deny-by-default | 缺 owner legacy 归 identity-1 | relation 删除自动生成 Moment；Character 删除角色 Moment | 中/P1 | `momentRepository.ts`, generation task cleanup | A/B feed、删除 relation、public prompt 拒绝 private inputs |
| Group Chat | group character ownerIdentity；消息常用 group characterId，缺显式 conversation | 继续兼容旧 group container | group/Character 删除路径独立 | P1 | GroupCognitiveContext + typed GroupMessageScope | direct A/B Memory 不进 group，owner identity switch 隔离 |

## 5. 精确的 Phase 2 最小修复顺序

### 5.1 Foundation（先建立唯一边界）

1. 在 `src/features/chat/context/` 新增窄化的 `DirectInteractionScope`，必须包含 `relationId + conversationId + characterId + userIdentityId`；由当前 `CharacterRelationship` 一次性创建并验证。
2. `messageFactory.ts` 对新 direct 写入强制 scope；legacy 读取继续兼容，但任何新写入不允许 character-only。
3. 新建 scoped message mutation service，更新/删除/收藏/引用解析都必须校验 `messageId + relationId + conversationId`。
4. `AppChat.onSendMessage` 从“缺字段补齐”改为“验证 scope 后写入”，冲突直接拒绝。

### 5.2 Integration（先堵异步和 UI 状态）

1. `useChatController` 接收 runtime context；普通发送与引用发送在创建时即带 scope。
2. relation/identity switch 时清空或按 relation 保存 `chatInputText`、`quotedMessage`、附件 modal、红包/转账详情、播放/翻译中的 UI state。
3. 图片压缩、主动红包补充回复、生成图片、翻译、重生成等在启动时捕获 scope，完成前再次验证 relation 仍存在且属于相同 identity；结果始终写回捕获 scope，不写当前 active scope。
4. 红包/转账抽到 relation-aware payment repository；wallet 至少按 `ownerIdentityId`，status/action 按 `messageId + relationId`。

### 5.3 Cleanup / Backup

1. 抽取统一 `cleanupRelationshipArtifacts(relationId)`，供删除好友、删除 Character、删除 identity 共用；纳入 diary、payment、image、InnerVoice、forum、music、offline、event、UI state 和 future truth claims。
2. 清空聊天时先解析被删 message IDs，再删除 ImageGenerationRecord/IndexedDB asset 和其他 message-derived 状态。
3. 扩展 `BACKUP_KEYS` 与 sanitizer；对无法进入 JSON 的 IndexedDB asset 提供 manifest/export 或明确降级，不再宣称 100% 恢复。

## 6. 建议新增/保留测试

优先新增：

- `scripts/chatArtifactIdentityIsolation.test.ts`：同一 Character 的 identity A/B，覆盖普通文本、引用、贴图、语音、红包、转账、位置、文件、上传图片、收藏、未读、草稿。
- `scripts/specialMessageRelationIsolation.test.ts`：所有 payment/action 必须同时验证 message+relation；消息 ID 碰撞不得互改。
- `scripts/chatAssetRelationIsolation.test.ts`：上传/生成图片的 message-record-asset 三联一致，切换、删除消息、清空历史、删除关系后无残留。
- `scripts/shareRelationIsolation.test.ts`：Diary/Forum/Music share 的 owner+target relation+conversation 完整性。
- `scripts/relationshipArtifactCleanup.test.ts`：单 relationship 删除的所有 repository、localStorage map 和 IndexedDB manifest 清理。
- `scripts/systemBackupRelationshipRoundTrip.test.ts`：scope/status/source 备份恢复不变；缺二进制时显式报告。
- `scripts/chatAsyncScopeCapture.test.ts`：A 启动图片压缩/主动红包/翻译/重生成，切到 B 后结果仍只属于 A 或被安全取消。

必须保留并继续运行：

- `scripts/proactiveVoiceCallIdentityIsolation.test.ts`
- `scripts/imageGenerationRelationIsolation.test.ts`
- `scripts/dualMusicRelationIsolation.test.ts`
- `scripts/innerVoiceRelationIsolation.test.ts`
- `scripts/diaryShareContext.test.ts`
- Forum DM isolation/deletion 与 dual music cleanup/backup tests

## 7. Phase 1 验收判断

- 已覆盖计划第 5 节的全部交互产物，包括普通消息之外的相册、图片、语音、通话、红包、转账、位置、文件、贴图、引用、音乐、日记/论坛分享、心声、收藏、未读、置顶、草稿与主动调度。
- 已明确区分 `Character.album`（角色级公开档案）与 relation-owned chat/generated media；当前代码没有把聊天图片写入角色相册。
- 已覆盖类型、创建、保存、读取、Prompt、删除、备份、迁移和 identity switch 的 timer/ref/closure。
- 本阶段未修改源码、未提交、未推送。
