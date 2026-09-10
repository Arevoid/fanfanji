# Stage 4D-10E — Real Correlation Anatomy & Matcher Revision

状态：完成一次受限 matcher revision 与一次 fresh real-runtime extraction；未进入 Canary、authority cutover 或 production write。

起始 refactor HEAD：`5ff1d6b687a4d8ba115a20c496896ca56333c251`

原仓库稳定基线：`f515f7408cfe19da145f15a8ddffceae06e608d`

## 1. 结论摘要

10D 的 `exact=0` 不是可以用数组位置、statement 文本或最近候选补救的简单排序问题。静态审计与 10E 的 pair matrix 共同显示：

1. 同一 Provider item 在同一进程 parser 中可投影为 legacy 与 V2，但此前没有保留共同的 parsed-item lineage。
2. backend HTTP JSON 边界会把 WeakMap 中的运行时 lineage 丢掉；当前 fresh batch 因此仍属于“无 shared lineage 的真实样本”。
3. legacy 的 actor/target 通常由 claim subject 与 runtime scope 派生，V2 的 actorRole/targetRole 是模型元数据，target 可以缺省；这解释了 pair matrix 中大量 actor/target 不对称。
4. legacy 与 V2 的 evidenceKey、policy 字段不是同一层身份；它们不能被拿来做跨投影的强身份。

本轮新增的是受约束的 pure matcher：优先使用 parser-owned lineage；其次保留既有结构匹配；再在所有其他维度严格相等且双方唯一时，允许 actor/target unknown 或严格 source subset/superset 的可审计配对。没有 fuzzy、score、nearest、statement/evidence 比较，也没有删除 scope/provenance 检查。

## 2. legacy / V2 identity anatomy

### 2.1 legacy 来源

legacy candidate 来自既有 `KnowledgeClaim` 或 extraction diagnostic：

- message refs：`claim.source.messageIds`；
- event/record/story refs：对应的 `source.eventIds`、`source.recordIds`、offline story/source record；
- direct-chat diagnostic：`candidateCorrelationKey(payload)` 形成 source-window correlation key；
- scope：由当前 runtime envelope 绑定的 character、relation、user identity、conversation；
- producer/source type：由应用写入的 `memory-extractor.chat.*`、`user_message` 等类别；
- actor/target：由 claim subject + runtime scope 解析，而不是从 statement 推断。

### 2.2 V2 来源

V2 candidate 来自 `MemoryExtractionCandidateV2`，再由 `directChatMemoryCandidateAdapter` 绑定：

- source refs：模型提供的 hints 经过 trusted source envelope 验证后进入 provenance/evidence；
- scope/provenance：始终由 runtime scope/envelope 提供，模型不能写 canonical IDs；
- semantic/epistemic/plan/durability/authority：仅是模型元数据与 runtime policy 输入；
- actor/target：`actorRole`/`targetRole` 解析为 scope 中的角色 ID，任一方可以缺省；
- producer/source type：adapter 统一为 `direct_chat` / `user_message`；
- evidenceKey：V2 侧可以没有，不能作为必须相等的跨投影字段。

### 2.3 correlation key 与 source-window

`sourceWindowKey` 仍由规范化 source refs 与 temporal status 通过既有 `buildMemoryShadowCorrelationKey` 派生。它只用于同一受信任 source window 的结构比较；不是跨窗口的全局 ID，也不允许用数组 index 代替。

source set 采用集合等价；subset/superset 仅在 temporal、semantic、producer、sourceType、scope、provenance 和 lineage 兼容，且双向唯一时作为 `identityExact=false` 的审计配对。source set 不同且不能证明是严格 subset/superset 时保持 unmatched。

## 3. runtime lineage contract

`parseKnowledgeExtractionOutputWithV2` 为每个 raw provider item 生成一次 governed `createId("memory-extraction-item")` token，并把同一 token 放入 legacy 与 V2 projection 的 module-private `WeakMap`。不同 raw item 使用不同 token。

该 token：

- 由 parser/runtime 生成，不受模型控制；
- 只存在于当前 JS 进程对象图；
- 不可枚举，不进入 JSON-facing schema；
- 不写入 `KnowledgeClaim`、`MemoryItem`、storage、Prompt、Provider request 或 Ledger；
- 仅用于 bridge correlation。

server HTTP JSON 序列化会丢失该 WeakMap token。当前没有为此引入跨请求持久化或 model-facing lineage 字段；因此 real-runtime 结果诚实地反映“backend boundary 尚未携带 lineage”的状态。

## 4. matcher revision

`matchDirectChatMemoryCandidates` 现在按以下顺序工作：

1. **Shared lineage tier**：同 token 且 legacy/V2 各一条，且 scope/provenance trusted，才可形成 exact；重复 token 形成 ambiguous/conflict，绝不自动写入。
2. **Existing structural tier**：复用旧结构比较器；若双方显式 lineage 不同，拒绝该 pair，不回退到文本或位置猜测。
3. **Controlled unknown actor/target tier**：source set、temporal、semantic、producer、source type、scope/provenance 全部相同，且两侧唯一时，允许一侧 actor/target unknown；结果标记 `identityExact=false`。
4. **Strict subset tier**：仅允许严格 source subset/superset，其他维度相同且双向唯一；结果标记 `identityExact=false`。
5. 其余 candidate 输出 unmatched，并携带 metadata-only identity diagnostics。

policy comparator、`decideDirectChatMemoryBridge`、Prompt、Provider、retry/fallback、KnowledgeClaim/MemoryItem storage 与 authority policy 均未改变。

## 5. metadata-only diagnostics / pair matrix

每个 bridge shadow export 现在可包含：

- source-window/source-set/scope 的短 fingerprint；
- semantic、producer、sourceType、temporal 类别；
- actor/target shape（`both`、`actor_only`、`target_only`、`none`）；
- 是否存在 evidence key、lineage、source window；
- legacy/V2 每一对的 ordinal-only matrix：`sameSourceWindow`、`sameSourceSet`、`sameScope`、`semanticCompatible`、`sameActorTarget`、`sameProducer`、`sameSourceType`、`sameTemporal`。

matrix 不包含 statement、evidenceQuote、raw source IDs、scope IDs、candidate IDs、Prompt、response、API key 或 Authorization，也不产生 score。

## 6. synthetic regression coverage

新增 `scripts/memoryAdmissionMatcherRevision.test.ts`，覆盖：

- 同一 raw item 共享 lineage、不同 raw item lineage 不同；
- lineage exact pair 与 lineage mismatch；
- duplicate lineage 的 conflict/ambiguous fail-safe；
- exact source identity 与严格 source subset/superset；
- semantic difference 不被强行合并；
- same-window multiple candidate 的唯一性保护；
- actor/target unknown；
- `direct-chat` producer alias 规范化；
- temporal mismatch hard boundary；
- cross-scope 不得 exact；
- lineage 不进入 accepted `KnowledgeClaim`。

既有 10B/10C bridge、metadata、shadow evidence、adapter 与 provenance 测试继续通过。

## 7. fresh real-runtime evidence

### 7.1 运行边界

- 使用 refactor dev server `http://127.0.0.1:3000/`；
- 使用隔离 Edge/CDP profile，不读取或修改用户现有浏览器 profile；
- synthetic Direct Chat：18 条预置消息（9 user、9 character）；
- `persistenceMode=observation_only`；
- Shadow 清空后只执行 **一次** `extractNow()`；未重复调用；
- 原仓库未触碰；临时样本未删除。

### 7.2 Provider / Ledger

真实 extraction 沿用现有 backend proxy 与 model fallback。安全 Ledger 摘要显示两条 `memory_extract` logical records：

| 项目 | 结果 |
| --- | ---: |
| `extractNow()` 调用 | 1 |
| logical `memory_extract` records | 2 |
| provider attempts | 2（每条 1 次） |
| primary/default attempt | 1 failure（provider unavailable） |
| active-model fallback | 1 success |
| bridge 引入的额外 Provider request | 0 |

没有在报告中输出 key、Authorization、Prompt、完整 response 或 raw provider body。

### 7.3 bridge metrics

fresh export 的 bridge 侧为 5 条 legacy + 5 条 V2，形成 25 个 metadata-only pair matrix entries：

| 指标 | 结果 |
| --- | ---: |
| bridge observations | 10 |
| exact | 0 |
| ambiguous/conflict | 0 / 0 |
| unmatched legacy / V2 | 5 / 5 |
| same source-window pairs in matrix | 5 |
| same source-set pairs in matrix | 5 |
| same scope / producer / source type | 25 / 25 / 25 |
| same temporal pairs | 7 |
| semantic-compatible pairs | 7 |
| actor/target equal / false / unknown | 3 / 12 / 13 |
| wouldWriteProposal | 0 |
| wouldSafetyVeto | 0 |
| wouldPassthrough / wouldReview | 5 / 5 |

对应 source-window 的五个对角组合均满足 source-window、source-set、scope、producer、sourceType 与 temporal；其中三对 semantic-compatible，但 actor/target 形状不一致，另两对还存在 semantic class divergence。由于 backend response 没有保留 shared parser lineage，且当前规则禁止仅凭同窗口直接配对，fresh batch 的 exact rate 为 `0/10=0%`。

### 7.4 readiness

按本阶段阈值：

- exact >=80%：`MATCHER_REVISION_VALIDATED`；
- 60–79%：`MATCHER_IMPROVED_NEED_MORE_EVIDENCE`；
- <60%：`MATCHER_REVISION_STILL_BLOCKED`。

本次为 `MATCHER_REVISION_STILL_BLOCKED`。这不是 authority 或 Prompt 失败结论，而是实际 backend serialization 尚未携带 lineage、且真实样本仍不能安全证明 pair identity。不得据此设计 Canary 或 production cutover。

## 8. storage / privacy / safety checks

- observation_only 未产生 KnowledgeClaim、MemoryItem、ProjectionJob、ConversationSummary 或 RelationshipState 写入；
- legacy accepted/rejected 与 V2 state 仍由既有 comparator/policy 解释，未改变 authority；
- pair matrix 与 identity diagnostics 只保留类别、布尔值与短 fingerprint；
- export privacy scan 未发现 message body、statement、evidenceQuote、raw source ID、scope ID、candidate ID、Prompt、完整 response、API key、Authorization、exception body 或 stack trace；
- no array index pairing、no statement/evidence fuzzy matching、no nearest-candidate heuristic；
- no user data outside isolated synthetic profile was read or modified。

## 9. verification

- `npm run lint`：通过；
- `npm test`：`577/577` 通过；
- `npm run build`：通过（Vite 2,728 modules；server bundle 生成成功；随后已恢复 `public/sw.js` 的受控 baseline cache line）；
- dependency gate：`105` allowlisted boundary edges、`3` cycle baselines，通过；
- `npm run smoke:check`：通过（production server health、request correlation、CSP）；
- `git diff --check`：通过（仅保留项目现有换行提示）。

## 10. remaining follow-up

下一步应单独设计“跨 backend parser boundary 的 transient lineage transport”或同等可证明的 server/runtime correlation contract，并再次执行受限 real batch。该设计必须继续满足：runtime-owned、non-persistent、non-model-controlled、privacy-safe、scope/provenance hard checks，以及 ambiguous fail-safe。

本阶段不进入 Canary，不修改 Prompt/Provider，不修改 `decideDirectChatMemoryBridge`，不传播 `parentActionId` 到 memory/diary，不启动 Direct Chat 第三阶段拆分。
