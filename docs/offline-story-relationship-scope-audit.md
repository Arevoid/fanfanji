# OfflineStory Relationship Scope 审计

审计范围：当前 agent/relationship-isolation 分支上的 OfflineStory 数据结构、创建与打开流程、列表筛选、线上导入、OfflineMemorySync，以及删除角色/关系后的清理行为。

本轮为只读审计，不修改源码、不提交、不推送。

## 结论摘要

| 场景 | 当前状态 | 结论 |
| --- | --- | --- |
| 单角色 direct OfflineStory | 创建、活动故事键、打开、线上导入、Memory 同步主要使用 relationId | 基本正确，但不变量分散，需统一 |
| 旧 direct story 无 relationId | 迁移到默认身份的关系；未通过迁移时不能直接跨关系打开 | 兼容逻辑可用，新路径应继续 fail-closed |
| 群聊 OfflineStory | relationId 有意为空，使用群容器和 group conversationId | 方向合理，但应明确建模为 group scope |
| 多个 direct 角色共用一个 story | 只有一个 relationId，characterIds 只是角色集合 | 尚不支持完整关系隔离 |
| OfflineMemorySync | direct 路径同时检查 characterId、relationId 和 story marker | 未发现 direct 跨关系读取；多角色/legacy 语义仍有缺口 |
| 删除 direct relation | 按 relationId 清理 stories/messages/memories，并清理活动键 | 基本覆盖 |
| 删除群成员 | 群 story 的 characterIds 不一定被修剪 | 存在参与者引用清理缺口 |
| 故事数量显示 | 正文列表按关系过滤，数量徽标只按 characterId 统计 | 存在跨身份/跨关系聚合显示风险 |

总体判断：单角色 direct 剧情已经具备关系隔离主骨架，但约束分散在 AppOffline、迁移、导航、Memory 同步和清理代码中。群聊和多 direct 角色故事实际上是不同的 scope 模型。CharacterEvent 之前，应先统一 OfflineStory scope 不变量和查询入口。

## 1. OfflineStory 数据结构

定义位置：src/types.ts 的 OfflineStory 接口，当前约在 824 行。

主要字段：

- id：故事实例唯一 ID。
- characterId：故事的主角色或容器角色。direct story 中是 canonical character 引用；群聊中可代表 group character。
- relationId：direct story 的关系归属。群故事当前有意不设置。
- conversationId：关联的聊天会话。direct 通常使用 direct:关系 ID；群聊使用群会话边界。
- characterIds：参与角色的 canonical character ID 列表。
- title、createdAt、updatedAt、mode、ifPrompt：故事元数据。
- sourceChatId、sourceChatMsgCount：从线上聊天开始或继续时的来源信息。sourceChatId 仍是角色/容器引用，不是关系授权字段。
- messages：故事内部消息快照；消息本身可以带 relationId、conversationId、isOffline、isImportedContext 等字段。
- importedContext：导入的消息、记忆文本和 WorldBook 文本快照。
- lastSyncedMessageCount、memorySyncStatus、lastMemorySyncAt、syncedSourceMessageIds：线下记忆同步状态。
- archivedMemoryIds：归档或同步相关的记忆 ID。

存储位置：

- src/core/storage/repositories/offlineRepository.ts 通过 phone_offline_stories 保存整个故事数组。
- Repository 没有按 relationId 物理分区，隔离由上层查询、迁移和清理实现。
- offline_mode_active_关系ID 和 offline_story_id_关系ID 是关系级活动会话键。

当前模型是“全局数组存储 + 关系作用域查询”，不是按关系分库。

## 2. 关系模型与 OfflineStory 边界

src/domain/relationship/characterRelationship.ts 中，CharacterRelationship 通过以下字段确定 direct 关系：

- id：relationId，关系唯一边界。
- characterId：对方角色 canonical ID。
- userIdentityId：当前用户身份。
- conversationId：关系对应的聊天会话。

关系辅助函数还提供：

- getConversationId(relationId)：direct 会话 ID。
- getOfflineModeStorageKey(relationId)：线下模式键。
- getOfflineStoryStorageKey(relationId)：活动故事键。

direct OfflineStory 的正确边界应为：

1. relationId 决定归属、打开权限和同步范围。
2. conversationId 决定关联聊天线程。
3. characterId 决定对方角色的 canonical identity、显示和角色内容查找。
4. characterIds 只表达参与角色，不能单独替代 direct 关系权限。

群聊不是 direct 关系。它应以 group character、groupId 或 group conversationId 为容器边界。当前 relationId 为空的方向是合理的，但应把这种情况明确为 group scope，而不是让空字段看起来像数据缺失。

## 3. 数据流总览

~~~mermaid
flowchart LR
  I["当前 userIdentity"] --> R["CharacterRelationship\nrelationId + conversationId"]
  R --> S["OfflineStory\ncharacterId + relationId"]
  S --> M["story.messages\nrelationId + conversationId"]
  S --> H["OfflineMemorySync"]
  H --> V["MemoryItem\ncharacterId + relationId"]
  V --> P["线上 MemoryRetriever / Prompt"]
  G["Group container\nconversationId / groupId"] --> SG["Group OfflineStory\nrelationId omitted"]
~~~

## 4. 创建流程审计

### 4.1 AppOffline 创建

入口：src/components/AppOffline.tsx 的 handleCreateStory。

流程：

1. 当前用户身份来自 settings.activeIdentityId。
2. 可选关系按 characterId 等于 selectedCharId 且 userIdentityId 等于 activeIdentityId 筛选。
3. 没有对应 relationship 时不会创建 direct story。
4. 新故事写入 selectedCharId、relationship.id、relationship.conversationId 或 direct 关系会话 ID。
5. 从线上聊天开始时，源消息按 selectedRelationId 过滤；导入记忆也按 selectedRelationId 过滤。
6. WorldBook 按角色/全局 scope 导入，而不是按 relationId 导入。它符合当前 WorldBook 的角色知识定位，但若条目包含关系私密事实，未来需要关系 scope。

对单角色 direct story，这条路径正确：创建前先选关系，story 记录关系，消息和记忆快照不直接从其他关系取。

### 4.2 AppChat 开始线下剧情

入口：src/components/AppChat.tsx 的 handleStartOfflineFromMsg。

direct 路径：

- 在线消息按 activeRelationship.id 过滤。
- 记忆按 activeRelationship.id 过滤。
- story 写入 active relationship 的 relationId 和 conversationId。
- sourceChatId 保存角色 ID，适合表示来源角色，但不承担 direct 授权。

group 路径：

- relationId 有意为空。
- conversationId 或群容器承担边界。
- characterIds 保存参与角色。

AppChat 已区分 direct/group，但二者依赖隐含约定，尚未由统一的 OfflineStoryScope 类型表达。

### 4.3 迁移流程

src/domain/relationship/relationshipMigration.ts 会处理旧数据：

- 无 relationId 的 direct 消息、记忆和故事，会在默认身份 identity-1 下创建或绑定默认关系。
- 有效 relationId 的 story 会规范化 characterId、relationId、conversationId。
- story 内缺 relationId 的 direct message 会补齐为 story 的 relationId 和 conversationId。
- 群角色对应的无 relationId story 保持 relationless，这是当前群容器语义。

迁移兼顾旧数据兼容和 direct 数据归属，但默认关系不能证明真实历史归属。因此它只能是 legacy fallback，不能成为新建数据的正常路径。

## 5. 打开、继续和活动会话

### 5.1 AppOffline 访问检查

src/components/AppOffline.tsx 的 canAccessStoryFromCurrentRelation 是 direct story 的主要访问闸门：

- 群 story 按群容器放行。
- direct story 要求 story.relationId 存在。
- story.relationId 必须等于 selectedRelationId。
- 当前 relation 还必须属于 activeIdentityId 和所选角色。

缺 relationId 的 direct 旧 story 不会被其他 direct relation 直接读取，属于 fail-closed。旧数据要靠迁移恢复。

### 5.2 活动 story localStorage

活动 story 使用 getOfflineStoryStorageKey(selectedRelationId) 读取，并再次执行访问检查。direct relations 不共享活动 story key。

这保护了活动指针，但全局数组仍要求列表、打开、导航和同步都复用同一访问条件。

### 5.3 线上回跳

src/domain/relationship/offlineChatNavigation.ts：

- 有 relationId 的 direct story 根据 relationId 找回关系、owner identity、canonical character 和 conversationId。
- group story 走群容器路径。
- 缺 relationId 的 legacy story 根据 owner identity、canonical character 和可选 conversationId 回退。

当同一角色存在多条关系时，legacy 回退可能有歧义，只应作为迁移兼容；新数据不能靠 characterId 推断 relationId。

## 6. 列表筛选审计

### 6.1 正文列表

AppOffline 的 charStories 使用：

1. canAccessStoryFromCurrentRelation(story)；
2. story 的 canonical character 是否是所选角色；
3. 或 story.characterIds 是否包含所选角色。

所以 direct story 正文不会仅凭 characterId 跨关系显示。

### 6.2 已发现问题：数量只按 characterId 统计

角色/分组数量使用类似：

offlineStories.filter(s => s.characterId === char.id).length

它没有叠加当前 relationId、userIdentityId 或访问谓词。因此：

- 身份 A 与身份 B 共享一个 canonical character 时，数量可能合并；
- 同一角色存在多条关系时，数量可能包含其他关系；
- 虽然没有直接暴露正文，但会产生错误的当前关系视觉结论。

这是当前最明确的活跃 characterId-only 边界遗漏。数量应基于当前关系可访问集合，或者明确标注为全局聚合。

### 6.3 需要持续审计的查询

继续检查所有 offlineStories.filter 以及由 characterId 反推活动故事、聊天会话、继续剧情、删除对象和 Prompt 文本的代码。

AppChat 的 getOfflineStoriesContextString 当前直接返回空字符串，旧的 characterId-only 实现是注释代码，不是活跃 Prompt 注入路径。未来重新启用时必须传入 relationId，禁止只按 characterId 注入线下故事。

## 7. 线上导入线下上下文

direct 导入当前按 relationId 选择：

- source messages：当前关系消息；
- memories：当前关系记忆；
- conversationId：当前关系会话；
- WorldBook：当前角色/全局条目。

这是正确的关系边界。

sourceChatId 仍是角色或容器引用，适合 canonical display/source identity，但不能决定：

- story 属于哪条关系；
- 从哪条关系导入；
- 当前身份是否可打开。

新 schema 可增加 sourceRelationId、sourceConversationId；过渡期至少必须把 story.relationId 作为 direct 授权字段。

### importedContext 的 provenance 风险

importedContext.messages 可以保留关系字段，但 importedContext.memories 仅保存字符串，丢失原 memoryId、relationId 和来源关系。

当前 snapshot 仅供当前 story 使用，没有发现它直接读取其他关系全局 memory 的活跃路径。但后续若把 snapshot 回写全局 Memory，就无法可靠恢复原始归属。多角色 story 还可能把共享文本重新标记给多个角色。

建议后续保存 memory provenance，而不是只保存内容字符串。

## 8. OfflineMemorySync 审计

### 8.1 触发和来源

src/domain/memory/offlineMemorySync.ts 提供同步标记、来源消息过滤和 continuation 判断；AppOffline.handleSyncMemoryToBrain 触发 MemoryService：

- 仅在有未同步进度或 legacy/summary 修复条件时触发；
- 从 story 自己的消息提取；
- 排除 imported context、旧导入消息、narration 和空内容；
- 按时间排序；
- 对同一个 story 的 handoff memory 执行替换/合并。

### 8.2 relationId 检查

MemoryExtractor 创建候选时写入 characterId 和可用的 relationId。MemoryRetriever 的逻辑是：

- 先匹配 characterId；
- 调用提供 relationId 时，必须精确匹配；
- 调用未提供 relationId 时，只读取同样无 relationId 的 legacy 记忆，不把它当作通配符。

OfflineStory handoff memory 的匹配同时要求 characterId、relationId 和当前 story marker。

因此，单角色 direct sync 的读取、创建、去重和替换没有发现跨 relationId 污染。

### 8.3 风险边界

1. legacy direct story 若绕过迁移进入同步，应拒绝继续同步，而不是把无 relationId 当作任意关系。
2. group story 不适合写入某个 direct relation；当前实现拒绝群角色 direct sync，这是安全的，但群记忆未来需要 group scope。
3. 多 direct 角色 story 只有一个 owner relationId，事实归属会有歧义。
4. importedContext.memories 没有来源 relationId，目前不回写全局，但未来扩展必须保留 provenance。

## 9. 单角色与多角色支持判断

### 9.1 单角色 direct story

当前支持条件基本满足：

- 创建时按当前身份筛选 relationship；
- story 写入 relationId；
- active key 按 relationId；
- 列表和打开按 relationId；
- 线上导入按 relationId；
- Memory sync 按 relationId；
- relation 删除按 relationId。

应正式定义并测试不变量：

direct OfflineStory 必须同时有 relationId 和 conversationId，且其中的 direct story message 的 relationId、conversationId 与 story 一致。

### 9.2 群聊 story

当前支持的是群容器 story，不是多条 direct relations 组合：

- relationId 为空；
- group conversationId 或容器角色承担边界；
- characterIds 表示群成员；
- AppOffline 的普通联系人选择不把群聊当 direct 角色。

方向可以保留，但应增加明确的 group scope 表达，例如 groupId 或 sourceConversationId。

### 9.3 多 direct 角色共用 story

当前不支持完整隔离：

- relationId 只能表达一个 owner；
- characterIds 不能表达角色到关系的映射；
- importedContext.memories 只有文本；
- message sender 与 direct relation 没有统一 participant mapping；
- 删除一条关系时无法判断故事应保留、拆分还是删除部分内容。

如果产品需要这一能力，后续应设计 participantRelationIds、ownerRelationId、participant 到 character 的映射、每条 story message 的来源关系，以及事实归属规则。在此之前不能把 characterIds 当作关系隔离替代品。

## 10. 删除角色、删除关系和清理

### 10.1 direct relation 清理

src/domain/relationship/relationshipCleanup.ts 的 removeRelationshipData 会按 relationIds 清理：

- relationships；
- messages；
- memories；
- OfflineStories。

App.tsx 删除角色时还会收集 canonical/contact-copy 关系，清理 direct stories，并移除关系级 offline mode/story localStorage keys。

direct 关系清理基本完整。

### 10.2 characterId 作为补充清理边界

角色删除使用 canonical characterId 是合理的，因为角色实体、contact-copy、头像、显示信息和参与者引用都需要消失。但 characterId 只能做角色级补充清理，不能替代关系级访问、同步或 Prompt 过滤。

### 10.3 群 story 参与者清理缺口

群 OfflineStory relationId 为空，removeRelationshipData 无法按某个 direct relation 删除它。canonical character 清理主要判断 story 的 owner/container characterId，不一定从 story.characterIds 移除已删除成员。

可能结果：

- 群容器仍存在；
- story.characterIds 仍包含已删除成员；
- 历史 story 或继续流程仍看到失效参与者引用。

这不是 direct relation 跨读，但属于 participant referential integrity 问题。需要明确保留历史成员快照、移除成员引用或归档 story 的产品规则。

### 10.4 只删除一条关系

如果未来增加只删除 relation、不删除 character 的入口，必须复用 removeRelationshipData，并同时移除 relation-scoped offline session keys，不能只删除 relationship record。

## 11. 哪些地方保留 characterId 合理

| 场景 | 是否合理 | 说明 |
| --- | --- | --- |
| canonical character、头像、名称和显示 | 是 | Character 是角色实体边界 |
| WorldBook 角色级条目 | 是 | 默认是角色知识，不等于关系私密事实 |
| story 主角色或群容器 | 是 | 用于显示、路由和 canonical 引用 |
| story.characterIds 参与角色集合 | 是 | 不能承担 direct 授权 |
| sourceChatId | 部分合理 | 适合来源角色/容器；direct provenance 还需 relationId |
| direct story 所属、打开和列表内容 | 否 | 必须 relationId 加当前 identity scope |
| active story localStorage | 否 | 当前已按 relationId |
| direct story 线上导入 | 否 | 必须 relationId/conversationId |
| direct MemoryRetriever 查询 | 否 | 必须精确 relationId |
| OfflineMemorySync handoff 替换 | 否 | 必须同时检查 relationId |
| direct story 删除 | 否 | 优先 relationId，再以 characterId 做补充清理 |
| 群 story 边界 | 不能单独使用 | 应用 groupId/group conversationId |

## 12. 风险分级

### 必须在 CharacterEvent 之前处理

1. 定义 direct/group OfflineStory scope 不变量。
2. 修复当前按 characterId 统计 story 数量的查询。
3. legacy relationless direct story 必须只迁移或 fail-closed，不能作为新路径的隐式通配。
4. 明确群 story 不进入 direct relation 事件和 direct memory。
5. 确认 importedContext 与 story message 的 relation provenance。
6. 确认关系删除、角色删除和活动 session key 使用统一清理入口。

### 建议随后处理

1. 抽取统一 OfflineStory access scope/helper，供列表、数量、打开、导航和同步使用。
2. 增加 sourceRelationId/sourceConversationId，保留 sourceChatId 作为角色/容器引用。
3. 为群 story 增加明确 group scope。
4. 为多 direct 角色增加 participantRelationIds 和 participant mapping。
5. importedContext memories 保存 memoryId、characterId、relationId、conversationId 等 provenance。
6. 为 repository 增加按 scope 查询 API，先不改变底层全局数组存储。

### 可以延后

1. offlineRepository 物理按 relationId 分区。
2. 重写 characterId canonical storage key。
3. OfflineStory UI 重构。
4. WorldBook 全面改成 relation scope；只有关系私密事实进入 WorldBook 时才需要。
5. CharacterEvent、RelationshipTimeline 的完整实现。

## 13. 推荐前置修复顺序

1. 定义 direct/group scope 类型和 legacy 迁移策略。
2. 抽取统一访问谓词，替换列表正文、数量、打开、活动 story、线上回跳和同步入口中的散落判断。
3. 使数量统计与当前 relationId/userIdentityId 一致。
4. 对 direct story 缺 relationId 的打开、继续和同步全部 fail-closed。
5. 统一 relation 删除、角色删除和 session key 清理入口。
6. 补齐 direct、group、legacy、关系删除和多 identity 隔离测试。
7. 再设计 CharacterEvent 的产生和归属。

## 14. 验收测试建议

| 测试 | 预期 |
| --- | --- |
| 同一角色、身份 A 创建 direct story | story.relationId 是 A 关系，A 可打开 |
| 同一角色、身份 B 查看 A story | B 的正文、数量和 active story 均不可见 |
| 同一角色、两条 relations | relation 1 不读取 relation 2 的 messages、memories 或 stories |
| 旧 direct story 无 relationId | 迁移到默认关系；迁移前不可跨关系打开 |
| nested message 无 relationId | 迁移后补齐 story 的 relationId/conversationId |
| group story | 不要求 direct relationId，按 group scope 打开和同步 |
| 多 direct 角色 story | 在 participant schema 明确前，不伪装为完整关系隔离 |
| OfflineMemorySync | handoff 必须同时匹配 story marker、characterId、relationId |
| 删除一条 relation | 只删除该关系 direct stories/messages/memories/session keys |
| 删除 character | 清理 canonical/contact-copy direct data，群参与者符合明确策略 |
| AppChat offline context | 禁止 characterId-only Prompt 注入 |
| story 数量 | 只统计当前可访问关系，或明确是全局数量 |

## 15. 最终判断

当前 OfflineStory 对单角色 direct 场景已经基本关系化，关系字段和 Memory isolation 主链路存在；但还不是完全统一的 relationship-scoped domain：

- direct story：关系隔离主路径可用；
- legacy direct：兼容迁移优先于新建约束，需继续 fail-closed；
- group story：是另一种 group container scope；
- 多 direct 角色：缺少 participant relation 模型；
- 列表数量：存在活跃的 characterId-only 边界遗漏；
- 删除：direct relation 清理基本完整，群参与者引用需要规则；
- Prompt：当前线下 story context helper 已禁用，没有发现活跃的 characterId-only story Prompt 泄漏，但未来重新启用必须带 relation scope。

在 CharacterEvent 之前，应该先完成 direct/group scope 统一、访问查询收敛、数量统计修复、同步 fail-closed 和删除测试。这样产生的 CharacterEvent 才有稳定且可解释的关系归属。
