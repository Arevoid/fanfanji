# Stage 4D-11O-R3C — Runtime Observer Invocation Diagnosis

## Scope and safety boundary

本阶段只做源码审计、确定性测试和 dev-only 诊断修正。没有启动新的真实聊天、没有调用 Provider、没有创建或重放 Memory Admission Window、没有调用 `extractNow()`，也没有执行 R3B 证据重放。R3B 的 closure 记录仍保留在其既有 commit 中。

- Starting HEAD: `86ad7479ae44d995c8b26a50a7181d5db3c69b5b`
- R3B closure: `window-3233cb04d44d8dde`, `closed_unrecoverable / collector_gap`
- Readiness after this change: `RUNTIME_OBSERVER_INVOCATION_FIX_LOCAL_VALIDATED`

## Audited invocation path

生产等价的 direct-chat archive path 在 `useChatMemoryExtraction` 中按以下顺序执行：

1. `handleExtractMemories` 被调用时读取 `activeCharacter`、`activeDirectScope`、`manualMessagesOverride` 和 Collector enablement，计算 `longEvidenceEnabled`。
2. 启用时读取只读的 `longEvidenceBefore` canonical snapshot，并创建 `logicalActionId`。
3. 现有 Memory extraction、provider fallback、canonical write 和 archive cursor 流程照旧执行。
4. admission Shadow result 在既有 observation gate 下产生；它不授予写权限。
5. canonical write 和 cursor advancement 完成后，再读取只读 `canonicalAfter`。
6. 只有 `longEvidenceEnabled`、`logicalActionId`、`longEvidenceBefore`、`shadowResult` 和 `canonicalAfter` 都存在时，才调用 `observeDirectChatMemoryLongEvidenceRuntime`。缺失条件会留下受控的 `observer_skipped` trace。
7. Runtime observer 只把 metadata/accounting 交给 Collector；Collector 再按 active Window、session 和 scope binding 进行 append。

`logicalActionId` 在 provider fallback 的同一逻辑请求参数中传递；fallback attempt 不会变成额外的逻辑 action。`longEvidenceBefore`/`canonicalAfter` 是 readback snapshot，不包含消息正文写入，也不改变 canonical authority。

## Preconditions and legitimate skips

| Gate | 来源 | 缺失时行为 |
| --- | --- | --- |
| Direct, non-group scope | `activeCharacter`, `activeDirectScope` | 不启用 long-evidence observer |
| Automatic extraction path | `manualMessagesOverride === undefined` | 手工/覆盖消息路径不进入正式 observer |
| Collector enabled | `isDirectChatMemoryLongEvidenceCollectorEnabled()` | 记录 `long_evidence_disabled` 或 runtime `collector_inactive` |
| Before snapshot | `readDirectChatMemoryCanonicalReadback` | 记录 `before_snapshot_missing` |
| Logical action | `createAiActionId()` | 记录 `logical_action_missing` |
| Admission Shadow result | 现有 admission observation gate | 记录 `shadow_result_missing` |
| After snapshot | canonical readback after cursor | 记录 `canonical_after_missing` |
| Active Window/session | Collector module state | append 被拒绝；不影响主回复 |

Runtime observer 的合法 early return 是 Collector 未启用、没有 active session/window 或 append 被 Collector 拒绝。observer 内部异常会被捕获并转为 dev trace，不向聊天流程抛出异常。

## Root-cause classification

R3B 失败形状与源码审计共同指向 **H — HMR stale runtime enablement closure / module-instance split**：Collector 的 `installDevApi` 原先在全局对象已经存在时直接 return。Vite HMR 可以重新加载 hook/runtime 模块（实例 B），但 dev helper 仍然指向旧 Collector 实例 A；于是 helper 显示的 Window/enablement 与 observer 实际读取的模块状态不一致。React callback 本身在 invocation 时读取 gate，不是本次根因。

修正为每次模块评估都重新绑定 dev API，并暴露仅供测试读取的非敏感 `instanceOrdinal`。这样 HMR 后 helper 与当前模块实例重新对齐，同时不会暴露 Window token、session nonce、logical action id、消息正文或凭据。生产构建不会安装该 dev API。

## Bounded diagnostics

新增 `window.__fanfanjiMemoryEvidenceTrace` 仅在 Vite dev 或 test 环境存在，最多保留 64 条 metadata entry。允许字段是 stage、timestamp、布尔 gate、计数、有限 reason enum 和 Collector instance ordinal；导出 schema 为 `memory-admission-v2-runtime-trace-1`。禁止 prompt、response、message、token、secret、Authorization、API key、raw error 和任何 logical/request identifier。

Trace stage 覆盖 extraction completed、gate checked、snapshot/action/shadow/canonical-after presence、observer attempted/entered/skipped，以及 Collector append attempted/succeeded/rejected。它只帮助定位 invocation gap，不改变 extraction、retry/fallback、Provider、Prompt、threshold、cursor 或 canonical write 语义。

## Deterministic coverage

- `scripts/directChatMemoryEvidenceTrace.test.ts`: 64-entry bound、safe reason/field sanitization、privacy guard。
- `scripts/directChatMemoryLongEvidenceHmr.test.ts`: stale global helper 被当前 Collector module 的 dev API 重新绑定，并带当前 `instanceOrdinal`。
- `scripts/directChatMemoryLongEvidenceRuntime.test.ts`: late enable、zero-candidate、fallback-shaped logical action、observer entered/skipped、Collector append 结果。
- Existing collector, reviewer, campaign-governance and dependency-baseline tests remain unchanged and continue to pass.

## Non-goals and next step

本阶段没有修改 Prompt/Provider/Retry/Fallback/Memory admission authority、用户数据、阈值、storage schema 或 UI。没有新增真实 runtime evidence；R3B 的 Collector gap 仍需后续验证。建议下一阶段只做 **Stage 4D-11O-R3D — minimal local revalidation**：在用户明确授权且运行环境可用时，先确认当前 helper/module instance 对齐，再执行受控的最小 observer invocation 验证；不要自动进入 RG2 或扩大到新的 Window/campaign。
