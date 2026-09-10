# Stage 4D-10C — Synthetic Shadow-Only Bridge Integration

状态：**Class C shadow integration resolved / Class C production authority unresolved**。

起始 refactor HEAD：`e49b3c898ab4e5bec564e0bee30d9bacac882348`。
原仓库稳定基线：`f515f7408cfe19da145f15a8ddffceae06e608d`。

本阶段只在 Automatic One-to-One Direct Chat 已有 Admission Shadow seam 旁边观察
Stage 4D-10B pure bridge。它不抑制 legacy write、不创建 V2 canonical write、不改变
Prompt/Provider/Retry/Fallback、cursor、Summary、ProjectionJob、MemoryItem、Event、
RelationshipState、storage schema 或用户数据。

## 1. Integration point and feature isolation

生产接线点仍是 `src/features/chat/services/directChatMemoryAdmissionShadow.ts`；该模块在
既有 comparator 结果完成后，调用窄 adapter `directChatMemoryAdmissionBridgeShadow.ts`。
真正的生产入口是 `useChatMemoryExtraction` 的：

```text
manualMessagesOverride === undefined
&& isDirectChatMemoryAdmissionShadowEvidenceEnabled()
&& non-group Direct Chat extraction
```

因此默认关闭且只覆盖 Automatic One-to-One Direct Chat。Manual、Group、Offline、Diary、
Reading、Cinema、CharacterPhone、Moments、voice、image 和其他 feature 没有 bridge shadow 接线。
未新增 authority flag；复用现有 dev-only Admission Shadow enablement。启用方式仍是既有
dev/test `configureDirectChatMemoryAdmissionShadowEvidence({ enabled: true })` 或现有 dev API，
默认 `enabled=false`，production build 没有用户可用的 authority 切换。

## 2. Legacy bridge adapter and policy projection

`directChatMemoryAdmissionBridgeShadow.ts` 接受已经解析的 `MemoryExtractionResult`、runtime scope、
optional source envelope 和已存在的 V2 candidate。它不解析 raw Provider response、不读 transcript、
不读写 storage，也不复制 matcher。

Legacy side 从 `rejectedCandidates` 与 `acceptedClaims` 以 opaque correlation key 配对；accepted
claim 的 source refs、scope、producer/source type、subject actor/target 和 truth status 由既有
canonical claim/runtime 提供。Legacy policy projection 是 comparison-only：

| legacy 语义 | projection |
| --- | --- |
| fact + `confirmed` | `epistemicStatus=objective`、`resolvedAuthorityRole=durable_candidate`；durability 仍 `unknown` |
| fact + asserted/inferred/other | 不升级为 objective；epistemic `uncertain`、authority `non_objective` |
| belief/hypothesis | subjective 或 uncertain compatible class、authority `non_objective` |
| preference | durability `unknown`，不从正文猜测 |
| plan | lifecycle `unknown`；`future` 不推导为 active |
| 缺 claim 的 diagnostic | policy `unknown`，不会伪造 metadata |

`legacyPolicySource` 只报告 `legacy_claim_semantics`、`legacy_policy_derived` 或 `unknown`；
`v2MetadataSource` 区分 `v2_model_native`、`legacy_policy_derived` 和 `unknown`。runtime scope、
source envelope、source binding 均属于 `runtime_owned`。不存在正文启发式 metadata 推断。

## 3. V2 input and correlation

V2 side 使用现有 `adaptDirectChatMemoryExtractionToCandidates` 的 structured/shadow candidates，
并为同一 candidate 计算已有 `evaluateMemoryCandidate` decision。若 extraction 没有明确
`structuredCandidatesV2` 或 `shadowCandidatesV2`，bridge 不把 acceptedClaims 再投影成 V2，明确输出
`legacy_only`。

随后调用 Stage 4D-10B 的 `matchDirectChatMemoryCandidates` 和 `decideDirectChatMemoryBridge`，
不重新实现 pairing。Correlation states 为 `exact`、`ambiguous`、`unmatched_legacy`、
`unmatched_v2`、`legacy_only`、`v2_only`、`duplicate`、`conflict`。scope 必须 exact；source refs
由 runtime binding 提供且 canonicalize；provenance 不可信时不会形成 exact write。

## 4. Additive shadow result and metrics

既有 `DirectChatMemoryAdmissionShadowResult` 增加 `bridgeShadow`，其内容只有 bounded metadata：

* `bridgeCorrelation`、`bridgeState`、`bridgeReason`；
* legacy/V2 semantic kind、authority class、policy/metadata source；
* `wouldWriteProposal`、`wouldSafetyVeto`、`wouldPassthrough`、`wouldReview`、`wouldReject`、
  `wouldRoute`；
* metrics：total、exact、ambiguous、unmatched legacy/V2、legacy-only、V2-only、duplicate、
  conflict、各 bridge state、各 safety-veto reason。

Existing comparator `mismatch`/`mismatchClass`/P0–P4 severity 保持不变；bridge state is a separate
future-action characterization, not a replacement comparator field。

Telemetry exporter adds a root `bridgeShadow` section containing the bounded metrics and observations.
It does not persist raw proposal IDs, idempotency keys, source refs, scope IDs, candidate statements,
evidence quotes, Prompt, response, API key, Authorization or stack. Scope/source fingerprints remain
session-scoped hashes. The buffer remains in memory only and bounded by the existing observation limit;
no localStorage, IndexedDB, network sink or second ledger is introduced.

## 5. Safety-veto shadow semantics

The bridge result is observation-only:

* objective exact candidate: `wouldWriteProposal=true`, but no writer/evaluate call;
* objective legacy fact vs subjective V2: `wouldSafetyVeto=true`;
* durable legacy preference vs temporary V2: `wouldSafetyVeto=true`;
* active legacy future plan vs cancelled/completed V2: `wouldSafetyVeto=true`;
* objective fact vs scene-only or relationship signal: `wouldSafetyVeto=true`;
* belief/hypothesis, stable/unknown preference, active/uncertain plan: review or cautious passthrough;
* event/episodic/relationship-only compatible candidates: route/review metadata only;
* V2-only: review/no write; legacy-only: passthrough;
* ambiguous and conflicting duplicate: review/veto; old reject + V2 accept: review/no write.

`wouldSafetyVeto` never suppresses the production legacy result. Explicit bridge failure is fail-open:
the existing extraction result is returned and only bridge telemetry is lost/marked failed-open.

## 6. Synthetic fixture coverage

`scripts/memoryAdmissionBridgeShadowIntegration.test.ts` drives complete extraction-shaped fixtures through
the real `observeDirectChatMemoryAdmissionShadow` seam. It covers confirmed objective, asserted fact,
subjective/uncertain belief, hypothesis, authority conflict, stable/temporary preference, active/cancelled/
completed/uncertain plan, event, episodic, scene-only, relationship signal, V2-only, legacy-only,
ambiguous, duplicate, conflicting duplicate, scope mismatch, provenance mismatch and malformed metadata.

The same MemoryService-shaped extraction is run with and without observation enabled: provider request
count per run is unchanged and `acceptedClaims`, `extractedMemories` and rejection count are identical.
The exporter test verifies bounded bridge metrics and absence of raw candidate/source/scope/body fields.
Final verification for this stage is 576/576 tests passed, with lint, build, dependency gate, AI accounting
and smoke checks passing. The tracked service-worker cache marker is restored after build verification.

## 7. Non-deltas and remaining gap

No `evaluateKnowledgeWrite` or `commitMemoryWriteBundle` call is added to the bridge. No canonical write,
second idempotency persistence, cursor advance, Summary, ProjectionJob, MemoryItem, Event writer or
RelationshipState update can originate from this integration. Prompt/token, Provider/request count,
retry/fallback and storage remain unchanged. Existing comparator and its schema remain compatible.

This stage resolves **shadow integration** only. It does not resolve production authority, restore real
Batch B/C, collect real Provider evidence, create a Canary flag, or enter cutover. The next stage should
be separately approved real-runtime shadow evidence (still no write), followed by an explicit authority/
canary review only if that evidence is safe.
