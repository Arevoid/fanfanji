# Stage 4C-3：Direct Chat Memory Candidate Shadow Adapter

## 目标与结论

本阶段只观察 Normal Direct Chat automatic memory extraction 的既有结果：

```text
existing MemoryExtractionResult.acceptedClaims
    -> directChatMemoryCandidateAdapter
    -> MemoryCandidate
    -> evaluateMemoryCandidate
    -> bounded returned diagnostics
```

现有 canonical claim、summary、legacy 写入链路仍然独立运行。Shadow decision 没有
任何 production write authority，也没有运行时 wiring；这是 service-level integration
characterization，而不是生产切换。

当前不接入 manual extraction、regenerate、Group、Offline、Diary、Moments、Reading、
InnerVoice、Character Phone、Proactive、Forum 或 Cinema。

## 文件与大小

| 文件 | LOC | 直接依赖 | 职责 |
| --- | ---: | ---: | --- |
| `src/features/chat/services/directChatMemoryCandidateAdapter.ts` | 163 | core ID、既有 Knowledge/Memory types | 将已验证 claims 映射为 candidates |
| `src/features/chat/services/directChatMemoryAdmissionShadow.ts` | 199 | 既有 Knowledge gate、Memory admission、adapter | 运行纯 admission、统计并比较旧 gate |
| `scripts/directChatMemoryCandidateAdapter.test.ts` | 160 | 测试 fixtures 与 source guard | characterization / fail-open / privacy |

没有新增 Prompt、Provider、storage、repository、React、Scheduler 或 monitoring 依赖。

## 真实 extraction 输入

adapter 的唯一业务输入是既有 `MemoryExtractionResult`：

- `acceptedClaims: KnowledgeClaim[]`
- `rejectedCandidateCount: number`
- `extractedMemories` 只作为既有结果字段保留，不被重新解析

它不接收聊天原文，不复制 message batch，不再调用 `memory_extract`，也不执行第二套
parser。`rejectedCandidateCount` 没有逐候选 reason，因此比较器把它记录为
`incomparable`，不猜测旧 rejection 原因。

## 映射规则

### Candidate fields

- `candidateId`：默认使用 governed `createId("memory-candidate")`；测试可注入 factory。
- `statement`：复用既有 claim statement，不重写、不拼接消息。
- `scope`：来自 adapter 输入的 canonical Direct Chat runtime scope；绝不使用 claim
  中的旧 scope 覆盖它。
- `provenance.producer`：固定 `direct_chat`。
- `provenance.sourceType`：从既有 source kind 映射。
- source message/event/record IDs：原样保留；缺少时不伪造。
- `evidenceKey`：复用 claim source 的 evidenceKey。
- `actorId` / `targetId`：仅在 subject 为 user/character 且 canonical runtime ID
  已知时建立；relationship subject 不猜 actor。
- `temporal`、`confidence`、`importance`：直接复用 claim 字段。
- `lineage`：只透传调用方已提供的 parentActionId、producerActionId、sourceRequestId。

### Candidate kind

当前 extraction schema 的可靠映射是：

| Existing `KnowledgeKind` | Candidate kind | 说明 |
| --- | --- | --- |
| `fact` | `fact` | 可观察为 Truth-target candidate |
| `plan` | `plan` | 保留 future temporal semantics |
| `belief` | `belief` | 非 Relationship authority |
| `preference` | `unknown` | Stage 4C-2 contract 没有 preference kind |
| `hypothesis` | `unknown` | 不将 hypothesis 假装成 belief/fact |

旧 extraction 没有 `event`、`episodic`、`relationship_signal`、`scene_only` 或
`subjective_reflection` 字段，因此 adapter 不猜这些类型。

### Temporal 与 Scene

`past | present | future | timeless | unknown` 原样保留，并透传 occurred/recorded/
valid times。旧 extraction 没有 scene classification field；adapter 返回
`sceneClassificationUnavailableCount`，不通过自然语言关键词判断 scene-only。

因此当前不能证明任何旧候选是 scene-only，也不会把历史 event 变成当前 Scene。

## Shadow diagnostics

`DirectChatMemoryAdmissionShadowResult` 只返回边界元数据：

- candidate count
- decision counts
- accepted target counts
- rejection/review reason counts
- duplicate、missing scope、missing provenance、unknown kind、invalid temporal counts
- scene classification unavailable count
- old/new mismatch counts
- 每候选的 candidate ID、idempotency key、kind、decision、reason、target、source ID
  counts、scope/provenance validity、temporal status

不保存 statement、消息正文、Prompt、Summary、Diary、AI response、API key 或
Authorization。没有 localStorage、IndexedDB、telemetry backend 或新增 key。

## Old Gate 对比

对每个 `acceptedClaims`，shadow 会用同一 claim 重建只读的
`KnowledgeWriteCandidate`，重新调用既有 `evaluateKnowledgeWrite`，再和
`evaluateMemoryCandidate` 比较：

- `both_allow`
- `old_allow_new_reject`
- `old_allow_new_review`
- `old_reject_new_accept`
- `both_reject`
- `incomparable`

这不是强制两套 gate 相等。`evaluateKnowledgeWrite` 仍是当前 production baseline；
新 evaluator 只是 intake contract。

当前高风险 mismatch 是：旧 gate 允许 `preference`/`hypothesis`，新 contract 将它们
标记为 `unknown` 并拒绝。这是明确的 schema/classification gap，不能通过放宽
shadow 或修改旧 gate 来隐藏。

## Fail-open 与生产等价性

- adapter/admission/diagnostics 任一异常都返回 `failedOpen: true` 的空结果。
- shadow 不调用 Provider，不读取 storage，不调用 Prompt，不调用
  `MemoryWriteCoordinator`。
- Direct Chat 生产 hook 没有 import shadow adapter，因此默认没有 runtime observation。
- 既有 extraction 次数、AI accounting、canonical claim write、summary projection、
  legacy compatibility 均未改动。

这个阶段没有安全的 debug enable seam，因此没有额外引入配置系统；使用 service-level
characterization 满足 fail-open 要求。

## Lineage 与 idempotency

adapter 可以透传已有 lineage，但当前 Direct Chat memory extraction 调用点没有提供
完整 `parentActionId`/`requestId`，因此线上 shadow 未自动补造 lineage。该缺口被保留
并报告，不修改 Ledger schema 或 post-reply 编排。

同一 extraction 重复 adapter：candidate IDs 可以不同，但 source-based
`idempotencyKey` 相同；同 source 不同 candidate kind 的 key 不同。duplicate 只可通过
调用方传入的 `knownIdempotencyKeys` 测试集合触发，不扫描 storage，不建立 global index。

## 本阶段没有做的事情

- 没有新增 AI request
- 没有 LLM classification、embedding、semantic dedup 或 cheap filter
- 没有修改 extraction Prompt/schema
- 没有 durable candidate store、queue、worker、retry scheduler
- 没有修改 `evaluateKnowledgeWrite`
- 没有修改 `MemoryWriteCoordinator`
- 没有 producer runtime wiring
- 没有 Relationship、Scene、Truth、Summary 或 legacy write switch

## 下一阶段阻塞项

Direct Chat 还不能安全切换到新 Admission，主要原因是：

1. 旧 extraction 的 `preference`/`hypothesis` 与当前 candidate kind contract 不完全
   对齐；
2. scene-only 无法从旧 schema 可靠识别；
3. production lineage 尚未完整传入 adapter；
4. rejected extraction 只有 aggregate count，无法进行逐候选 mismatch review；
5. shadow 尚未接入安全、默认关闭的 runtime diagnostics seam。

这些问题需在另一个批准阶段逐项解决，不能在本阶段隐式扩大范围。
