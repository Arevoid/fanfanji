# Stage 4D-10A — V2 Metadata Bridge & Candidate-to-Claim Contract Design

状态：design / audit-first。本文定义未来 bridge 的边界，不实现 production bridge，不改变当前 authority、写入、Prompt、Provider、storage 或用户数据。

起始 refactor HEAD：`bd3f7dc2d738888caf034f6c9cfef973b9da473a`。原仓库稳定基线：`f515f7408cfe19da145f15a8ddffceae06e608d`。

## 1. Existing write boundary audit

当前写入链不是单一 caller：

```text
source / provider response
  -> MemoryExtractor 或 feature-specific capture
  -> caller-side evaluateKnowledgeWrite（部分路径）
  -> commitMemoryWriteBundle / repository
  -> KnowledgeClaim
  -> ConversationSummary、有限 legacy MemoryItem 或 feature projection
```

### `KnowledgeWriteCandidate` / `evaluateKnowledgeWrite` callers

| caller | producer/surface | 当前职责 |
| --- | --- | --- |
| `MemoryExtractor.extractMemories` | Direct Chat automatic/manual、immediate summary、Group Chat、Offline single/group | 将已验证 extraction payload 构造成 `KnowledgeWriteCandidate`，调用既有 policy，返回 `acceptedClaims` |
| `useChatMemoryExtraction` | Group Chat 摘要 fan-out | 对群摘要逐 participant 构造候选并调用既有 policy；普通 Direct Chat 委托 `MemoryExtractor` |
| `App.tsx` immediate summary | Memory/Chat 的一键归档 | 委托 `MemoryExtractor` 后提交 claim + summary |
| `useOfflineStoryMemorySyncActions` / `offlineGroupMemorySync` | Offline single/group | 委托 `MemoryExtractor`，另有 Offline story/reality policy 与 relationship transition |
| `manualKnowledgeService` | AppMemory、AppReading preserve、AppCinema | 用户显式输入或显式保留内容，构造 manual candidate 后调用 policy |
| `deterministicKnowledgeCapture` | AppChat artifact / completed voice call | 系统确定性事件构造 candidate 后调用 policy |

`evaluateKnowledgeWrite` 本身是纯 policy gate，负责 scope、evidence、low-information、question/roleplay、offline boundary、truth/temporal normalization；它不是 writer。`commitMemoryWriteBundle` 是 canonical-first 的写顺序协调器，不重新判断 authority。

Reading AI `memoryCandidate` 在确认前仍是 feature-owned、未持久化 candidate；显式确认当前转换成 `MemoryItem`，并不是 Direct Chat bridge 的 caller。Diary、Moments、Character Phone、InnerVoice、Proactive、Forum 等 feature 没有发现直接调用 `evaluateKnowledgeWrite` 的生产路径。

因此 `KnowledgeWriteCandidate` 不是 Direct Chat 私有类型，Option A 会影响多条已运行路径。

## 2. Option A/B/C comparison

| 方案 | 优点 | 主要风险 | rollback / migration |
| --- | --- | --- | --- |
| A：扩展 `KnowledgeWriteCandidate` | 可复用现有 policy 与 claim construction | 所有 legacy caller 被迫理解 epistemic/lifecycle/durability/authority；旧 caller 默认值容易制造假 authority；类型与 schema 兼容面扩大 | 回滚需要撤销公共类型字段及所有 caller 适配，blast radius 最大 |
| B：显式 V2 Candidate-to-Claim Adapter | legacy type 基本不动；Direct Chat 可单独 canary；policy 与 writer 仍是单一边界；关闭 flag 即回退 | 需要严格 correlation、scope/provenance 复核与双写防护；V2-only 首期不能随意写 | adapter 是纯函数，可独立测试、关闭 feature flag、回退 legacy；迁移风险最低 |
| C：Parallel V2 canonical writer | V2 语义表达完整 | 第二套 authority、dedupe、retrieval、projection、failure semantics；双 canonical source 与 schema/migration 风险最高 | rollback 会留下两套数据，需要迁移/重放/读路径协调 |

### 推荐

推荐 **Option B + Safety-veto Canary policy**，不是 Option C，也不扩展 Option A 的公共 candidate 类型。未来第一 Canary 只允许 V2 减少明确危险的 legacy write，不允许 V2 创造 legacy 原本不会发生的新 canonical write。

这同时保留了 authority clarity：V2 metadata 只在 bridge 中解释，最终可写 proposal 仍必须重新经过 `evaluateKnowledgeWrite`；canonical writer、repository、retrieval 不被绕过。Direct Chat 可单独隔离，Offline/Group/Manual/Diary 等 producer 保持原路径。

## 3. Recommended bridge architecture

未来形态：

```text
MemoryCandidate
  + MemoryAdmissionDecision
  + runtime exact scope
  + trusted provenance/source binding
  + producer/scenario + idempotency context
      |
      v
pure Candidate-to-Claim bridge
      |
      +-- write proposal -> evaluateKnowledgeWrite -> canonical writer
      +-- review / reject
      +-- route(event | episodic | relationship_review)
      +-- legacy passthrough (no V2 authority participation)
```

Adapter 不访问 IndexedDB/localStorage，不调用 Provider，不读取 transcript，不修改 RelationshipState，不创建 Summary，不 enqueue ProjectionJob，不管理 cursor；它只把已准入的 V2 semantic/policy decision 转换成 write proposal、review、reject 或 route。

## 4. Proposed input/output contract

输入最小集合：

```text
candidate: MemoryCandidate
decision: MemoryAdmissionDecision
runtimeScope: exact character/relation/identity/conversation scope
trustedProvenance: source envelope binding result
producer: direct_chat
scenario: automatic_one_to_one_direct_chat
correlation: exact | ambiguous | unmatched | legacy_only | v2_only
knownIdempotencyKeys?: read-only set
```

不允许传入 raw Provider response、Prompt、完整 transcript、API key 或 exception message。runtime scope、source references、authorship 和 lineage 必须来自应用，而不是模型文本。

建议输出：

```text
{ state: "write", candidate: KnowledgeWriteCandidate,
  canonicalSemantic, idempotencyKey, authority: "candidate_only" }
{ state: "review", reason, correlationStatus }
{ state: "reject", reason }
{ state: "route", destination: "event" | "episodic" | "relationship_review" }
{ state: "legacy_passthrough", reason }
{ state: "safety_veto", reason, legacyWriteSuppressed: true }
```

`write` 只是 proposal，不是 repository write；它必须再次调用 `evaluateKnowledgeWrite`。`legacy_passthrough` 表示 V2 bridge 不参与，当前 legacy caller 按原行为继续。

## 5. Authority matrix

| semantic | epistemic | lifecycle/durability | authorityRole | bridge result | canonical semantic |
| --- | --- | --- | --- | --- | --- |
| objective fact | objective | stable/non-temporary | durable_candidate | exact correlated pair 可 `write` proposal；否则 review | `fact` / confirmed or policy-normalized claim |
| asserted fact | asserted/user evidence | stable or unknown | non-objective/user assertion | 已有 accepted legacy pair 可 passthrough/write legacy-compatible；V2-only 首期 review | `fact` + asserted/user assertion |
| subjective belief | subjective | stable/unknown | non_objective | legacy belief 已存在时保持 cautious legacy path；V2-only 首期 review，不升格 fact | `belief`，非 objective Truth |
| uncertain belief | uncertain | stable/unknown | non_objective/unknown | review 或 legacy cautious passthrough；不得 objective write | `belief`/`hypothesis`，非 objective |
| hypothesis | subjective/uncertain | any | non_objective | 与 belief 同样处理；无 dedicated V2 belief path 前 review | `hypothesis` 或 cautious belief |
| stable preference | objective/uncertain | stable | durable_candidate/candidate_only | 当前 policy 仍 review；未来需专门 preference contract 后才可 proposal | `preference` |
| temporary preference | any | temporary | transient | reject/defer/transient；不得 durable canonical preference | 非 durable canonical |
| active plan | objective/uncertain | active/future | durable_candidate | 当前无 OpenLoop，首期 review/defer，不写永久 fact | `plan` / future plan only after separate lifecycle contract |
| cancelled plan | any | cancelled | any | reject；不得 active future plan | no active plan; future route may be event |
| uncertain plan | uncertain | uncertain | unknown | review | no active plan yet |
| completed plan | any | completed | any | reject or route-only; never active plan | possible future Event route |
| event | objective/unknown | past/present | event | route(event); not current fact | Event destination |
| episodic | objective/unknown | past | episodic | route/review until canonical episodic writer is explicit | Episodic destination |
| scene-only | any | temporary/present | scene_only | reject; never historical Truth | no Truth claim |
| relationship signal | any | any | relationship_signal | review/route; never direct RelationshipState mutation | relationship review destination |
| unknown | unknown | unknown | unknown | reject or review; no authority | none |

“canonical Memory 可以包含 belief/hypothesis/preference/plan”仍然成立；canonical storage 不等于 objective Truth。桥接问题是“写成什么语义”，不是简单的“能不能持久化”。

## 6. Mixed legacy + V2 correlation

同一个 Provider response 可能同时产生 legacy projection 与 additive V2 candidate。pairing 必须使用 runtime source binding 后的结构化 key，而不是 statement text：

1. 先规范化 source message/event/record references、temporal status、semantic facet/kind、plan lifecycle、source type 与 exact scope。
2. 使用已有 `buildMemoryShadowCorrelationKey(sourceIds, temporalStatus)` 作为 source-window 粗相关 key。
3. 在同一粗 key 内再使用不含 statement 的结构 fingerprint（kind/facet/epistemic/lifecycle/authority/source refs/evidenceKey）做 exact matching。
4. 恰好一个 legacy 与一个 V2 且 fingerprint 兼容时才是 `exact`。
5. 同一 source window 有多个候选、多个 fingerprint 命中、scope/provenance 不一致或同一 idempotency key 出现语义冲突时为 `ambiguous`，不得猜测。

statement/evidence quote 只能用于已有 evidence gate，不能作为唯一 identity。现有 shadow 已在 diagnostic 重复匹配时选择 incomparable；未来 bridge 应延续这一 fail-safe 规则。

状态定义：

| correlation | 处理 |
| --- | --- |
| exact | 可按 semantic/authority matrix 继续判断 |
| ambiguous | `review` 或 safety veto；不写 V2 authority |
| unmatched legacy | legacy passthrough，V2 不参与 |
| unmatched V2 | 首期 Canary 只 review/shadow，不写 |
| duplicate same idempotency key | 合并为一个 write intent |
| conflicting duplicate key | review/safety veto，不猜 |

## 7. V2-only 与 legacy-only policy

第一 Canary 不允许 V2-only 直接写 canonical claim。即使 objective fact 结构完整，也先进入 review/shadow，直到有独立的 V2-only evidence、writer contract 和 recovery 证明。

Legacy-only response 完全保持当前 production behavior；V2 flag 缺失不能破坏 legacy extraction、claim construction、summary 或 cursor。bridge 没有 exact pair 时应 `legacy_passthrough`，而不是把缺少 metadata 当作拒绝所有旧路径。

## 8. Idempotency and no-double-write

同一 semantic candidate 只能产生一个 canonical write intent。优先使用现有 `buildMemoryCandidateIdempotencyKey` 的结构化来源：exact scope、candidate kind/facet、producer/source type/authorship、actor/target、metadata/lifecycle、source references、evidenceKey；不使用 statement 或随机 candidate ID 作为 dedupe identity。

同 key 同语义：合并/返回 duplicate。相同 source 但 objective 与 subjective 等 authority 不同：不是普通 duplicate，而是 conflict，进入 review 或 safety veto。adapter 不执行两次 `evaluateKnowledgeWrite` 后分别写 legacy 与 V2；最终只能有一个 canonical proposal。

Replay 时依赖 canonical repository 现有 id/meaning dedupe，加上 caller 提供的 known idempotency keys；adapter 不扫描 storage、不自己建立第二个持久化 ledger。

## 9. Failure policy

| 情况 | 第一 Canary 建议 |
| --- | --- |
| bridge unavailable | 无明确 V2 unsafe evidence 时 legacy passthrough；记录受控 diagnostics；不得新增 V2 write |
| V2 missing | legacy unchanged |
| malformed optional metadata | 丢弃不可信 V2 authority；legacy unchanged；若已形成明确 authority conflict，则 review/veto，不猜 |
| authority conflict | conservative safety veto；抑制 legacy write，保留 source 供重试/review |
| correlation ambiguous | 不绑定 V2；若无法排除 unsafe conflict，review/veto；禁止猜 pair |
| adapter throws | automatic Direct Chat 可 fail-open 到 unchanged legacy，仅限没有明确 unsafe V2 evidence；存在明确 conflict 时 fail-closed/veto |

这一区分了 compatibility fallback 与 safety veto：fallback 保持旧系统行为，veto 只阻止 V2 明确证明不安全的 legacy write。

## 10. Safety-veto design

未来第一 Canary 推荐 **Safety-veto canary**：

- V2 可以阻止明确 unsafe 的 legacy write；
- V2 不能把 old reject 变成新 write；
- V2-only、unmatched V2、ambiguous pair 不能写；
- legacy-only 不改变；
- 关闭 flag 后完全回到 legacy。

最重要的 veto 例子是 exact pair：legacy `fact + confirmed/objective_truth`，V2 `subjective/non_objective`、scene-only 或 relationship-review。它不能简单沿用 legacy write。反过来，legacy belief 与 V2 subjective 的 cautious divergence 不应被误判为 objective-authority escalation；如果旧 path 本来允许 belief，首期可保持 legacy cautious path。

Safety-veto 可行，但依赖三个前提：exact correlation、明确 source binding、以及 fail-open 条件不会掩盖显式 authority conflict。它不会新增任何 write；它只能让已有 legacy write 变少或保持不变。

## 11. Feature isolation

未来第一 Canary 只针对 **Automatic One-to-One Direct Chat**。明确排除：

- Manual Memory / manual extraction
- Group Chat
- Offline single/group
- Diary
- Character Phone
- Moments
- Reading
- Cinema
- InnerVoice、Proactive、Forum、voice/image 等其他 producer

这些 producer 的现有 `evaluateKnowledgeWrite`、feature-specific policy 和 persistence 保持不动。

## 12. Rollback and historical compatibility

关闭 Direct Chat canary flag 即停止 bridge 参与，legacy-only 继续使用当前 `MemoryExtractor` → `evaluateKnowledgeWrite` → `commitMemoryWriteBundle`。由于本阶段不改 schema、storage、retrieval、Prompt 或 writer，不需要 migration，也没有历史用户数据回填或反向转换。

Provider request 数量不增加：未来 bridge 是本地纯函数，不调用 Provider；V2 metadata 继续复用同一个 additive extraction response。

## 13. Remaining gaps

- Class C metadata loss 尚未在 production path 修复；本阶段只定义 future bridge contract。
- 当前 KnowledgeClaim schema 没有额外 epistemic/authority 字段，bridge 不能假装这些字段已经可持久化。
- Belief/hypothesis dedicated canonical route 尚未实现，但 legacy cautious recall 已存在。
- Preference 与 plan 的真实 Batch B/C 仍暂停。
- Provider fallback debt `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK` 保持登记，不在本阶段修复。
- 需要后续验证 ambiguous matching、crash/replay、multi-tab idempotency 和 real Direct Chat safety-veto evidence。

## 14. Recommended next implementation stage

若获批准，下一阶段应仍是小范围、纯函数优先的 **Direct Chat-only bridge characterization**：先实现不接 writer 的 pair matcher、proposal validator、safety-veto matrix、idempotency/replay characterization；再用 synthetic shadow 验证 old-reject/new-accept 不会被创造。只有这些测试稳定后，才考虑 opt-in canary observation；不应直接恢复 plan/preference real batches，也不应创建 parallel V2 writer。

## 15. Stage 4D-10A decisions and verification

1. 主要 `KnowledgeWriteCandidate` callers：MemoryExtractor（Direct/Group/Offline/immediate）、Direct Group summary hook、manualKnowledgeService（Memory/Reading/Cinema）、deterministicKnowledgeCapture（chat artifact/voice）。
2. 主要 `evaluateKnowledgeWrite` callers：上述 callers；policy 本身仍是纯函数。
3. Direct Chat 可以单独隔离 bridge，因为其自动路径有明确 scope、source envelope、producer 与 feature flag；其他 producer 不共享该 canary。
4. Option A 风险是公共类型污染与高 blast radius。
5. Option B 风险是 correlation、provenance、双写与 failure semantics，需要严格测试。
6. Option C 风险是第二套 canonical authority、retrieval、dedupe、migration 与回滚。
7. 推荐 B + Safety-veto hybrid。
8. 原因是最小 blast radius、legacy compatibility 最强、rollback 最简单且 authority 仍集中在既有 policy/writer。
9. 不修改 legacy `KnowledgeWriteCandidate`。
10. Bridge input 是 candidate、decision、exact runtime scope、trusted provenance/source binding、producer/scenario、correlation、idempotency context。
11. Bridge output 是 write proposal、review、reject、route、legacy passthrough 或 safety veto。
12. Objective fact：exact pair、stable/non-temporary、scope/provenance 完整时才可 proposal，并重新调用 legacy policy。
13. Subjective belief：不转 objective fact；correlated legacy belief 可 cautious passthrough，V2-only 首期 review。
14. Uncertain belief：review 或 cautious legacy path，不得 objective write。
15. Hypothesis：belief channel/review，不得 objective Truth。
16. Stable preference：当前 review；未来需专门 preference contract 后再 proposal。
17. Temporary preference：reject/defer/transient，不做 durable canonical preference。
18. Active plan：当前无 OpenLoop，review/defer。
19. Cancelled plan：reject，不得 active future plan。
20. Uncertain plan：review。
21. Completed plan：reject 或 route-only，不得 active plan。
22. Event：route Event，不当 current fact。
23. Episodic：route/review，直到 canonical episodic writer 明确。
24. Scene-only：reject，不进入 historical Truth。
25. Relationship signal：review/route，不直接改 RelationshipState。
26. Unknown：reject/review，不授予 authority。
27. canonical belief 仍允许存在，但本阶段不新增 V2-only writer。
28. canonical hypothesis 仍允许存在，保持非 objective。
29. canonical preference 仍允许存在，但 stable/temporary bridge 另需 contract。
30. canonical plan 仍允许存在，但 lifecycle 不能被当作当前事实。
31. mixed response 使用 source-window + structural fingerprint + exact scope/provenance correlation。
32. 不依赖 statement text 作为 identity。
33. ambiguous correlation：review/veto，不猜。
34. unmatched legacy：legacy passthrough。
35. unmatched V2：首期 review/shadow，不写。
36. V2-only 第一 Canary 不允许写。
37. legacy-only 完全保持当前行为。
38. 双写通过单一 write intent 与 idempotency key 避免。
39. idempotency key 使用现有结构化 candidate key，不使用 statement/random ID。
40. bridge crash：无明确 unsafe evidence 时 legacy passthrough；明确 conflict 时 veto/review。
41. malformed metadata：不信任 V2 authority；legacy fallback 或在明确冲突时 veto。
42. authority conflict：conservative veto。
43. V2 应拥有未来受限的 legacy-write veto。
44. 推荐 Safety-veto Canary。
45. Safety-veto 可行，但必须先完成 exact matcher、source binding、replay 与 fail-open characterization。
46. Safety-veto 不新增任何 write，只减少或保持 legacy write。
47. rollback：关闭 flag，完全回 legacy；无需 migration。
48. feature isolation：Automatic One-to-One Direct Chat only。
49. Manual 排除。
50. Group 排除。
51. Offline 排除。
52. Diary 排除。
53. Prompt 不需要改变。
54. storage 不需要改变。
55. KnowledgeClaim schema 不需要改变。
56. 不需要 migration。
57. Provider request 不改变。
58. Class C metadata-loss 未来在 Direct Chat-only bridge 的 candidate-to-claim 边界解决，而不是在 legacy global type 上扩散。
59. bridge 完成后不能自动恢复 plan/preference real batches；需另行批准和真实证据。
60. 下一阶段建议先做纯 matcher/proposal/veto characterization。
61. production code changed：否。
62. authority changed：否。
63. cutover：否。
64. starting HEAD：`bd3f7dc2d738888caf034f6c9cfef973b9da473a`。
65. final HEAD：本阶段提交后的 HEAD。
66. commit：本阶段单一 design/test commit。
67. tests：见最终验证结果。
68. lint：见最终验证结果。
69. build：见最终验证结果。
70. dependency gate：105 edges / 3 cycles baseline。
71. AI accounting：应保持通过，bridge 不增加请求。
72. smoke：应保持通过。
73. worktree：本阶段完成后须 clean，原仓库继续 clean。
