# 2026-10-23 记忆优化实施与验收

范围：当前 `refactor/memory-continuity` 的本地工作区。HEAD 保持 `d82a4ebf30929cc2b21d504e0feb278a7db82112`。没有提交、推送或部署。保留开始时已有的未提交修改。

此报告覆盖本轮补齐及复验，不把之前日期的模型收据追认为本轮验收。确定性测试、真实模型定向测试、临时浏览器测试及真实备份内存回放分别记录。

## 阶段与验收入口

| 阶段 | 本轮实现或核验结果 | 验收入口 |
|---|---|---|
| 来源变更 | 删除、编辑、撤回、清空先提交证据失效和恢复意图，再持久化消息；失败可重放；保留其他独立证据；失效传播至派生认识 | memorySourceMutationRecovery、memoryVersionDeletionAcceptance |
| 重新生成 | 保留原回复至新回复生成且替换保存成功；替换失败不执行回复后的通话等动作；多选删除顺序等待保存，资源清理在删除成功后进行 | chatRegenerationHook、chatMessageMultiSelectDelete、memorySourceMutationRecovery、真实 behavior 收据的原时点场景 |
| 事实修订 | 变化与纠错分离，保留历史，其他对象不能覆盖；修复候选恢复请求的两种输出格式混用 | memorySemanticIdentityAcceptance、memorySemanticReviewAcceptance；semantic-fixed.json 的三个真实 Express 场景 |
| 无向量基础链路 | 无配置和停用均可提取、价值准入、保存重读、检索和最终 Prompt 注入；无向量请求；无关问题不塞入旧事实 | memoryWithoutEmbeddingPipeline、memoryDirectChat300Acceptance |
| 可选向量 | 可配置每日索引/查询/字符预算与暂停；后台分批续做；进度收进向量设置详情；补齐保留已有索引；失败保留本地检索 | memoryVectorCoverageAcceptance、memoryVectorSettings、semanticMemoryRecallAcceptance；真实 embedding.json |
| 日记记忆 | 同次日记生成可附主观反思；旧日记有界补整理；仅生成 inferred/belief，不修订客观事实；来源改删失效；记忆库不浏览日记正文 | diaryMemoryBoundaries；真实 surfaces.json 的正式日记入口 |
| 主观认识 | 证据主题、独立证据组、候选与正式修订、历史与用户干预标记、暂停和撤销保持 | memoryCognitiveRevisionAcceptance、memoryGrowthAcceptance；cognitive-argon.json |
| 连续生活 | 持久目标逐步推进，计划不冒充发生，生活暂停后不请求模型，公开分享仍需许可 | memoryContinuousLifeStateAcceptance、memoryLifeActivityAcceptance；life-fixed.json |
| 场景接入 | 私聊、重新生成、群聊知情边界、短信、电话/视频有效内容、线下新增量、阅读、观影、日记；公开面不接收私聊整库 | memorySurfaceIntegration、memoryGroupAwarenessAcceptance、memoryOfflineIncremental20261018、memoryCallBackground20261018；behavior/offline/surfaces.json |
| 旧数据迁移 | 同 ID 编辑采用最新版本，迁移途中删除不复活；保留原始版本快照；切换旧存储和完成状态一起提交；失败可续做 | memoryMigrationConcurrentEdit、completeMemoryMigration20261018、memoryContinuityAcceptance；backup-replay.json |
| 角色记忆 UI | 顶部返回与居中人物选择；可搜索的居中人物弹窗；只显示所选人物；身份分别记住选择；切换不残留旧人物动画；直接卡片与分类标签 | memoryCenterUi；独立浏览器 memory-current-ui-result.json |

私聊长期记忆条数最高 300，已选记录完整注入，不再叠加 4800 字符或 3000 Token 的记忆块上限。短期上下文仍属于近期消息，不作为独立长期记忆卡片展示。精炼/细腻设置控制表达，不能绕过来源、价值、权限和事实核验。

## 本轮实际发现并修复的问题

1. 来源变更忽略写入失败；重新生成在成功前删除原回复；批量删除并发触发导致只完成部分删除。
2. 派生记录的 supportingClaimIds 在规范化时丢失，无法可靠传播来源失效。
3. 同 ID 旧记忆被编辑后，迁移反复保留旧快照；迁移期间删除也可能重新生成旧记录。
4. 候选恢复输出约定同时出现顶层 factDecision 和 candidate 两种格式，模型会选错；现按任务分开输出格式。
5. 旧记忆关联目录包含当前记录自身，模型会返回无效的自关联；现为每条来源提供排除自身的候选编号。
6. 人物选择之前空 ID 被当作无筛选，且切换动画短暂保留另一人物卡片；现无选择不显示记录，人物切换立即替换整个动画容器。

## 证据位置与边界

- 全量确定性测试：工作区 `memory-final-test-results.log`，768/768 通过；其中存储失败日志是专项主动注入的失败，不是被忽略的测试失败。
- 类型检查、构建：`memory-final-lint.log`、`memory-final-build.log`。
- 最终代码再次执行无增量类型检查通过；`git diff --check` 通过；源码、脚本和文档未检出本轮密钥格式。
- 架构门禁：104 条历史许可边和 3 个历史环，无新增。
- release check、生产 smoke check 均单独执行。
- 真实模型收据位于工作区的同级目录 `memory-20261023-real`：`semantic-fixed.json`、`cognitive-argon.json`、`life-fixed.json`、`behavior.json`、`offline.json`、`surfaces.json`、`embedding.json`。
- UI：同级 `verify-memory-current-ui-20261023.cjs`、`memory-current-ui-result.json` 与对应截图。使用新建的临时 Playwright 上下文和专用 `127.0.0.4:3104` 合成资料，不操作真实浏览器 Profile。桌面浏览器控制工具本轮初始化失败，未声称完成右侧嵌入浏览器人工验收。
- 备份：`backup-replay.json`，仅原文件的内存副本、输出计数和 SHA256，不调用模型，不修改原文件。

模型验收过程中保留了失败诊断：小模型曾漏提取、返回不合规证据；235B 配置返回 HTTP 403。修复前失败不作为通过凭据，未降低证据核验门槛。不同收据使用不同已授权测试模型，不能称为同一模型连续全通过。

这些验收证明列明的实现和有限场景，不证明任意措辞必然召回、无限容量或数月无人干预运行；模型不合规时应保留资料、待核对或重试，不能伪造完成。
