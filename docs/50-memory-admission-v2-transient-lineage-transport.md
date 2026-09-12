# Stage 4D-10F — Transient Lineage Transport Across Backend Boundary

状态：完成 backend-boundary transient lineage transport、合成回归与一次 fresh real-runtime extraction。未进入 Canary、production authority cutover 或 legacy-write suppression。

起始 refactor HEAD：`350035f8a6f6fc6c2702c8f6c95ac8513830a555`

原仓库稳定基线：`f515f7408cfe19da145f15a8ddffceae06e608d`

## 1. Backend boundary audit

当前 Direct Chat memory extraction 的实际链路是：

```text
Provider response
  -> server.ts parser (parseOrRepairKnowledgeExtractionOutput)
  -> parsed extraction result
  -> /api/extract-memories response DTO
  -> HTTP JSON
  -> src/utils/apiHelper.ts client
  -> MemoryExtractor.extractMemories
  -> directChatMemoryCandidateAdapter
  -> bridge shadow matcher
```

### Cross-HTTP DTO

Node/dev backend `server.ts` 的 `/api/extract-memories` 返回 DTO 当前包含：

- `text`
- `items` / `candidates`（legacy parsed candidates）
- `structuredCandidatesV2`（当 Direct Chat V2 shadow 被启用时）
- `v2MetadataPresent`
- `repaired`
- 新增的 `runtimeLineageTransport` sidecar

请求 body 没有 lineage 字段；Provider 只收到原有 history、Prompt 与 provider 参数。

legacy projection 在 backend parser 的 `repaired.candidates` 形成；legacy diagnostics 不跨 HTTP，而是在前端 `MemoryExtractor` 经过 evidence/knowledge gate 后形成。V2 projection 在同一个 backend parser 的 `repaired.structuredCandidatesV2` 形成。`src/cloudflare/worker.ts` 同样返回 sidecar；该 worker 当前 extraction Prompt 仍是 legacy-only，因此没有额外改变 V2 Prompt 行为。

现有 source envelope、AI Request Ledger 与 `parentActionId` 是其他 runtime metadata，但没有可复用的“legacy/V2 parsed-item correlation sidecar”。

## 2. Transport options

### Option A — item additive field

优点是读取直接；缺点是会把 runtime token 混入 candidate shape，容易被误认为模型 schema 或被后续 storage 序列化。

### Option B — parallel sidecar（采用）

DTO 顶层携带：

```json
{
  "runtimeLineageTransport": {
    "legacy": [{"ordinal": 0, "runtimeLineage": "opaque-token"}],
    "v2": [{"ordinal": 0, "runtimeLineage": "opaque-token"}]
  }
}
```

ordinal 只用于把 backend parser 已经生成的 token 恢复到对应 projection；它不是 semantic pairing heuristic。client hydrate 后立即丢弃 sidecar，不把它放进 canonical `MemoryExtractionResult` schema。

### Option C — backend correlation table

可以传输完整 pairing table，但比 Option B 携带更多结构，且会鼓励 backend 决定 bridge pairing。它没有为本阶段增加价值。

Option B blast radius 最小：只扩展 extraction DTO，保持 matcher、policy、Prompt、Provider 与 storage 边界不变。

## 3. Ownership and lifecycle

- 每个 raw Provider item 在 `parseKnowledgeExtractionOutputWithV2` 内只调用一次 governed `createId("memory-extraction-item")`。
- parser 将同一 token 写入 module-private WeakMap，并放入 sidecar 的 legacy/v2 ordinal entry。
- token 是 runtime-generated、opaque、bounded、per-response；模型不能提供或修改它。
- JSON 可序列化的是 DTO sidecar；client `hydrateRuntimeExtractionLineage` 将 token 恢复到 projection 的 WeakMap。
- 一个 extraction operation 结束后 token 无持久化保证；不跨 extraction call 复用，也不是 canonical identity。
- transport entry 最多 64 个 legacy + 64 个 V2，token 输入长度限制 200 字符。
- token 没有 user-visible meaning，export/debug 只保留 lineage presence 或短 fingerprint，不保留 raw token。

## 4. Projection propagation

### Legacy

`server.ts` parser 产生 candidates；client 收到 DTO 后 hydrate；`MemoryExtractor` 的现有 clone/normalize/diagnostic/shadow projection 路径继续调用 `copyRuntimeExtractionLineage`，因此 source resolution、evidence gate 与 diagnostic 都不会丢失 token。

### V2

同一 raw item 的 `structuredCandidatesV2` 使用 sidecar 中相同 token；frontend V2 parser 只负责 schema normalization，之后由 hydrate 函数恢复 token。V2 adapter 通过 `getRuntimeExtractionLineage` 读取它，写入 transient `MemoryCandidate.runtimeLineageId`，仅供 bridge 使用。

没有根据 statement、source ID、candidate ID 或重新调用 `createId` 生成 token。

## 5. Matcher usage and safety

Stage 4D-10E 的 Tier-1 现在可以真正消费跨 backend 的 shared lineage。其他 tiers 未被放宽：

- structural tier 保持既有 source/scope/provenance 规则；
- subset tier 仍要求严格 subset/superset、相同 temporal/semantic/producer/sourceType、trusted scope/provenance 与双向唯一；
- actor/target unknown 仍是唯一且其他字段严格相等的受控兼容；
- lineage mismatch 不会 fallback 到 same-window、array index、statement 或 fuzzy matcher；
- duplicate legacy/V2 lineage 仍是 ambiguous/conflict，不能 exact；
- partial lineage 不再使用 structural fallback；它在 pair matrix 的 `lineageStatus=partial` 中显式记录，并保持 unmatched/review fail-safe；
- 无 sidecar 时保持原 structural compatibility。

pair matrix 仍只包含 ordinal 与布尔/类别诊断，不产生 score，不决定写入。

## 6. Isolation and non-persistence

`runtimeLineageTransport` 只出现在 extraction parser/DTO、client hydration、Direct Chat bridge/shadow path 与测试中。它不被 repository、canonical writer、UI、Offline、Group、Manual、Diary 或 CharacterPhone 用作 authority 字段。

未进入：

- KnowledgeClaim
- MemoryItem
- ConversationSummary
- ProjectionJob
- Event
- RelationshipState
- localStorage / IndexedDB
- persistent AI Ledger payload
- Prompt / Provider request

`MemoryCandidate.runtimeLineageId` 也是 transient 字段；`MemoryExtractor` 返回的 canonical claims/items 不携带它。

## 7. Synthetic tests

新增 `scripts/memoryExtractionLineageTransport.test.ts`，覆盖：

1. same raw item -> same transported lineage；
2. different raw items -> different lineage；
3. JSON stringify/parse 后 hydration；
4. legacy projection 保留；
5. V2 projection 保留；
6. shared lineage -> Tier-1 exact；
7. different lineage -> no exact；
8. duplicate legacy lineage -> conflict/ambiguous；
9. duplicate V2 lineage -> conflict/ambiguous；
10. partial lineage -> unmatched/review fail-safe（no structural fallback）；
11. sidecar absent -> legacy behavior unchanged；
12. KnowledgeClaim 无 lineage；
13. MemoryItem 无 lineage；
14. summary/projection payload 无 lineage；
15. Provider request material 无 lineage；
16. Prompt 无 lineage；
17. Ledger source/persistent payload 无 lineage；
18. user-visible candidate serialization 无 token；
19. bounded transport；
20. architecture isolation from UI/canonical/other feature authorities。

Stage 4D-10E matcher revision、10B/10C bridge、metadata、provenance 与 V2 producer tests 全部继续通过。

## 8. Fresh real-runtime validation

### Runtime boundary

- refactor dev server：`http://127.0.0.1:3000/`，运行成功；
- isolated Edge/CDP profile，未使用用户现有 browser profile；
- synthetic Direct Chat，18 条既有测试消息；
- `persistenceMode=observation_only`；
- Shadow 清空后只调用一次 `extractNow()`；
- 未使用 user backup，未删除临时样本；
- 提取后 dev server 已停止。

### Fresh metrics

| 指标 | 结果 |
| --- | ---: |
| legacy candidates | 5 |
| V2 candidates | 5 |
| legacy lineage present | 5/5 |
| V2 lineage present | 5/5 |
| pair matrix entries | 25 |
| same-lineage pair count | 5 |
| `lineageStatus=mismatch` matrix entries | 20 |
| partial lineage | 0 |
| exact | 1 |
| exact rate | 20% (1/5 paired observations) |
| ambiguous | 0 |
| unmatched legacy / V2 | 0 / 0 |
| conflict | 4 |
| duplicate | 0 |
| wouldWriteProposal | 0 |
| wouldSafetyVeto | 0 |
| wouldPassthrough | 0 |
| wouldReview | 3 |
| wouldRoute | 2 |
| wrong pair | 0 observed |
| P0 | 0 |

五个 same-lineage pair 均被可靠关联；其中四个由既有 semantic/policy comparator 判定 conflict，未产生 write proposal 或 safety veto。它们不是错误配对。fresh top-level shadow comparison 仍有 1 条 legacy-accepted/V2-rejected P1；在本阶段不改变 authority，也不把它解释为 matcher-independent veto。

Preference 自然出现并被既有 `stable_preference_review` 处理，但 preference durability 不是本阶段目标，不能据此宣称已完成 durability cutover。没有确认 `EXPECTED_SAFETY_VETO_CONFIRMED`。

### Provider / Ledger

本次 extraction 使用既有 backend proxy 与 model fallback：

- 最新 fresh batch 产生 2 条 `memory_extract` logical records；
- provider attempts：2，每条 logical record 1 次；
- 默认模型 primary failure：1；active-model fallback success：1；
- bridge 引入 Provider request delta：0；
- Prompt、token budget、Provider adapter、retry/fallback 语义未改。

## 9. Privacy and storage checks

导出只包含 metadata、类别、布尔值与 fingerprint。安全扫描未发现：

- Prompt 或用户消息正文；
- statement/evidenceQuote；
- raw source IDs、scope IDs、candidate IDs；
- API key、Authorization、完整 Provider response；
- raw lineage token；
- exception body 或 stack trace。

`observation_only` 下 KnowledgeClaim、MemoryItem、ConversationSummary、ProjectionJob、Event、RelationshipState 均未因本阶段产生写入。用户数据未受影响。

## 10. Readiness

可选枚举及本次结果：

- `LINEAGE_TRANSPORT_BLOCKED`：不适用，sidecar 已跨 boundary 成功；
- `LINEAGE_TRANSPORT_WORKS_MATCHER_STILL_BLOCKED`：**本次结果**；
- `MATCHER_IMPROVED_NEED_MORE_EVIDENCE`：不适用，exact 低于 60%；
- `MATCHER_REVISION_VALIDATED`：不适用，未达到 exact >=80%。

本阶段证明了 lineage transport ownership、JSON round-trip 与 Tier-1 可靠配对，但没有证明整体 matcher 的高覆盖率。不能进入 Canary 设计，不能修改 production authority。

## 11. Verification and rollback

- `npm run lint`：通过；
- `npm test`：`578/578` 通过；
- `npm run build`：通过（Vite 2,728 modules；server bundle 成功；service-worker cache 行已恢复到受控 baseline）；
- dependency gate：105 allowlisted boundary edges / 3 cycle baselines，通过；
- `npm run smoke:check`：上一验证轮通过；本阶段未改变 server health/CSP 逻辑。

本阶段单一目的 commit 建议：

`fix: transport admission lineage across extraction boundary`

回滚使用该 commit 的 `git revert`；没有数据库 migration 或用户数据 schema 变更。

## 12. Next recommendation

先不要 Canary。下一轮应单独审阅四个真实同-lineage policy conflict 的来源，决定哪些是预期 semantic/policy divergence、哪些需要额外 metadata contract；然后重新做小批量 real evidence。继续保持 observation_only，禁止 suppression、production cutover、Prompt 改写和跨 feature lineage 扩散。
