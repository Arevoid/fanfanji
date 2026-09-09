# Stage 4D-9B — Legacy Authority Contract & Comparator Semantics

状态：已实现的 comparison-only contract。本文档描述 Shadow 对照分析的语义，不改变生产 Admission、canonical write、retrieval 或任何用户数据。

## 范围与基线

本阶段起点为 `3dd2cd055115ab8f9af82b1bec19fc8736ba8c90`；原仓库稳定基线仍为 `f515f7408cfe19da145f15a8ddffceae06e608d`。本阶段只收口 legacy/V2 比较语义，未执行 plan/preference 的真实运行批次，也未执行 Canary 或 production cutover。

## 比较 tuple

每条可比较记录都投影为同一形状：

```ts
{
  semanticKind,
  destinationClass,
  authorityClass,
  writeEligibility,
}
```

`semanticKind` 表示候选语义（`fact`、`belief`、`hypothesis`、`preference`、`plan`、`event`、`episodic` 或受控的 `unknown`）。`destinationClass` 表示它会落入的语义目的地：`confirmed_fact`、`user_assertion`、`belief_hypothesis`、`preference`、`future_plan`、`event`、`episodic`、`scene_only`、`relationship_review`、`rejected`、`needs_review` 或 `unknown`。

`authorityClass` 与存储层的 `canonical/authoritative` 标签不是同一个概念。这里的 `objective_truth` 只表示比较层认为它具有客观 Truth 权限；`user_assertion`、`non_objective_belief`、`preference_candidate`、`future_plan`、`relationship_review`、`none` 与 `unknown` 分别表达较低或尚未确定的权限。因而一条 canonical claim 仍可能是非客观 belief。

`writeEligibility` 为 `canonical_write`、`not_write_eligible`、`needs_review` 或 `unknown`。这是比较事实，不是对生产写入政策的重新授权。

## Legacy 映射

| legacy 输入 | destination | authority | eligibility |
| --- | --- | --- | --- |
| accepted `fact` + `confirmed` | `confirmed_fact` | `objective_truth` | `canonical_write` |
| accepted `fact` + `asserted` / `inferred` / `legacy_unverified` | `user_assertion` | `user_assertion` | `canonical_write` |
| accepted `belief` / `hypothesis` | `belief_hypothesis` | `non_objective_belief` | `canonical_write` |
| accepted `preference` | `preference` | `preference_candidate` | `canonical_write` |
| accepted `plan` | `future_plan` | `future_plan` | `canonical_write` |
| accepted `event` / `episodic` | 同名目的地 | `unknown` | `canonical_write` |
| rejected | `rejected` | `none` | `not_write_eligible` |

Legacy parser/projection 对部分 epistemic metadata 仍不完整；缺少必要信息时 tuple 使用 `unknown`，比较结果为 `incomparable`，而不是猜测为 objective truth。

## V2 映射

V2 tuple 由现有 `MemoryCandidate` 与 `MemoryAdmissionDecision` 投影而来：objective fact 对应 `confirmed_fact/objective_truth`；非客观 fact 对应 `user_assertion/user_assertion`；belief/hypothesis 对应 `belief_hypothesis/non_objective_belief`；preference、plan、event、episodic 保留各自目的地。`scene_only`、`relationship_review`、`needs_review` 和普通 rejected 保留其实际 V2 reason，不转换成可写 claim。

## Comparator mismatch contract

比较器现在以 tuple 为主，原有 `mismatch`（allow/reject 布尔兼容字段）仍保留供既有 telemetry 使用。新增 `mismatchClass`：

- `none`：tuple 等价。
- `safe_semantic_divergence`：两侧都不是 objective authority，但目的地/eligibility 有受控差异；这是需要观察的语义差异，不是 authority escalation。
- `authority_escalation`：legacy 具有 `confirmed_fact/objective_truth`，V2 却降为非客观或非 Truth 目的地，或出现等价的高风险 authority 下降/提升信号。
- `destination_divergence`：语义目的地不同但不构成客观权限升级，例如 future plan 与 cancelled/review plan 的生命周期差异。
- `write_eligibility_divergence`：写入资格不同，且无法归入 safe semantic divergence。
- `incomparable`：缺少匹配 diagnostic 或 tuple 含 `unknown`。

## Severity 规则

P0 仍只用于 scope、provenance 或 evidence 不完整。`authority_escalation` 保持 P1；因此“legacy fact + confirmed 对比 V2 subjective”仍是 P1。Stage 4D-8 的 belief/hypothesis 场景两侧均为非客观语义，现归类为 `safe_semantic_divergence` / P2，而不再因为旧的 accepted bool 自动升级为 objective-authority P1。普通 destination/write-eligibility divergence 为 P2；`cancelled_plan_not_active` 对 legacy future plan 仍为 P1，因为它代表高风险生命周期冲突。不可比较和 unsupported kind 为 P3；其它无风险相同结果为 P4。

## Telemetry 与隐私

Shadow observation 和导出记录新增 tuple、`mismatchClass` 与 `comparisonMismatchCounts`，属于 additive metadata；`schemaVersion` 仍为 `2`，旧的 `mismatch`、旧计数和 producer version 保留。sanitizer 只复制枚举、布尔值、计数、短 reason/status 等受控 metadata，并继续使用 session-scoped fingerprint；不保存 prompt、完整 response、用户正文、API key、Authorization 或原始 provider body。

## 明确未改变的生产语义

本阶段没有修改 `evaluateKnowledgeWrite`、KnowledgeClaim schema、canonical repository、retrieval、Prompt、Provider、storage schema、migration、Candidate-to-Claim production adapter、Canary 或真实 Batch B/C。现有 metadata-loss 问题（legacy parser/projection 无法携带全部 V2 epistemic/authority metadata）仍登记为 Class C 审计缺口，本阶段只让 comparator 安全地表达它，未修复它。因而没有新的用户数据写入，也没有 authority cutover。

## 验证与后续

新增纯矩阵测试覆盖 fact asserted/confirmed、belief、hypothesis、preference、plan、subjective V2、scene-only、relationship review、cancelled plan 和真实 Shadow severity。Stage 4D-8 belief case 已验证为安全 P2；dangerous confirmed-fact/objective case 保持 P1。当前 plan/preference 仍不可进入真实 production batch。下一阶段应单独设计 Candidate-to-Claim/legacy contract 的 metadata bridge，并在获得批准后再做真实运行验证；本阶段不自动进入该工作。
