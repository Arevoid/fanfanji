# Stage 4D-10B — Pure Matcher, Bridge Decision & Safety-Veto Characterization

状态：**pure bridge core implemented / production path intentionally not connected**。

本阶段起始 refactor HEAD：`df61541a75270c5348798a4674e55f902c45a6c0`。
原仓库稳定基线：`f515f7408cfe19da145f15a8ddffceae06e608d`。

本阶段把 Stage 4D-10A 的 test-local design contract 提取为一个正式、纯、Direct Chat scoped 的
模块，但不改变当前任何生产写入路径。模块只接受已经 normalized/runtime-bound 的 legacy candidate、
`MemoryCandidate`、`AdmissionDecision` 和运行时绑定；它不读取 transcript、storage 或 Provider。

## 1. Pure module boundary

实现文件为 `src/features/chat/services/directChatMemoryAdmissionBridge.ts`。它只导出：

* correlation state、bridge state、reason code 和输入/输出类型；
* `matchDirectChatMemoryCandidates`：两阶段纯 matcher；
* `validateDirectChatMemoryWriteProposal`：纯 proposal validator；
* `decideDirectChatMemoryBridge`：纯 decision matrix。

它不导入 writer、repository、`MemoryExtractor`、`useChatMemoryExtraction`、Offline、Group、Manual、
Prompt、Provider、ledger、UI 或 background job。`write_proposal` 是普通数据，不会执行写入，也不会
调用 `evaluateKnowledgeWrite`。生产代码没有 import 该模块；import-isolation test 扫描 `src/` 并固定
这一边界。当前模块因此是 **Class C bridge core**，不是 Class C production path。

## 2. Identity and policy dimensions

Identity 用来判断两个候选是否描述同一个 source-backed semantic candidate：

* exact runtime scope：`characterId`、`relationId`、`userIdentityId`、`conversationId`；
* canonicalized source refs；
* semantic kind/facet；
* runtime-owned actor/target（如果提供）；
* temporal status/source window；
* normalized producer 和 source type。

`statement`、`candidateId`、epistemic status、durability、plan lifecycle 和 resolved authority role
不进入 structural identity。`evidenceKey` 不是 mixed legacy/V2 pairing 的唯一依据：不同路径可以产生
不同的 evidence key，而仍共享 source-backed identity；它仍由既有 `buildMemoryCandidateIdempotencyKey`
参与 write-intent key，不能被模型提供的值单独提升为可信 pairing authority。

Policy/conflict dimensions 独立比较：`epistemicStatus`、`durability`、`planLifecycle`、
`resolvedAuthorityRole`。因此 objective/subjective、active/cancelled、stable/temporary 等差异保持
同一 candidate correlation，并进入 conflict/veto，而不是逃逸为两个 unmatched candidates。

Source refs 去空白、去重并排序；source-window 使用既有 `buildMemoryShadowCorrelationKey`。
scope 必须 exact，provenance 必须 runtime-owned 且 source refs 必须属于 runtime `allowedSourceRefs`。
跨 character、relation、identity 或 conversation 不会被按数组位置或 statement 交叉配对。

## 3. Correlation contract

正式 correlation states：

| state | 语义 |
| --- | --- |
| `exact` | 一个 legacy 与一个 V2 在同一 source window、structural identity 相容，policy 无冲突。 |
| `ambiguous` | 一对多、多对一、缺少可靠 source window 或无法确定唯一 pair。 |
| `unmatched_legacy` | legacy 没有相容的 V2。 |
| `unmatched_v2` | V2 没有相容的 legacy。 |
| `legacy_only` | 输入没有 V2；这是 legacy passthrough 的显式状态。 |
| `v2_only` | 输入没有 legacy；第一 Canary 不允许写。 |
| `duplicate` | 同一 structural identity 的重复候选，policy semantics 一致。 |
| `conflict` | 同一 structural identity 的 authority/policy 冲突，或 duplicate group 本身冲突。 |

Matcher 先按 `source refs + temporal status` 缩小窗口，再按 scope、source refs、semantic kind、
actor/target、producer/source type 和 temporal status 建立 structural group。单一 pair 才能 exact；
同一 identity 的 epistemic/lifecycle/durability/authority 差异不会被当作 unmatched。对 fact 与
belief/hypothesis/scene/relationship 的 authority-only divergence，若 source window 唯一且 runtime
binding 可信，会形成 `conflict`，使 safety veto 能够看到冲突。scope/provenance 不合法时不产生
可信 exact pair；结果为 conflict/review 或 unmatched，绝不 cross-scope pair。

## 4. Bridge states and reason codes

Bridge decision state 为：

`legacy_passthrough`、`write_proposal`、`review`、`reject`、`route`、`safety_veto`。

稳定 reason code 覆盖：

* lifecycle/semantic：`exact_objective_candidate`、`cautious_belief_passthrough`、
  `uncertain_belief_review`、`stable_preference_review`、`temporary_preference_not_durable`、
  `unknown_preference_durability`、`active_plan_review`、`cancelled_plan_not_active`、
  `uncertain_plan_review`、`completed_plan_not_active`、`event_route`、
  `episodic_review_or_route`、`scene_only_not_truth`、`relationship_signal_review`、
  `unknown_semantics`；
* correlation/safety：`legacy_only`、`unmatched_legacy`、`v2_only_not_write_enabled`、
  `ambiguous_correlation`、`scope_mismatch`、`provenance_mismatch`、`authority_conflict`、
  `conflicting_duplicate`、`duplicate_same_intent`、`old_reject_new_accept`、
  `v2_candidate_not_accepted`、`missing_runtime_binding`。

## 5. Safety-veto matrix

| legacy / V2 combination | result |
| --- | --- |
| accepted objective fact + accepted objective durable fact, exact scope/provenance | pure `write_proposal`; no writer call |
| accepted belief + subjective belief | cautious `legacy_passthrough` |
| cautious belief/hypothesis + uncertain belief | `review` |
| confirmed/objective fact + subjective/non-objective V2 | `safety_veto / authority_conflict` |
| objective fact + `scene_only` | `safety_veto / scene_only_not_truth` |
| objective fact + `relationship_signal` | `safety_veto / relationship_signal_review`; a relationship-signal legacy candidate routes to `relationship_review` instead |
| durable preference + temporary V2 preference | `safety_veto / temporary_preference_not_durable` |
| stable preference + unknown durability | `review / unknown_preference_durability` |
| active future plan + cancelled V2 plan | `safety_veto / cancelled_plan_not_active` |
| active future plan + completed V2 plan | `safety_veto / completed_plan_not_active` |
| active/uncertain plan + uncertain V2 lifecycle | `review / uncertain_plan_review` |
| active plan + active V2 plan | `review / active_plan_review` (no OpenLoop or writer added) |
| scene-only without a legacy objective Truth write | `reject / scene_only_not_truth`; with that legacy write it is a safety veto |
| event | `route(event)`; no event writer call |
| episodic | `route(episodic)`; no writer call |
| unknown | `review / unknown_semantics` |

The matrix is conservative: an explicit unsafe conflict cannot fail open into a legacy write. An unavailable
future matcher may be handled by a future caller as legacy passthrough only when there is no already identified
unsafe evidence; once an authority conflict is identified, helper failure must remain non-write.

`legacy_only` always preserves legacy passthrough. `v2_only` and `unmatched_v2` are review-only. An old
rejected candidate paired with a V2 accepted candidate returns `review / old_reject_new_accept`; it can never
produce a first-Canary write proposal. A duplicate group produces one proposal at most, and a known key returns
`review / duplicate_same_intent` rather than a second intent. Conflicting duplicates return safety veto.

## 6. Objective fact proposal and validator

The pure validator requires all of the following:

1. correlation is `exact` or a policy-identical `duplicate`;
2. legacy diagnostic is accepted;
3. V2 decision is accepted and V2 is present;
4. candidate is a `fact`, objective, non-temporary and resolved as `durable_candidate`;
5. exact runtime scope and trusted runtime-owned provenance/source refs;
6. no unsafe policy conflict and no known idempotency key;
7. legacy side itself supports an objective durable fact;
8. the bridge uses `candidate_only` authority and never claims canonical authority.

The proposal reuses the existing `buildMemoryCandidateIdempotencyKey`. The existing key is source/scope/
semantic/policy based: it excludes statement and random `candidateId`, includes canonical candidate metadata and
the existing evidence key, and changes when character/relation/conversation scope changes. A statement
paraphrase with the same source/evidence identity retains the key; source refs are canonicalized for bridge
pairing, while the existing global key implementation is not modified in this stage.

## 7. Replay and idempotency characterization

The bridge stores no ledger and has no side effects. Replaying the same normalized inputs is deterministic.
The caller may pass a read-only `knownIdempotencyKeys` set: an unseen valid pair can produce one proposal;
the same key returns `duplicate_same_intent` and no second intent; a conflicting replay remains review/veto
according to its conflict rather than being deduped into a write. The tests cover statement paraphrase,
random candidate ID changes, source ordering/duplicates, scope changes and repeated decisions.

## 8. Production import isolation and non-deltas

The formal test rejects any production import of this module. No changes were made to:

* `MemoryExtractor`, `useChatMemoryExtraction`, `evaluateKnowledgeWrite` or `commitMemoryWriteBundle`;
* KnowledgeClaim, MemoryItem, Event writer, RelationshipState, Summary, ProjectionJob or cursor;
* Prompt, Provider, retry/fallback or AI request count;
* storage schema, migration, persistence, real Batch B/C or Canary;
* user data or production authority.

The Stage 4D-9B shadow comparator remains unchanged. No real extraction or production V2 write is performed.

## 9. Tests and gates

`scripts/memoryAdmissionMetadataBridgeDesign.test.ts` now imports the formal module and covers exact,
one-to-many/many-to-one ambiguity, unmatched sides, duplicate/conflicting duplicate, source normalization,
temporal/scope/provenance mismatch, authority conflicts, lifecycle matrix, semantic routing, old-reject/new-
accept, V2-only, legacy-only, proposal validation, replay/idempotency and production import isolation.

The final verification for this stage is 575/575 tests passed; `npm run lint`, `npm run build`, dependency
direction gate (105 allowlisted edges / 3 cycle baseline), AI accounting and production smoke all passed. No
test is deleted, skipped or weakened. The build's generated service-worker cache marker is restored to the
tracked baseline after verification, so this pure stage does not change runtime assets.

## 10. Remaining Class C gap and next recommendation

The pure matcher/veto characterization is complete, but production path resolution is intentionally pending.
The next safe stage should first review these characterization results and, if separately approved, design a
synthetic shadow-only integration that observes existing Direct Chat extraction without suppressing legacy writes.
Only after real evidence and an explicit canary approval should any caller invoke a proposal validator and the
existing policy/writer boundary. This stage does not create a canary flag, modify authority, or enter production
cutover.
