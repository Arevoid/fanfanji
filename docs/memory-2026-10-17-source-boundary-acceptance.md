# 2026-10-17 再次逐项检查与业务闭环验收

本次继续使用 `refactor/memory-continuity`，HEAD 为 `d82a4ebf30929cc2b21d504e0feb278a7db82112`。所有改动保留在工作区，不提交、不推送。此前 Argon 收据是此前源码的历史证据；本次改动的最终检查结果以 `outputs/2026-10-17-memory-source-boundary-acceptance/validation-manifest.json` 为准。

## 本轮找到并补齐的事项

1. **实际提及未覆盖各业务入口。** 共同语义召回服务现在从正式仓库读取已经持久化的角色输出：私聊、共读、观影、日记、具体群、具体离线故事。生成候选、未发送回复、撤回内容和导入的旧故事上下文不算本轮实际提及。业务来源适配器为 `memoryReplySources.ts`；入口为 `semanticMemoryRecallService.ts`。
2. **乐观缓存不能证明保存成功。** 消息、共读增加不触发冷启动迁移的持久化读取接口；先等待现有写入，再读取实际 IndexedDB 结果。失败后即使写入器已消费错误，第二次读取也不能把失败缓存当成已保存。影院读取保留失败状态，避免把读取错误误判为删除全部记录。
3. **场景边界。** 私聊/共读/观影按同一精确关系的对话场景记录；日记、具体群、具体故事分别隔离。日记使用不等于告诉用户，故事叙述不等于角色现实中说过。来源修改或删除、群成员退出、故事删除会撤销对应使用记录。旧联系人副本只按已有 `profileSourceId` 映射，绝不按姓名合并。
4. **未开启向量的群聊遗漏。** 正式群聊管线现在也逐成员经过共同召回入口。统一结果替换旧的事实块，保留专属世界书和成员私有包装，避免双份记忆、预算叠加和把私聊提及状态套到群里。私有材料仍只供该成员的封闭 Awareness 决策；公开群回复请求不接收秘密。
5. **派生资料冷却遗漏。** 事实、摘要、主观认识、自身生活采用同一版本校验的提及记录。修复 `supplementary` 向量块被按 `claim` 命名空间查找而无法命中的问题；摘要和连续状态进入最终文本时带对应场景的使用提示，计入原有预算。冷却不会删除资料，也不阻止明确追问。
6. **旧摘要绕过来源检查。** 群聊不再直接拼接 `relationship.compressedMemory`；聊天/日记认知 Prompt 适配器也不再把原始旧摘要当作弱线索绕过统一召回。迁移后的摘要继续走来源、权限、忘记和预算检查，原始数据仍保留。马甲重生成不再带入主号关系私聊摘要。

## 按原始十四节复核

以下“完成”指已实现约定规则，并通过列出的有限验收；不代表任意模型、任意输入或数月生产运行都不会出错。完整原编号仍见 `memory-original-plan-reconciliation.md`，其中 M15 与旧摘要边界由本页补充。

| 原方案 | 实现及对应验收 |
|---|---|
| 1 架构与规则 | 模型候选经过来源及权限验证，业务服务提交；`memoryEvidenceAcceptance`、`memorySemanticReviewAcceptance`、依赖边界门 |
| 2 数据模型 | 来源、版本、时间、事实/事件/约定/认识/生活和任务分开；`memoryPerspectiveAcceptance`、`memoryReadFrameAcceptance` |
| 3 写入与自动整理 | 幂等任务、容量切分、失败进度、空结果复核；`memoryExtractionCapacityAcceptance`、`memoryValueJudgmentAcceptance`、`memoryCommittedOutputDurability` |
| 4 去重与修订 | 同来源幂等、跨来源事件关联、变化/纠错/条件/冲突分别处理；`memoryAssociationAcceptance`、`memorySemanticIdentityAcceptance`、`memorySemanticReviewAcceptance`；历史 Argon 冻结修订收据 |
| 5 认识与成长 | 独立证据、反证、历史、用户干预、有界可撤销行为；`memoryCognitiveRevisionAcceptance`、`memoryGrowthAcceptance`、`memorySparseInteractionAcceptance`；历史 Argon 正式写入收据 |
| 6 自己的生活 | 前台有界模拟、状态/目标/步骤/时段/结果连续；`memoryContinuousLifeStateAcceptance`、`memoryLifeScheduleAcceptance`、`memoryLifeOutcomeAcceptance`；历史跨入口生活收据 |
| 7 召回与自然使用 | 先权限/有效性再相关性，统一预算，实际输出提及及场景冷却；`semanticMemoryRecallAcceptance`、`memoryPersistentMentionAcceptance`、`memorySupplementaryMentionAcceptance`、本次真实 BGE 与定向自然回复 |
| 8 跨应用规则 | 私聊、群聊、明确导入故事、日记、阅读、观影；公开动态/论坛仅用公开来源及获准材料；`memorySurfaceIntegration`、`memoryGroupAwarenessAcceptance`、`memoryOfflineEntryAcceptance`、`memoryCrossAppScope`、`memoryLifePublicSharingAcceptance`、`memoryCommittedSurfaceMentions` |
| 9 来源生命周期 | 编辑/撤回/多证据/重生成/清理/忘记闭环；`memoryVersionDeletionAcceptance`、`memoryForgetClosureAcceptance`、`memoryCharacterCleanupAcceptance`、旧摘要反例、隔离删除 UI |
| 10 记忆库 UI | 三视图、来源历史、纠正、暂停、核心标记、搜索和备份、三字段向量设置；`memoryCenterUi`、`memoryTypedMaintenanceAcceptance`、`memoryVectorSettings`；隔离实际 UI 操作收据 |
| 11 迁移 | 一次确认、所有角色、可续做、无法归属保留、兼容读取和恢复；`memoryContinuityAcceptance`、`memoryOrganizationAcceptance`、`memoryMigrationCompatibilityAcceptance`、`memoryReadRollbackAcceptance`；隔离迁移/兼容 UI 与历史备份内存回放 |
| 12 实施与发布条件 | 不部署、不提交推送；失败不推进成功状态；多窗口单写者；本次全量检查与隔离双窗口收据 |
| 13 最小验收 | 原 60 项索引保留；本次新增持久化失败、跨入口实际提及、派生向量命名空间、旧摘要绕路反例，全部纳入自动发现的回归集合 |
| 14 发布标准 | 负例、旧/新冻结对照、真实模型与确定性/UI 证据分开；最终预算、权限、幂等和失败恢复断言；不将上述有限验收声称为生产长周期保证 |

## 证据类别与适用范围

- `memoryCommittedSurfaceMentions.test.ts`：正式仓库与共同入口的确定性验收；不调用模型。
- `memoryCommittedOutputDurability.test.ts`：隔离 fake-indexeddb 与注入写入失败；明确验证错误已消费后的第二次读取。
- `memorySupplementaryMentionAcceptance.test.ts`：合成向量验证真实索引文档命名空间、摘要最终 Prompt 与版本失效，不能冒充真实向量质量。
- `memory-committed-surfaces-browser-20261017.json`：独立 Chromium Context 中真实业务服务与 IndexedDB；不使用用户 Profile，不调用付费模型。它是浏览器集成检查，不是完整产品逐页 UI 验收。
- `memory-embedding-committed-surfaces-20261017.json`：本次真实 `BAAI/bge-m3` 十二项正负例，另含索引调用和缓存检查；仅合成资料。
- `memory-natural-source-boundary-argon-20261017.json`：本次正式观影请求构造器与当前测试模型的相关/无关两轮有限体验；仅合成资料。结果以实际收据为准。
- 本次重跑隔离记忆删除 UI、双窗口写入权切换、迁移兼容和生活时段 UI；原来的冻结模型对照、认识成长、跨入口生活及真实备份回放仍按原日期和模型引用，不重新命名为本次新测试。

公开动态和论坛依据各自公开历史、去重及公开材料边界运行；不为了统一私有提及存储而给它们访问私聊候选的权限。应用关闭后不常驻模拟。迁移恢复快照、明确导入的旧剧情快照和聊天原文按约定保留，不声称执行了全备份物理擦除。本轮没有导入、修改或上传用户真实备份，也没有运行真实用户迁移。
