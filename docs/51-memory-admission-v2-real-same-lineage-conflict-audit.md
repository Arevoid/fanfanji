# Stage 4D-10G — Real Same-Lineage Conflict Audit

状态：完成同 lineage 的真实配对审计；未修改 matcher、comparator、bridge policy、Prompt、Provider 或 production authority，未进入 Canary。

起始 refactor HEAD：`8c0e1b644754a32d290d96dffbc0e9ab161610fa`

原仓库稳定基线：`f515f7408cfe19da145f15a8ddffceae06e608d`

本阶段结束时的代码改动只有 shadow-only conflict anatomy diagnostics、characterization assertion 与本文件。原仓库保持不变。

## 1. Stage 10F evidence summary

Stage 10F 的 isolated real-runtime export 是本阶段的主要证据来源。它包含 5 条 legacy 与 5 条 V2 candidate，所有 5 个同 lineage pair 都满足：

- `lineageStatus=shared`；
- scope exact；
- provenance trusted；
- source window 与 source set exact；
- temporal status 相同；
- 没有 wrong pair、unmatched 或 ambiguous pair。

原始 bridge 指标为：

| 指标 | 数值 |
| --- | ---: |
| legacy / V2 candidates | 5 / 5 |
| pair matrix entries | 25 |
| same-lineage pairs | 5 |
| exact | 1 |
| conflict | 4 |
| duplicate / ambiguous | 0 / 0 |
| unmatched legacy / V2 | 0 / 0 |
| wrong pair | 0 |
| `wouldWriteProposal` | 0 |
| `wouldSafetyVeto` | 0 |
| `wouldPassthrough` | 0 |
| `wouldReview` | 3 |
| `wouldRoute` | 2 |
| P0 | 0 |

顶层 legacy/V2 comparator 的 5 条 observation 仍为：`P1=1`、`P2=4`；其中 `destination_divergence=3`、`incomparable=2`。这组 comparator severity 与 bridge correlation 是两个不同维度，不能把 bridge 的 4 个 conflict 当作 4 个 matcher failure。

## 2. Why lineage transport is considered working

`runtimeLineageTransport` 在 10F 已跨过 backend parser → HTTP JSON → frontend hydration 边界；同一个 raw Provider item 的 legacy 与 V2 projection 恢复同一个 parser-owned token，不同 raw item 使用不同 token。10F 的 5 个对角 pair 全部 `lineageStatus=shared`，且 5/5 被唯一配对。

本阶段曾在稳定 dev page 上检查诊断触发，但没有形成新的可用 10G Ledger batch/export；没有把 pending/空 export 当成证据，也没有再次增加样本。因而下面的真实数值全部明确标注为复用 10F fresh export，不能被误读为新的 extraction 结果。

## 3. Conflict anatomy schema

新增的 `DirectChatMemoryConflictAnatomy` 是 shadow-only、metadata-only 的 additive diagnostics。它只允许：

- semantic/epistemic/durability/lifecycle/authority enum；
- admission 与 bridge state/reason；
- conflict field 名称；
- actor/target shape；
- mismatch 与 unsafe 布尔值。

它不携带 statement、evidence quote、source ID、scope ID、candidate ID、lineage token、Prompt、Provider response 或 secret，也不参与配对、比较、写入或 authority 决策。synthetic bridge test 已锁定该隐私边界。

## 4. Four same-lineage conflict classifications

以下 ordinal 只对应 metadata-only export 的顺序，不是持久化 ID，也不是新的 pairing heuristic。

| ordinal | legacy side | V2 side | comparison / bridge | primary classification | secondary notes |
| ---: | --- | --- | --- | --- | --- |
| 2 | `plan`; claim kind `plan`; truth `asserted`（由 direct user-message evidence 的既有 write policy 推导）；temporal `future`; epistemic `unknown`; durability `unknown`; lifecycle `unknown`; authority `non_objective`; policy source `unknown` | candidate kind `plan`; effective semantic `plan`; epistemic `objective`; durability `unknown`; lifecycle `active`; resolved role `durable_candidate`; admission `needs_review / active_plan_requires_review`; source `v2_model_native` | semantic compatible；epistemic conflict=false；durability conflict=false；lifecycle conflict=false（`unknown` 是缺证据）；authority field differs；actor/target shape `both` vs `actor_only`，不视为矛盾；temporal conflict=false；unsafe=false；comparator `destination_divergence`；bridge `review / active_plan_review` | `legacy_projection_loss` | legacy 没有 lifecycle/durability/epistemic 维度，不能把 unknown 当成 opposite；V2 active plan 被 review，而非写入或 veto。 |
| 3 | `plan`; claim kind `plan`; truth `asserted`（code-derived）；temporal `future`; epistemic/durability/lifecycle `unknown`; authority `non_objective`; source `unknown` | candidate kind `relationship_signal`; effective semantic `relationship_signal`; epistemic `objective`; durability/lifecycle `unknown`; resolved role `relationship_signal`; admission `needs_review / relationship_signal_requires_review`; source `v2_model_native` | semantic compatible=false；epistemic/durability/lifecycle conflict=false；authority differs；actor/target shape `none` vs `both` 不构成 identity contradiction；temporal conflict=false；unsafe=false；comparator `incomparable`；bridge `route / relationship_signal_review` | `expected_semantic_divergence` | 同一个 raw item 的两个显式 taxonomy channel 不同；现有 parser 没有把 V2 relationship signal 通过文本或位置硬合并成 plan，adapter 也没有重写该 kind。 |
| 4 | `fact`; claim kind `fact`; truth `asserted`（code-derived）；temporal `present`; epistemic `uncertain`; durability/lifecycle `unknown`; authority `non_objective`; source `legacy_claim_semantics` | candidate kind `fact`; effective semantic `fact`; epistemic `objective`; durability/lifecycle `unknown`; resolved role `durable_candidate`; admission `accepted / accepted_fact`; source `v2_model_native` | semantic compatible；epistemic conflict=true；durability/lifecycle conflict=false；authority differs；actor/target shape `both` vs `actor_only` 只是 V2 target 缺省；temporal conflict=false；unsafe=false；comparator `destination_divergence`；bridge `review / ambiguous_correlation` | `v2_metadata_conflict` | V2 objective/durable projection 比 legacy asserted/uncertain 更强，属于需要 policy evidence 的 authority escalation candidate；当前 comparator 没有把它标为 `authority_escalation`，因为 legacy 侧本身不是 objective authority，不能现场改 comparator。 |
| 5 | `fact`; claim kind `fact`; truth `asserted`（code-derived）；temporal `past`; epistemic `uncertain`; durability/lifecycle `unknown`; authority `non_objective`; source `legacy_claim_semantics` | candidate kind `episodic`; effective semantic `episodic`; epistemic `objective`; durability/lifecycle `unknown`; resolved role `durable_candidate`; admission `accepted / accepted_episodic`; source `v2_model_native` | semantic compatible=false；epistemic conflict=true；durability/lifecycle conflict=false；authority differs；actor/target shape `none` vs `actor_only` 不构成矛盾；temporal conflict=false；unsafe=false；comparator `destination_divergence`；bridge `route / episodic_review_or_route` | `expected_semantic_divergence` | legacy contract 没有 `episodic` kind；这是双 channel 的 explicit kind divergence，不是 adapter 根据 statement 猜测。V2 的 objective metadata 仍是 secondary policy note，不能因此自动写入。 |

每一行只有一个 primary classification。以上 truthStatus 中标记 `code-derived` 的值来自现有 `MemoryExtractor → evaluateKnowledgeWrite` 路径；10F export 没有把 truthStatus 原样放入 persistent evidence，因此没有把未导出的正文或 ID 补进报告。

## 5. Legacy projection findings

### 5.1 Objective / asserted boundary

当前 `resolveTruth` 对 direct user-message evidence 的既有规则仍然是：用户可验证来源得到 `asserted`（除非显式 trusted confirmation），非用户来源得到 `inferred`。`policyForLegacy` 只在 `fact + confirmed` 时投影为 `objective/durable_candidate`；`fact + asserted/inferred` 投影为 `uncertain/non_objective`。

因此 10F 的两个 fact pair 没有把 asserted/inferred 错投为 objective。pair 4/5 的 stronger side 是 V2 metadata，不是 legacy projection overclaim。`legacy_projection_overclaim`：0。

### 5.2 Missing legacy dimensions

Legacy KnowledgeClaim 没有 durability 或 planLifecycle 字段。`policyForLegacy` 对 preference、plan 继续使用 `unknown`，不会把 preference 推成 stable，也不会把 plan 推成 active/completed/cancelled。pair 2 的 `unknown` 与 V2 `active` 是 projection loss / evidence absence，而不是 lifecycle contradiction。

### 5.3 Belief / hypothesis

4 个 real conflict 没有 belief/hypothesis pair。既有 code 仍只把 claim `belief` / `hypothesis` 投影为 `non_objective`；本阶段没有发现 belief/hypothesis 被转成 objective fact 的证据。

## 6. V2 semantic facet findings

`effectiveSemanticKind` 先使用 `semanticFacet=preference|hypothesis` 覆盖比较 kind，否则使用 candidate kind。10F 的四个 conflict 中没有 preference；pair 3 与 pair 5 的 `relationship_signal` / `episodic` 是 V2 candidate kind，不能用 legacy fact/plan 的 label 覆盖。

10F export 的 bridge shadow 没有逐条保留 optional `semanticFacet` 字段，因此本阶段不声称不存在未导出的 facet；effective semantic kind、candidate kind、admission reason 与 metadata source 已足以区分这 4 个 pair。后续若要调整 V2 taxonomy，应单独补 metadata evidence，不应在 comparator 中把 facet 差异当作 authority contradiction。

## 7. Event / Plan boundary

真实 4 个 conflict 中没有 `plan` vs `event` pair；实际出现的是 `plan` vs `relationship_signal` 和 `fact` vs `episodic`。因此本阶段不能得出 `plan == event`，也不能声称两者一定冲突。

代码层面 V2 prompt/schema 将 event 定义为“发生了什么”，episodic 定义为“值得长期记住的一段经历”，而 legacy kind 只支持 fact/preference/plan/belief/hypothesis。parser 同时保留 top-level legacy 与 nested V2，不通过 array position、statement 或 nearest match 互相改写。pair 3/5 的 primary 分类因此是 taxonomy divergence，而不是 adapter bug。`adapter_projection_bug`：0。

## 8. Cancelled plan and preference checks

- cancelled-plan conflict：不存在；本次 4 个 pair 中 V2 plan lifecycle 是 `active`，没有 `cancelled` 或 `completed`。因此没有 `expected_safety_veto_candidate`。
- preference conflict：不存在。10F 有一个 preference exact pair，但它的 V2 decision 是既有 `metadata_conflict`/review 路径，不属于 bridge 的 4 个 same-lineage `conflict`。
- unknown vs stable/temporary：本次没有 real preference policy conflict。`policyConflict` 只有双方都不是 `unknown` 时才记录 field；unknown 是 absence of evidence，不是 opposite value。

## 9. Comparator versus bridge

Comparator 只回答 legacy 与 V2 destination/authority/write eligibility 的差异；bridge 只回答 shadow 下未来 Canary 可能采取的动作。两者没有在本阶段互相改写。

4 个 bridge conflict 的 policy fields（按静态 policy derivation 重建）为：

- pair 2：`resolvedAuthorityRole`；
- pair 3：`resolvedAuthorityRole`，另有 semantic incompatibility；
- pair 4：`epistemicStatus`, `resolvedAuthorityRole`；
- pair 5：`epistemicStatus`, `resolvedAuthorityRole`，另有 semantic incompatibility。

这些字段差异都 `unsafe=false`。`policyConflict` 的 unsafe 条件是 legacy durable candidate 被 V2 降级、active plan 被 V2 明确 cancelled/completed、或 stable preference 被 V2 明确 temporary；本批没有任何一项命中。V2 比 legacy 更强的 objective/durable 投影不会被本阶段擅自升级为 safety veto。

## 10. Conflict=4, veto=0

`conflict=4` 表示：4 个同 lineage pair 存在 policy field 差异，仍然是 successful correlation；它不等价于 wrong pair。

`wouldSafetyVeto=0` 是因为：

1. 没有 duplicate lineage、scope mismatch、provenance mismatch 或 cancelled/completed plan；
2. unknown 维度没有被当作相反值；
3. legacy→V2 的 authority direction 没有命中当前 veto predicate；
4. pair 2/3/4/5 的 bridge 当前分别是 review/review/route/review/route（按 4 个 conflict 为 review、route、review、route），没有写入。

bridge decision 不是 matcher identity verdict。把 conflict 强行降到 exact 或修改 veto predicate 来减少数量，都会混淆两层职责，本阶段没有这么做。

## 11. Correlation coverage metrics

本批没有 safe duplicate，因此：

```text
reliablyPaired = exact + conflict + safeDuplicate = 1 + 4 + 0 = 5
expectedPairs = 5
reliablePairRate = 5 / 5 = 100%
exactRate = 1 / 5 = 20%
```

5 个 pair 都具备 shared lineage、exact scope、trusted provenance、unique lineage，且没有 wrong pair/unmatched/ambiguous，因此 4 个 conflict 应计入 successful correlation。`exactRate` 仍有价值，但不能单独作为 matcher readiness；本阶段不修改既有生产 readiness enum，只建议报告同时呈现 `reliablePairRate`。

结论：Stage 10F 的 `LINEAGE_TRANSPORT_WORKS_MATCHER_STILL_BLOCKED` 已经不能准确描述 identity matcher 的真实状态。更准确的下一状态建议是 `CORRELATION_VALIDATED_POLICY_CONFLICTS_PENDING`；该名称仅作为报告建议，不写入 production enum。

## 12. Storage, authority and privacy invariants

本阶段没有 canonical write、legacy write suppression 或 V2 write。以下对象均未改变：

- `KnowledgeClaim`、`MemoryItem`、`ConversationSummary`、`ProjectionJob`；
- `Event`、`RelationshipState`、acceptedClaims；
- cursor、storage schema、Prompt、Provider、retry/fallback。

pair anatomy 与 bridge shadow 仍不保存 statement、完整 response、Prompt、raw source refs、scope IDs、candidate IDs、lineage token、API key、Authorization、exception body 或 stack。没有用户备份读取，没有删除 `Stage4D3 临时样本`，没有新增大量消息。

## 13. Real runtime and accounting note

Stage 10F fresh batch 使用 isolated Edge/CDP profile、synthetic Direct Chat、`persistenceMode=observation_only`，并通过既有 backend/model fallback：

- 2 条 `memory_extract` logical records；
- 每条 `providerRequestCount=1`，总 provider attempts=2；
- 默认模型失败 1 次，active custom model fallback 成功 1 次；
- bridge 没有增加 Provider request。

本阶段未形成可采信的新 10G extraction export；开发触发未产生新的 Ledger record，故没有把它计作 fresh evidence，也没有再次追加 batch。不能用本阶段的 pending trigger 推断新的 provider 或 policy 结果。

## 14. Readiness and next stage

本阶段最终 readiness：

`CORRELATION_VALIDATED_POLICY_EVIDENCE_REQUIRED`

理由：identity correlation 已由 5/5 reliable pairs 验证；剩余问题是 V2/legacy policy evidence 与 taxonomy interpretation，而非 lineage transport 或 matcher identity。下一阶段可在 `observation_only` 下设计小批量 real policy evidence，优先覆盖：

1. asserted fact 与 objective fact 的重复样本；
2. active/cancelled/completed plan 三态；
3. preference stable/temporary/unknown 三态；
4. event、episodic、relationship_signal 的明确边界。

在这些 evidence 之前，不允许 Canary design、production authority change、legacy suppression、Prompt engineering 或跨 feature 扩展。

## 15. Verification and rollback

本阶段新增的 shadow anatomy assertion 与既有 Stage 4D tests 通过；最终完整验证结果记录在阶段报告中。回滚只需 `git revert` 本阶段 commit；没有数据库迁移或用户数据 schema 变更。回滚后 10F 的 lineage transport commit 与原仓库稳定版本均保持可用。
