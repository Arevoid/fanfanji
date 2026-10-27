# 2026-10-18 记忆分类与质量改造验收

后续真实备份复查发现手机外壳弹窗样式及迁移分类流程的漏测，已另行修复，见 `memory-2026-10-18-migration-followup.md`。本页的 742 项与源码指纹是前一轮快照的记录，不能解释为真实用户旧资料已全部分类完成。

本轮按最近确认的分类、准入、通话和线下增量方案实施，沿用 `refactor/memory-continuity`。没有暂存、提交、推送、部署，没有打开真实浏览器 Profile，也没有执行真实用户数据迁移。此前验收文档属于历史证据，本轮重新运行针对当前行为的检查。

## 实现与证据对应

| 规则 | 正式实现 | 本轮验收 |
|---|---|---|
| 六类分类、同一实体多入口引用 | `memoryGallery.ts`、`AppMemory.tsx`、`MemoryContinuityPanel.tsx` | `memoryGallery20261018.test.ts`；实际 AppMemory 手机/桌面浏览器，六个入口均能进入和返回 |
| 摘要作背景、原子记忆不重复平铺 | `relatedMemorySummaries`、旧资料入口、卡片折叠回顾 | 同上浏览器：摘要默认不可见，展开可见；待整理赞叹不出现在共同经历 |
| 没有价值判断不自动授予正式资格 | `knowledgeValueAssessment.ts`、`MemoryExtractor.ts`、`knowledgeTemporalPolicy.ts` | `memoryAdmissionQuality20261018.test.ts`；真实模型冻结赞叹、笑声、持续恐惧及纯设定复述四例 |
| 不混合待核实与正式记录，不因重复解除暂停 | `knowledgeConflictPolicy.ts`、`knowledgeEvolution.ts`、`semanticFactResolution.ts`、`knowledgeEventPolicy.ts` | 准入专项；原有事实修订、事件生命周期和来源回归重新运行 |
| 人设/世界书纯复述跳过；真实新经历保留；冲突待核对 | `memorySettingReviewService.ts`，接入私聊、手动总结、线下、多人线下和旧资料整理 | `memorySettingReview20261018.test.ts`；真实模型四例；跨关系设定在发送前排除 |
| 角色认知和生活连续性继续使用既有持久化与来源约束 | `characterContinuityService.ts`、`characterContinuityRuntime.ts` | 当前全量测试中的语义主题修订、独立复核、旧证据重评、生活目标续篇、时段、NPC 授权与删除回归；并非数月真实使用观察 |
| 电话/视频按保存的转写提取，不把时长制造成事实 | `useChatMemoryExtraction.ts`、`completedCallMemoryService.ts`、`messagePromptSerializer.ts` | `memoryCallArchive20261018.test.ts`；`memoryCallBackground20261018.test.ts`；浏览器实际通话后台 Hook 写入 |
| 离开聊天仍可处理完成通话 | 应用级前台后台任务每 30 秒检查一条，持久化任务锁与聊天页共用 | 无聊天组件的后台专项：隐藏应用零调用、成功幂等、处理中改来源不提交 |
| 通话任务不越过普通聊天归档游标 | `preserveArchiveCursor`，独立应用后台服务不操作普通游标 | 实际浏览器 Hook：前面存在未总结普通消息，游标回调为零 |
| 续写退出只提取新增/修改内容 | `offlineMemorySync.ts`、`useOfflineStoryMemorySyncActions.ts`、`useOfflineStoryExitFinalization.ts` | `memoryOfflineIncremental20261018.test.ts`；浏览器正式退出与同步 Hook：来源窗口为 m1、m2、m2，无新增不请求 |
| 退出先保存，失败不假完成，处理中编辑可重试 | 同上；提交前核对消息版本、归属和故事存在性 | 实际 Hook：处理中编辑使本次失败，不推进游标，重试只处理变更消息；只查看旧剧情退出回归 |
| 增量摘要保留此前已接受内容 | `offlineStorySummaryClaims` 按故事及精确作用域汇总已接受原子条目 | 与增量 Hook 一同验证；旧剧情不会为重建背景再次发送到模型 |
| 日记只作写作记录，不默认成为记忆及成长证据 | `getMemoryDiaryHistory`、`filterRecallableKnowledge` 的递归排除、向量准入及成长证据过滤 | `memoryDiaryBoundary20261018.test.ts`：日记、两层派生、派生摘要全部排除；明确分享的独立来源不受此排除 |
| 私聊最高 300 条，无额外 4800 字符/3000 Token 裁剪 | 召回设置、主回复/重生成/主动消息的 `unboundedMemory`、最终格式化；费用预估同步采用条数策略 | `memoryDirectChat300Acceptance.test.ts`：300 条完整尾部均存在，不填满、不越身份；原调用入口回归 |
| 精炼/细腻只改变显示方式 | 提取协议统一使用事实提取，兼容展示不采用新增日记式改写；卡片简短/完整展示 | `offlineStorySummary.test.ts` 新展示契约；切换只保存角色设置，无模型请求 |
| 已迁移旧资料继续质量整理，保留原文 | `maintainStoredMemories`、`memoryOrganizationService.ts`；未知价值进入核对状态 | `memoryOrganizationRetry20261018.test.ts`、组织/关联/旧版本投影及迁移全量回归 |
| 空输出/未判断价值不推进整理游标 | 同上，片段保留，按日预算重试；同一版本三次无法判定后停止自动付费重试 | 整理重试专项：原文不变、游标不越末尾、可重试、有上限；独立设定冲突不会被原地更新覆盖 |
| 普通界面不展示内部来源 ID、可信度百分比与混合类型前缀 | 卡片与详情使用原话、可信提示、重要性文字、变化前后记录；旧资料原文单独保存 | AppMemory 隔离浏览器与 UI/模型专项；运行诊断仍在专用管理入口 |

## 真实模型与浏览器证据边界

- `memory-setting-provider-20261018.json`：Argon，1 次真实请求，四例设定核对。
- `memory-admission-provider-20261018.json`：Argon，2 次真实请求，四例真实提取及准入。
- `memory-natural-provider-20261018.json`：2 次真实请求，正式观影请求函数，相关话题自然关心，无关话题不注入。
- `memory-embedding-provider-20261018.json`：BAAI/bge-m3，13 次真实请求，1024 维，12 个正反例通过。
- `memory-gallery-20261018.json` 及手机/桌面截图：实际 AppMemory，合成数据，阻断模型接口。
- `memory-offline-incremental-20261018.json`：实际 React 退出/同步 Hook 与真实浏览器存储，提取响应模拟；不是实际模型验收。
- `memory-call-worker-20261018.json`：实际 React 通话任务与真实浏览器存储，提取响应模拟。

以上产物在工作区 `outputs` 下；测试配置和密钥保存在仓库外。所有真实模型请求仅使用本轮冻结的合成数据，没有发送用户备份。有限定向验收不能证明每种模型在任意自然语言、数月真实使用中绝无误判；产品会保留核对状态，而不会伪装确定性。

## 发布检查

冻结源码的最终全量回归为 **742/742 通过，146.7 秒**。源码（src、scripts、构建配置与依赖清单）冻结前后 SHA-256 一致：`935b3b04e5ecdcb9e19902e0f1085da03dcdd14f80e04fcc3db4be8818be9d17`。

- TypeScript、生产构建、发布资源检查、生产启动/健康接口/CSP 烟测全部通过。
- 依赖方向门槛通过：104 条既有边界、3 个既有环，无增加。
- 密钥扫描通过，没有把测试 Key 写入仓库或交付资料。
- Git 分支仍为 `refactor/memory-continuity`，HEAD 仍为 `d82a4ebf30929cc2b21d504e0feb278a7db82112`；暂存文件数为零，没有提交或推送。
- 真实备份仅做只读哈希复核，没有导入、迁移或发送；SHA-256 保持 `f5277721c010493b5572c858762a6ab1dfcc4bdffbdedbd3d999836bfc5128b5`。

安全检查通过项目现有的高危门槛，但 npm audit 报告 `sprintf-js → argparse → mammoth` 链上三个中危受影响包（同一精度格式拒绝服务问题及其传递依赖）。本轮 `package.json` 与锁文件没有修改；未执行会将 mammoth 降到不兼容旧版的强制修复。构建还保留现有的大体积包提示，构建没有失败。这两项没有被记作记忆功能的失败，也没有隐藏。

交付目录为 `outputs/2026-10-18-memory-quality-acceptance`，含当前回归日志、真实模型回执、隔离浏览器回执和截图、源码指纹及带文件哈希的 `manifest.json`。资料的“待核对/跳过/暂停”是受支持的最终状态；“已完成”表示本轮约定实现与对应验收已完成，不表示将未知资料伪装为已确认事实。
