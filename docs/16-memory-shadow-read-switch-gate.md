# Stage 4B-4：Memory shadow read-switch evidence gate

日期：2026-09-09  
审计基线：`2147480b90bc0c0d8ca884600d6816732d90d079`
分支：`refactor/v2-architecture`

本阶段只做证据审计和运行条件验证，不改变 production Memory read path、Prompt、存储格式、Truth retrieval、legacy retrieval、Regenerate 或用户数据。

## 1. 运行条件与真实样本结论

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| Vite/dev server | 可启动 | `npm run dev` 后 `http://127.0.0.1:3000/healthz` 返回 200，shell 返回 200 |
| 交互式浏览器 | 不可用 | Codex CUA 初始化因系统 kernel assets 路径缺失失败；本机未发现 `msedge`、Chrome、Chromium 或 Playwright 依赖 |
| Normal Direct Chat | 未运行 | 没有可用的 UI 驱动，因此没有输入真实用户消息 |
| collector 启用 | 无安全入口 | `configureDirectChatMemoryShadowDiagnostics` 仅在测试中调用；production AppChat 只读取其返回值，不主动开启 collector |
| 真实 shadow report 数 | **0** | 没有把合成 fixture、静态分析或 HTTP smoke 当作真实报告 |

因此登记独立验证债务：`REAL_MEMORY_SHADOW_REPORTS_BLOCKED`。它与既有 `DIRECT_CHAT_BROWSER_SMOKE` 分开：前者特指真实 Memory shadow report 没有产生，后者是更广义的浏览器 smoke 未完成。没有继续重试浏览器环境，也没有修改生产代码来制造 debug 开关。

Vite HTTP 健康检查证明开发服务能启动，但不证明 React UI、Normal Direct Chat、消息交付或 collector 在浏览器中工作。

## 2. 合成证据与真实证据的分离

现有 Stage 4B-3 专项测试保留为 characterization tests，不是线上 telemetry：

- 11 个行为检查：exact Truth、Truth/Summary authority、canonical legacy mirror、missing scope、live-source duplicate、superseded temporal、budget，以及 relation/identity/conversation 三个隔离维度和 missing provenance。
- 其中明确观察到的 status：`equivalent`、`authority_difference`、`expected_legacy_difference`、`scope_difference`、`temporal_difference`、`budget_difference`；合成 live-duplicate/provenance 场景只证明诊断原因被记录，不能推导真实频率。
- collector 测试开启显式 debug 后提交 3 次合成观察，`maxReports=2`，最终只保留最近 2 条；这是 bounded-buffer 断言，不是实际用户会话数量。
- 合成报告只保存 scope、opaque IDs、kind/count/character estimates 和差异分类；测试确认不含 memory body、Prompt、完整 response、API key、Authorization，也不访问 localStorage、IndexedDB、网络或 provider。

真实运行所要求的整体报告数、`equivalent/%`、`equivalent_by_source`、各 mismatch status/reason、production/shadow/matched/source-equivalent/prod-only/shadow-only record counts、legacy mirror/live duplicate/missing scope/budget 频率，均为 **N/A（real sample=0）**，不能用合成数据填充。

真实性能数据也不可得：没有 comparator/report 的真实耗时、真实 dataset record count；由于没有真实 UI turn，provider/network request 计数和 storage read 计数也不能宣称为运行结果。静态安全检查只证明 shadow comparator/collector 本身没有 storage、network 或 provider 调用。

## 3. Normal Direct Chat production selection metadata 审计

当前 normal Direct Chat 的 Truth 路径为：

`AppChat` → `contributeDirectReplyTruthContext` → `retrieveTruthForPrivatePrompt` → `formatTruthRetrievalForPrompt` → `characterContextText` → `prepareDirectReplyTurn` / `requestDirectChatTurn`。

`buildDirectChatProductionMemorySelection` 只把 Truth projection claims 和 ConversationSummary 映射为 production selection metadata，并提供 `kind`、opaque `id`、source IDs、authority、scope、temporal/status、recordedAt 和 content length。它不接收或返回原始 legacy `MemoryItem` 的完整选中列表。

`TruthRetrievalResult.shadowedLegacyMemoryIds` 只提供来自 legacy-memory claim source 的 source-record IDs；它不是“本次 Prompt 实际选中的 legacy Memory record 列表”，也没有在当前 normal Direct Chat observation point 形成完整的 legacy selection ledger。

当前 normal direct reply 的 `memoryShadowDiagnostics` 输入只传入已加载的 `memories`，并在 `AppChat` 的 normal send observation point 调用；Regenerate 没有接入真实 collector。`buildChatPromptContext` 明确以 `maxFacts: 0`、`relevantMemoryIds: []` 避免把 cognitive snapshot 的 legacy facts 再渲染一遍。legacy-shaped 内容仍可能通过明确的 offline handoff、关系压缩字段或其他 feature-owned block 进入 prompt；这些不是本阶段可据此切换的统一 legacy production selection metadata。

结论：**当前可以审计 Truth/summary 生产选择的 metadata，但不能仅凭现有结果对象完整回答“normal Direct Chat 生产 Prompt 使用了哪些 legacy Memory IDs”。** 若将来需要该事实，应另行批准最小只读 metadata seam；本阶段不添加。

## 4. 规则与风险审计

### 4.1 Authority / scope / temporal / budget

- 合成 Truth-vs-Summary 场景证明 Truth authority 差异会被标出，不代表真实流量中没有 authority inversion。
- relation、identity、conversation exact-scope fixture 均保持隔离；missing-scope legacy fixture 被明确拒绝并记录。没有真实样本，不能把 scope leakage 风险降为零。
- superseded claim 和 budget boundary 均有显式 synthetic diagnostics；没有真实时间分布和 Prompt budget 统计。
- canonical mirror、live-source duplicate、missing provenance 只作为受控差异/原因记录；`inactive`、`temporal_ineligible` 等枚举仍需真实样本覆盖后才能评估频率。

### 4.2 Scene invariant

静态和合成审计没有发现“过去 Memory 被自动当作当前共同在场 Scene”的新 blocker：shadow view 使用 exact scope、temporal/provenance 分类，且 Prompt 等价测试确认 diagnostics 不进入 production Prompt。但没有 real report，不能宣称该 invariant 已在真实数据集上证明。

### 4.3 风险排序

1. **Critical：scope leakage**。合成隔离通过，真实频率未知；任何 read switch 必须先有真实 scope evidence。
2. **High：authority inversion / current Scene confusion**。合成 Truth 优先，但 normal production legacy selection metadata 不完整，且真实场景未运行。
3. **Medium：temporal/provenance**。有 superseded/missing-provenance diagnostics，真实数据分布未知。
4. **Lower：canonical mirror / budget**。有 synthetic classification，但尚无真实命中率和 token 影响数据。

## 5. Read-switch decision matrix

| Gate | 判断 | 依据 |
| --- | --- | --- |
| A. Limited production read switch | **NO** | real sample=0，且没有真实 UI/collector 观测；不能做 shadow-only/小流量切换 |
| B. Legacy governance | **NOT READY** | Truth/summary metadata 可见，但 normal production legacy IDs 不完整，legacy mirror 仍需治理 |
| C. Retrieval semantics | **NOT PROVEN** | synthetic authority/scope/temporal/mirror fixtures 通过，真实语义等价尚未证明 |
| D. Token governance | **NOT PROVEN** | 有 maxItems/maxCharacters 和 diagnostics 代码，但无真实 dataset/latency/token 证据 |
| E. Evidence insufficient | **YES** | 浏览器/collector blocked，real report count=0 |

最终决定：**现在不批准 production Memory read switch。** Stage 4B-4 不产生任何 read switch、迁移或 Prompt 改动。

## 6. 下一步建议（不执行）

1. 先解决独立的 `REAL_MEMORY_SHADOW_REPORTS_BLOCKED`：提供可控的浏览器/dev harness，并在不改变 production path 的前提下显式注入 debug collector。
2. 在批准后收集 5–20 条真实 normal Direct Chat turn；报告必须继续按 real/synthetic 分开，并记录上述 status/reason、record-level counts、rough comparator time、dataset size、storage/provider/network counts。
3. 同步补齐 normal production selection 的 opaque legacy IDs 或等价 metadata seam；不记录正文，不扩大到 Regenerate 或其他 feature。
4. 只有在 scope、authority、temporal/provenance、budget 和 Scene invariant 的真实证据充分后，才重新评估 Gate A；任何 read switch 仍应先保持 shadow-only、可回滚和默认关闭。
