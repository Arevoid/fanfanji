# Memory Admission V2：Zero-Candidate Evidence Semantics

## 范围与基线

- refactor 起点：`1a352b1e91b0a93bbafc4803506cff88c2213368`
- 原仓库基线：`f515f7408cfe19da145f15a8ddffceae06e608d`
- Campaign：`campaign-memory-admission-v2-2026-09-10`
- 本阶段没有新的真实用户 turn、Provider 调用或 `extractNow()`。
- RG1 的 21 条 dedicated fixture history、archive marker 与 exact scope 均保留。

## RG1 事实与 zero taxonomy

RG1 的安全 metadata 显示：Direct Chat 成功完成；`memory_extract` 同一逻辑 action 有两次 backend-proxy attempt，默认模型 attempt 失败后当前模型成功；最终没有 `apiError`，archive marker 推进，eligible 回到 0。Extraction contract 对空 `candidates` 返回成功结果，并将 `shadowCandidatesV2` 表示为空数组、`rejectedCandidateCount=0`。

因此 RG1 分类为 **A — legitimate zero candidate**，不是：

- B parser malformed/invalid：没有 parser rejection count，且 extraction fallback 测试明确空结果不是 API failure；
- C extraction failure：最终 extraction attempt 成功，Provider accounting 完整；
- D observation pipeline loss：没有 candidate array 可供 Bridge 观察，Bridge/Safety/Canary 观察数量为 0。

生产 direct-chat extraction 已有 zero-candidate cursor contract（`extracted_zero_candidates`），并且现有 summary cutover policy 明确允许 automatic zero-candidate 推进 cursor。此次不改变 Prompt、parser、Memory policy、trigger threshold 或 production cursor semantics。

## Root cause

`src/features/chat/services/directChatMemoryLongEvidenceRuntime.ts` 原先只遍历 `bridgeShadow.observations`，因此 candidate 数量为 0 时没有调用 Collector。Collector 原有记录粒度是 candidate-level，导致成功 batch 无 record、export 空记录、reviewer 无法形成非空 artifact。这是 observability gap，不是生产 Memory 行为 bug。

## 选择的 evidence model

采用 **batch-level `ZERO_CANDIDATE_BATCH`** additive record：

- `recordKind="batch"`、`candidateCount=0`；不伪造 candidate、semantic kind、suppression 或 Memory；
- extraction 成功、空 shadow candidate array、无 rejected candidate、无 API error 时生成；failed-open 或 parser rejection 不会被误归类为 legitimate zero；
- cursor/canonical/projection metadata、scope fingerprint、logical/physical accounting 与 privacy 状态仍必须有效；
- `ZERO_CANDIDATE_BATCH` 不是 `VALID_CONTROL`，也不是 `VALID_ELIGIBLE_SUPPRESSION`。

Zero batch 的治理计数：

| 计数 | 是否增加 |
| --- | --- |
| artifact | 由包含它的正式 artifact 增加 |
| session | 是 |
| batch | 是，一次 logical batch |
| scope | 是，exact scope 且有 mapping 时 |
| UTC day | 是 |
| control | 否 |
| suppression | 否 |

Collector、Level-1 reviewer 与 Campaign reviewer 均按 batch fingerprint 去重；同一 logical action 的 candidate children 不会重复增加 batch。旧 candidate artifact 沿用原 schema/字段并继续可读；新增字段为 additive，旧记录缺失 `recordKind` 时按 candidate 处理。

## Reviewer 与 Campaign

Reviewer 要求 zero record 具备完整 metadata-only shape，并拒绝缺失/伪造的 batch 标记、非零 candidate count、canonical/projection delta、cursor 未推进或 privacy violation。合法 zero record 可形成非空 artifact，且不会计入 controls/suppressions。

Campaign reviewer 暴露 `zeroCandidateBatchCount` 作为信息字段；`extractionBatchCount`、session/scope/day、logical/physical accounting 正常计入，control/suppression 不增加。现有两个 authoritative artifacts 复核仍为：artifacts 2、sessions 2、scopes 1、batches 2、controls 2、suppressions 0、logical/physical 2/4、days 2、stickyFailure false、promotionEligible false。

## RG1 Window resolution

RG1 的实际 collector export 只有 `records=0`，不能追补为 authoritative artifact。当前 Window `window-1352524908ffd837` 已通过新增的 `collector_gap` non-success closure 合法收尾：

- `closed_unrecoverable`；
- `authoritativeArtifactCount=0`；
- 不计 Campaign artifact/session/batch/control/suppression；
- 不改变 `stickyFailure`（这是 collection infrastructure gap，不是 safety/privacy/accounting failure）；
- Campaign manifest 保留该 approved/closed Window 的审计 trail，artifactPaths 为空；
- closure manifest：`docs/evidence/memory-admission-v2/window-1352524908ffd837/window-closure.json`；
- Campaign authoritative counts 保持原值，review status 为 `ok`，promotion 仍为 false。

RG1 历史 extraction 没有 retroactive artifact，也没有使用 raw token、真实用户备份或原始正文。

## 测试与验证

新增/更新覆盖：

1. successful empty extraction 生成 batch evidence；
2. zero ≠ control；
3. zero ≠ suppression；
4. zero batch dedup 与同 action batch accounting；
5. reviewer 接受合法 zero、拒绝伪造/malformed zero；
6. 旧 candidate artifacts 与既有 Campaign 仍可读；
7. collector-gap closure 不计 authoritative counts 且不 sticky。

已通过专项 collector、runtime、artifact reviewer、campaign governance tests 与 `npm run lint`。完整 tests/build/dependency gate 在本阶段最终提交前执行；若任一失败即停止。

## Readiness

实现目标：`ZERO_CANDIDATE_EVIDENCE_GAP_FIXED_LOCAL_VALIDATED`。

下一阶段建议：`Stage 4D-11O-RG1-R1 — Zero-Candidate-Aware Governed Runtime Evidence Revalidation`。下一阶段才设计如何在 marker/eligible=0 后获得新的合法 automatic trigger；本阶段不发新 Provider 请求、不重放 RG1。
