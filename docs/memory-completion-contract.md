# 记忆重构逐项验收合同

> 本轮继续检查后补齐的正式入口、保存失败、使用冷却和旧摘要来源边界，以 `memory-2026-10-17-source-boundary-acceptance.md` 及其新收据为准。下方此前“当前交付”描述是历史快照，不能覆盖新修改。

> 当前交付状态以 `memory-2026-10-17-argon-acceptance.md` 和同日Argon交付目录为准；本页旧十阶段表保留历史，原60项场景另有逐项索引，不沿用旧的715/726项完成口径。

> 原始十四节方案的逐项复核以 `memory-original-plan-reconciliation.md` 和 `outputs/2026-10-16-memory-original-plan-review` 为准。本页十阶段表及715项收据属于此前快照，不能替代原始60项验收或证明后续修改。

> 2026-10-15 再次复核：下表此前的“实现与验收完成”已撤回，不能作为当前完成凭据。
> 已复现跨实体误覆盖、遗漏主题引用绕过成长门槛、事件接受依赖固定词、群成员截断、索引进度漏算历史计划等缺口。
> 2026-10-16 已补入上述反例并重新验收。当前证据以 `memory-2026-10-16-acceptance.md` 和 outputs/2026-10-16-memory-validation 为准；旧模型收据保留原日期与范围，不追认为当前模型全量验收。

基线 HEAD：d82a4ebf30929cc2b21d504e0feb278a7db82112。分支：refactor/memory-continuity。
本任务只修改工作区，不提交、不推送。原始用户备份不导入真实 Profile、不上传给模型。

2026-10-15：本表替代此前过早给出的完成标记。完成指正式调用、状态机制、失败保护和列出的验收均已落实；不把类型、Prompt、模拟回复或有限模型测试当作数月运行保证。最终执行结果以交付目录中的逐项报告、日志和 JSON 收据为准。

| 阶段 | 正式实现及产品行为 | 专项验收 | 完成口径 |
|---|---|---|---|
| 0 范围与基线 | 保留当前分支及已有修改；覆盖六项目标、十二个问题和迁移，各证据类别分别列明 | 本合同、交付报告、Git HEAD/工作区检查 | 实现与验收完成 |
| 1 来源与知情 | 作者、行动身份、实际参与者、获得渠道、陈述/事件时间及来源版本；不信任外部伪造的知情字段 | memoryEvidenceAcceptance、memoryPerspectiveAcceptance、memoryMediaArchiveAcceptance | 实现与验收完成 |
| 2 通用事实修订 | 既有提取请求携带有权限的实体/属性候选，模型作语义比较，运行时校验新旧原文、权限及置信度；区分重复、变化、纠错、不同条件、冲突、晚到历史及待核对；人工编辑可选择变化/纠错 | memorySemanticIdentityAcceptance、memoryVersionDeletionAcceptance、memoryReadFrameAcceptance；真实 Express 提取验收 verifyMemorySemanticIdentityProvider | 实现与验收完成 |
| 3 事件与约定 | 参与者、对象、地点、日期及明确引用形成事件身份；保留提议/接受/待定/改期/完成/取消/未履约；日期到期不证明完成 | memoryEventLifecycleAcceptance、memoryQueryConstraintAcceptance、verifyMemoryPlanProvider | 实现与验收完成 |
| 4 价值及保留 | 来源约束下评估影响、持久性、新颖性；低价值候选不入库但保留聊天；重点候选不自动置顶；核心需人工选择；普通过往资料90天归档，不物理删除 | memoryValueJudgmentAcceptance（含正式提取器）、memoryGrowthAcceptance、memoryContinuityAcceptance | 实现与验收完成 |
| 5 召回与预算 | 事实/经历/认识/生活向量化；按关系和来源过滤，实体/时间约束，近期上下文去重，完整记录预算；索引积压持久化、限额续做、失败降级、最终注入诊断 | semanticMemoryRecallAcceptance、memoryVectorCoverageAcceptance、memoryReadFrameAcceptance；真实 BAAI/bge-m3 及真实设置 UI | 实现与验收完成 |
| 6 持续认识 | 语义主题引用；召回旧依据；独立证据组加权，单次反例进入待观察，多次新经历才修订；行为维度有界且可撤销，角色认识与客观事实分离 | memoryCognitiveRevisionAcceptance、memoryGrowthAcceptance；verifyMemoryCognitiveStateProvider | 实现与验收完成 |
| 7 连续生活 | 应用可见时独立于聊天页运行；跨目标精力/压力、习惯、兴趣、烦恼、日程及步骤；结果必须符合当前步骤；NPC仅获已授权的共同事件；可暂停，无关闭应用后的伪造经历 | memoryLifeActivityAcceptance、memoryContinuousLifeStateAcceptance；verifyMemoryOrganizationLifeProvider | 实现与验收完成 |
| 8 全入口 | 私聊、重新生成、群聊、明确导入的离线剧情、日记、阅读、观影；群成员独立知情，启用向量后逐成员语义召回；公开动态/论坛不读私聊资料；IF/导演分支未导入时隔离 | memorySurfaceIntegration、memoryGroupAwarenessAcceptance、memoryOfflineEntryAcceptance、memoryCrossAppScope；真实行为矩阵、日记/阅读/观影/离线回复及隔离 UI | 实现与验收完成 |
| 9 UI/迁移 | 三视图、来源/价值/修订/计划历史、认识纠正与暂停、生活暂停、向量三字段和模型列表、管理/搜索/备份；一次确认处理所有角色，基础迁移与语义整理分别显示进度，失败可续做 | memoryCenterUi、memoryVectorSettings、memoryOrganizationAcceptance、memoryAssociationAcceptance、memoryContinuityAcceptance；隔离 UI、真实备份副本回放 | 实现与验收完成 |

## 六项目标与十二个问题的对应

- 真正长期记忆：阶段2/3/5；5000条干扰和1000条同主题竞争的确定性验收，3000条记录后的真实模型约定召回，真实向量改述召回。
- 更新而非堆积：阶段2；真实变化保留历史，原先记错则撤销错误版本；相同属性不同条件不强行覆盖。
- 主观认知：阶段6；明确是可能误解的看法，不作为事实。单次反例不足以推翻长期认识。
- 自己的生活：阶段7；持久状态与目标推进，前台有界模拟，不承诺后台常驻社会或关闭应用后运行。
- 时间、关系、信息边界：阶段1/3/5/8；已发生、计划、转述、推测分开；角色身份、关系身份不由模型判断自动改变。
- 自然使用：阶段5/6/8；相关时影响表达，无关时不注入，近期已有内容不重复；定向真实回复不复述内部标签。
- 问题1/5/6：长期召回、排序、精度对应阶段4/5及真实行为矩阵。
- 问题2/3/7：更新、去重、过去与现在对应阶段2/3；历史时点重生成不读后来事实或后来形成的认识。
- 问题4：价值过滤对应阶段4；长度短不能成为删除实体事实的理由。
- 问题8/9：来源权威、不同角色隔离对应阶段1/8；公共并发请求不能加入私有召回结果。
- 问题10：记忆影响认识/信任/表达对应阶段6，暂停或撤销依据能撤去影响。
- 问题11：成本与预算对应阶段5/7；不把整库、全部生活状态或无限历史拼进每轮请求。
- 问题12：来源编辑、撤回、删除的依赖失效对应阶段1/2/9；删除旧值不误删新值，新的独立后续陈述可以重新学习。

## 证据分级及可复现入口

1. *.test.ts 为自动发现的确定性测试；模拟向量/模型明确不算真实模型证明。
2. verifyMemory*Provider.ts 和 verifyMemoryAllKindsEmbedding.ts 是显式执行的付费验收，自动测试不会调用它们。只读取用户提供的本地私密配置，使用合成资料。
3. verifyMemoryCompletionProvider.ts 聚合当前语义、认识、生活、行为、跨应用和离线真实验收。需要本地服务地址和单独的收据输出路径；不能用旧的“单次反例立即覆盖”测试证明成长。
4. 浏览器验收使用临时隔离上下文，挂载真实组件；不操作用户真实浏览器 Profile。它证明列明的页面操作，不代表完整真实用户日常验收。
5. verifyMemoryBackupReplay.ts 只回放真实备份的内存副本，输出计数和 SHA256；这不证明未知的所有历史备份格式都兼容。
6. 类型、全量回归、依赖边界、构建、release 和生产冒烟均须通过。原始备份校验、密钥扫描和 Git 未提交/未推送检查单独留证。

## 必须保留的产品规则

不确定就待核对，不强行合并；核心仍须相关才能召回；旧数据不因整理升级为已确认事实；基础迁移完成不等于语义整理或索引已覆盖全库。界面分别显示积压、失败和待核对。

模型服务失败、离线、限流时保留原记录，并以本地检索或中性表达降级。每次前台反思和整理、每天索引及查询均有预算；群聊全部成员逐一隔离判断，共享回应只接收封闭行动选项，成本随成员数增长。前台预算不等于供应商最终计费额度，供应商可能另计推理 Token。

本轮有限的定向模型体验、逻辑日期推进和临时 UI 验收，不声称证明任意改述100%召回、无限数据容量或几个月真实运行效果。模型仍可能输出错误，权限和来源保护在运行时执行。
