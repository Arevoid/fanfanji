# 原始方案重新逐项核对（2026-10-16）

> 最新补充见 `memory-2026-10-17-source-boundary-acceptance.md`：M15 的实际持久化输出现覆盖私聊、共读、观影、日记、具体群及具体故事；新增保存失败、摘要向量命名空间、旧摘要绕路反例。原编号索引保持可查，不能把历史收据混作本轮新证据。

> 2026-10-17 Argon恢复后的最终验收见 `memory-2026-10-17-argon-acceptance.md`。以下原编号索引继续有效，各旧阶段、失败与阻断状态保留为历史，不替代最终源码和收据。

> 2026-10-17继续补全：此前“全部完成”的口径再次撤回。当前进展、冷却与彻底忘记闭环，以及尚未通过的扩展真实模型门，以 `memory-2026-10-17-followup.md` 为准。以下保留原核对过程和历史收据，不作为新源码的最终完成证明。

本轮基于用户重新提供的原始十四节方案，而不是此前缩写的十阶段合同。**撤回“原方案全部完成”的推断**；715 个回归文件通过、八项定向回复通过，只能证明各自范围。旧交付目录保留为当时源码快照，不作为之后源码的完成凭据。

## 已确认并修补的遗漏

1. L04：此前生活状态有目标/步骤，没有可执行的活动时段冲突规则。现新增受限的明确时段及可选地点，正式前台提交再次检查同一角色/身份是否重叠。未来预约不能提前完成，复核授权不能绕过此限制，旧记录无时段仍保持未知。专项 `memoryLifeScheduleAcceptance.test.ts` 包含真实前台服务提交，非源码字符串检查。
2. M15：此前短中文事实少于八字不做近期上下文精确去重。现缩到四字，仍不以同一话题误删知识；共读把实际已发送的最多八条、每条1200字的讨论传入同一去重入口。专项 `memoryMentionCooldownAcceptance.test.ts` 证明近期窗口内的精确重复和追问接续，**不声称是跨改述的语义提及分类器或跨所有入口的持久冷却**。
3. 发布对照：新增冻结的最终文本评测和 HEAD Git tree 只读比较。v1 的无关项只检查特定旧事实未出现，未测整个记忆块为空，因此保留v1收据并将严格零注入列入v2。v2六项当前实现全部通过；基线无关问题注入195字，当前为0。该对照只覆盖确定性召回与最终文本，不能冒充提取、认识、自然表达的完整模型评测。

## 原编号证据索引和继续检查位置

以下是重新查证的入口，文件存在不等于所有子条件已经证明，须逐个读取断言并核对正式调用。

| 编号 | 已有专项入口 | 进一步检查 |
|---|---|---|
| M01–M02 | memoryEvidenceAcceptance、memoryAssociationAcceptance、memorySemanticIdentityAcceptance | 同来源幂等与跨来源同事件，勿将模型判断测试当作写入测试 |
| M03–M05 | memoryContinuityAcceptance、memoryQueryConstraintAcceptance、memoryFrozenEvaluation、真实行为矩阵、真实BGE | 代称歧义、最终文本和正负例分开 |
| M06–M07 | memoryValueJudgmentAcceptance、memoryContinuityAcceptance | 候选超限和高价值空结果重试，后部范围与失败进度 |
| M08–M11 | memorySemanticIdentityAcceptance、memorySemanticReviewAcceptance、memoryVersionDeletionAcceptance、memoryReadFrameAcceptance | 状态修订完整链，不仅新增候选 |
| M12–M14 | memoryEventLifecycleAcceptance、memoryQueryConstraintAcceptance、chatLongTermRecallBudget、真实约定生命周期 | 到期不完成、预算竞争与历史状态 |
| M15 | memoryMentionCooldownAcceptance | 跨改述提及、跨入口持续冷却仍须核对 |
| M16 | semanticMemoryRecallAcceptance、memoryVectorCoverageAcceptance | 降级不绕过权限及预算 |
| C01–C07 | memoryCognitiveRevisionAcceptance、memoryGrowthAcceptance、memoryTypedMaintenanceAcceptance、真实认识收据 | 短回复/未回复不得确证冷淡；旧模型证据不混称当前模型 |
| L01–L03 | memoryContinuousLifeStateAcceptance、memoryContinuityAcceptance、memoryCompletionAcceptance | 跨入口一致及关闭后有界补齐 |
| L04 | memoryLifeScheduleAcceptance | 新增时段的UI展示、当前模型定向验收 |
| L05–L06 | memoryLifeActivityAcceptance、memoryLifeSemanticResultAcceptance、memoryCompletionAcceptance | 用户参与禁造、失败取消非完成 |
| P01–P06 | memoryCrossAppScope、memoryGroupAwarenessAcceptance、memoryOfflineEntryAcceptance、memoryReadFrameAcceptance、memoryPerspectiveAcceptance | 显式传播及撤销是独立条件，不以禁止一切分享代替 |
| D01–D07 | memoryEvidenceAcceptance、memoryVersionDeletionAcceptance、memoryReadFrameAcceptance、memoryTypedMaintenanceAcceptance、memoryContinuityAcceptance | 来源编辑、外观字段、多证据、重生成失败、忘记抑制与全入口暂停 |
| R01–R06 | memoryContinuityAcceptance、memoryTypedMaintenanceAcceptance、memorySemanticReviewAcceptance、任务/存储专项 | **尤其补查真实多窗口版本冲突，不把单窗口过期响应测试等同跨窗口** |
| T01–T07 | memoryContinuityAcceptance、memoryOrganizationAcceptance、memoryBackupReplay及隔离UI | 各阶段完成标记、并发新增、坏数据、恢复失败分别证明 |
| T08 | 迁移快照保留、memoryStoreTransaction、旧读实现 | **需验证旧读取路径恢复可用且新记录保留；只有快照存在不算完成** |
| U01–U04 | memoryCenterUi、memoryTypedMaintenanceAcceptance、memoryTypedMaintenance UI、memory-ui-acceptance | UI实际操作，不能仅用源码正则或组件挂载替代完整流程 |

## 重新核对时的待办（历史记录，后续处理见下节）

- 原编号逐项断言和正式入口映射尚在核查，不能沿用缩写合同的全部完成标记。
- 持久提及冷却及实际提及/仅被注入的区别，需要继续检查；当前新专项只证明近期窗口精确去重。
- 多窗口更新和旧路径回退的独立验收尚未补齐。
- 冻结评测仍需覆盖提取、时间判断及自然表达等模型效果，当前六项只是确定性子集。

工作继续使用 refactor/memory-continuity；不提交、不推送，不操作真实用户 Profile 或真实迁移。

## 本轮继续补齐和复验

- M07/R02：达到24条候选容量时按精确来源范围拆分，不把饱和结果当完整归档；所有语义复核按12条分组处理。单条来源仍饱和或复核请求失败则保留待处理状态，单次恢复最多8次逻辑调用。见 `memoryExtractionCapacityAcceptance.test.ts`。
- 时间修订：真实冻结评测发现“从现在起改名，以后不用旧名”被其中“以后”误判未来计划。新增独立复核的当前生效授权，仅允许原始现在时事实变更恢复当前状态；假设、未来愿望和无复核结果不能绕过。见 `memorySemanticTemporalAcceptance.test.ts`。失败收据保留。
- C02/C07：一千条简短应答、缺失回复不能支持冷淡/不信任的认识，信任不按消息数量上涨。见 `memorySparseInteractionAcceptance.test.ts`。
- L01/L06：同一持久生活经历通过正式生成进入聊天、日记和明确授权后的动态；公开请求不包含私聊秘密。失败步骤有硬性否决，独立模型误判也不能记为成功，取消保留为取消。见 `memoryLifeOutcomeAcceptance.test.ts`、`memoryLifePublicSharingAcceptance.test.ts`、`memory-life-surfaces-20261016.json`。
- P03：离线群聊的第五位及后续成员也逐个进行隔离知情判断，不再被前四人上限跳过。见六成员 `memoryOfflineEntryAcceptance.test.ts`。
- R05：浏览器原生 Web Lock 确保一个可写窗口，第二窗口显示只读状态，不调用反思/向量写入；关闭主窗口后刷新接管。真实双窗口收据 `memory-multi-window-20261016.json`。不支持 Web Locks 的浏览器明确只读；旧版本窗口需要关闭，不能宣称旧客户端遵守新锁。
- T08：当前应用可按身份切换旧本地排序路径，继续执行当前来源、权限、有效性和预算检查；兼容路径不调用向量；切回完整检索不丢新资料。可单独恢复适合旧读者的原记忆卡，不复活暂停/忘记/已替代内容。见 `memoryReadRollbackAcceptance.test.ts`、`memoryMigrationCompatibilityAcceptance.test.ts`、隔离 UI 收据。
- 删除清理：关系清理保留角色自己的生活；删除角色清除其生活、认识、任务及所有提供商索引。多库写入失败原状保留；IndexedDB清理失败有持久待办并自动重试；其他角色和阅读资料保留。见 `memoryCharacterCleanupAcceptance.test.ts`。
- U01：过时 UI 认识编辑被拒绝，不能覆盖新看法或复活已删除认识。见 `memoryTypedMaintenanceAcceptance.test.ts`。

M15采用原方案的近期上下文抑制：事实已在实际近期文本中时不重复注入，明确追问仍可使用近期事实；同话题本身不排除召回。没有建立跨改述的永久“已经说过”数据库，也没有把“进入Prompt”标记成“模型实际提及”。这是当前产品边界，不是持续语义提及识别的完成声明。

## 原始60项验收映射

以下文件均位于 `scripts/`，省略 `.test.ts` 后缀。它们是确定性业务/状态验收；含模拟模型的断言不计作真实模型证据。真实模型、向量和隔离 UI 收据另列，不能相互替代。

| 编号 | 可复现验收入口 |
|---|---|
| M01 | memoryContinuityAcceptance、memoryEvidenceAcceptance |
| M02 | memoryAssociationAcceptance、memoryEventLifecycleAcceptance |
| M03 | memoryContinuityAcceptance、memoryFrozenEvaluation |
| M04 | memorySemanticIdentityAcceptance、memoryQueryConstraintAcceptance、semanticMemoryRecallAcceptance |
| M05 | memoryFrozenEvaluation、memorySurfaceIntegration |
| M06 | memoryValueJudgmentAcceptance、memorySparseInteractionAcceptance |
| M07 | memoryExtractionCapacityAcceptance |
| M08 | memorySemanticIdentityAcceptance、memoryReadFrameAcceptance |
| M09 | memorySemanticIdentityAcceptance、memorySemanticReviewAcceptance |
| M10 | memoryVersionDeletionAcceptance、memoryLegacyStateProjectionAcceptance |
| M11 | memorySemanticReviewAcceptance、memoryReadFrameAcceptance |
| M12 | memoryEventLifecycleAcceptance、memoryQueryConstraintAcceptance |
| M13 | memoryEventLifecycleAcceptance |
| M14 | chatLongTermRecallBudget、memoryReadFrameAcceptance |
| M15 | memoryMentionCooldownAcceptance；真实行为矩阵自然关心样本 |
| M16 | semanticMemoryRecallAcceptance、memoryVectorCoverageAcceptance |
| C01 | memoryCognitiveRevisionAcceptance、memoryGrowthAcceptance |
| C02 | memorySparseInteractionAcceptance |
| C03 | memoryCognitiveRevisionAcceptance、memoryGrowthAcceptance |
| C04 | memoryGrowthAcceptance、memoryVersionDeletionAcceptance |
| C05 | memoryTypedMaintenanceAcceptance、memoryGrowthAcceptance |
| C06 | memoryCognitiveRevisionAcceptance、memoryContinuityAcceptance |
| C07 | memorySparseInteractionAcceptance、memoryGrowthAcceptance |
| L01 | memoryContinuousLifeStateAcceptance；真实跨入口生活收据 |
| L02 | memoryCompletionAcceptance、memoryContinuityAcceptance |
| L03 | memoryContinuousLifeStateAcceptance、memoryContinuityAcceptance |
| L04 | memoryLifeScheduleAcceptance；隔离时间地点 UI |
| L05 | memoryCompletionAcceptance、memoryLifeActivityAcceptance |
| L06 | memoryLifeOutcomeAcceptance |
| P01 | memoryCrossAppScope、memoryContinuityAcceptance |
| P02 | memoryCrossAppScope、memorySurfaceIntegration |
| P03 | memoryGroupAwarenessAcceptance、memoryOfflineEntryAcceptance |
| P04 | memorySurfaceIntegration、memoryCrossAppScope、memoryLifePublicSharingAcceptance |
| P05 | memoryPerspectiveAcceptance、memoryLifePublicSharingAcceptance |
| P06 | memoryEvidenceAcceptance、memoryPerspectiveAcceptance、memorySemanticReviewAcceptance |
| D01 | memoryVersionDeletionAcceptance、memoryContinuityAcceptance |
| D02 | memoryVersionDeletionAcceptance |
| D03 | memoryVersionDeletionAcceptance、memoryGrowthAcceptance |
| D04 | memoryVersionDeletionAcceptance |
| D05 | memoryReadFrameAcceptance、memoryVersionDeletionAcceptance |
| D06 | memoryContinuityAcceptance、memoryTypedMaintenanceAcceptance |
| D07 | memorySurfaceIntegration、memoryGrowthAcceptance、memoryContinuityAcceptance |
| R01 | memoryContinuityAcceptance、memorySemanticReviewAcceptance |
| R02 | memoryExtractionCapacityAcceptance、memoryContinuityAcceptance |
| R03 | memoryCharacterCleanupAcceptance、memoryTypedMaintenanceAcceptance、memoryContinuityAcceptance |
| R04 | memoryContinuityAcceptance、memoryOrganizationAcceptance |
| R05 | 真实双窗口 memory-multi-window-20261016.json；memoryTypedMaintenanceAcceptance |
| R06 | memoryContinuityAcceptance、memorySemanticReviewAcceptance |
| T01 | memoryContinuityAcceptance；隔离迁移 UI |
| T02 | memoryContinuityAcceptance、memoryOrganizationAcceptance；真实备份内存回放 |
| T03 | memoryContinuityAcceptance、memoryOrganizationAcceptance |
| T04 | memoryContinuityAcceptance、memoryOrganizationAcceptance |
| T05 | memoryContinuityAcceptance、memoryOrganizationAcceptance |
| T06 | memoryContinuityAcceptance、memoryMigrationCompatibilityAcceptance |
| T07 | memoryContinuityAcceptance、memoryOrganizationAcceptance；隔离迁移 UI |
| T08 | memoryReadRollbackAcceptance、memoryMigrationCompatibilityAcceptance；兼容切换 UI |
| U01 | memoryTypedMaintenanceAcceptance、memoryCenterUi；隔离实际操作 UI |
| U02 | memoryCenterUi、memoryGrowthAcceptance；三视图隔离 UI |
| U03 | memoryContinuityAcceptance、characterTruthMigrationBackupRoundTrip |
| U04 | memoryOrganizationAcceptance、memoryVectorCoverageAcceptance；进度和失败隔离 UI |

## 冻结真实模型比较结果

冻结样本文件：`scripts/fixtures/memoryFrozenProviderCases.ts`。基线采用 HEAD Git tree，模型均为用户确认的 `[反重力]gemini-3.8-flash`。不重新编写样本来使结果通过。

初次整体收据 `memory-frozen-provider-comparison-20261016.json` 保留失败：旧实现改名/纠错状态链未建立；当前 E01 也曾失败。修复后分项复测：E01见 `memory-frozen-provider-current-final-20261016.json` 中成功的单项（文件整体仍是未完成批次，不能标成整批通过）；E02、E03、B01各有独立通过收据；B02/B03在接口恢复后见 `memory-frozen-provider-B02-B03-resume-20261016.json`。中间502/429属于请求失败，不算能力通过。六项合并只表示这六个冻结样本的各项复验通过，不代表一轮连续请求全部成功或数月产品运行保证。

本轮最终回归及构建收据以交付清单为准，不能沿用此前715项快照。工作区不提交、不推送，用户真实备份和浏览器数据未迁移。
