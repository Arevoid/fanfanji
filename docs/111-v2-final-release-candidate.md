# Fanfanji V2 — Final Release Candidate

日期：2026-09-15
最终 source anchor：`4291c20846441922b8c6a497a5cdf6414f154765`（本轮 Original Requirement Closure；promotion source：`919b11f12642fa1041ece9671495f6ebb21340df`）
分支：`refactor/v2-architecture`（未 push、未 merge、未 deploy）。

## 1. 状态收敛

本 RC 建立在两个已经完成的里程碑上：

- `MEMORY V2 PROMOTED — CLOSURE COMPLETE`
- `FIRST USABLE BASELINE REACHED — REAL BACKUP ALREADY ACCEPTED`

Promotion 使用不可变策略 `memory-admission-v2-promotion-2`。运行时启动会先检查已审阅的 sanitized gate，再启用既有 Direct Chat Safety-veto 与同操作 Safety-shadow；legacy writer 保留。campaign 采集本身仍关闭，历史 evidence 不被重写。

当前批准 gate（来自既有 authoritative synthetic campaign）：

```text
formal sessions       16
exact scopes           4
automatic batches     20
valid controls        14
valid suppressions    10
evidence days          5
incidents              0/0/0
promotionEligible      true
```

回滚入口为 `rollbackMemoryAdmissionV2()`；它不做 destructive migration，canonical data 和旧版兼容路径保持可读。

## 2. First Usable Baseline 与真实 backup 对账

Early Daily-Use Baseline 已保留。真实 backup 的验收是此前完成的 authoritative 结果，本轮没有重新读取或重放真实 backup，也没有要求用户再次上传：

```text
backup = xiaoshouji_backup_20260912.json
format = fanfanji-system-backup v3
19 characters / 18 relations / 17 conversations
same-name different-ID = 2 groups / 5 records preserved
Direct Chat = 2062 → 2064 persisted
Memory readable = 49
canonical Knowledge = 78
Summary = 6
cross-character isolation = PASS
Offline/Diary/Moments/Character Phone/Reading/Forum/Settings = PASS
re-export = 19 characters / 116 moments / 2064 messages / 6 phones
Browser = N/A (phone locked at that acceptance)
```

以上是历史 accepted real-backup evidence，不是本轮 synthetic 结果；本轮只用 synthetic round-trip 再确认 V3 restore、legacy migration、reload 和 compensating rollback。

## 3. Synthetic full-life regression

执行 `scripts/offlineExitImmediateHandoff.test.ts`、`scripts/v2FinalEngineeringConsolidation.test.ts` 与相关专项回归，覆盖以下正常链路：

```text
create synthetic character/scope
→ Direct Chat interaction persistence
→ scoped Memory/handoff facts
→ Offline story completion
→ immediate Online handoff
→ bounded async-consolidation contract
→ Topic transition
→ Emotion delta/decay
→ Belief/Impression projection
→ Relationship projection/growth
→ Life State and Schedule
→ confirmed Event
→ OpenLoop create/fulfil
→ proactive eligibility and cooldown
→ Diary/private boundary
→ Moments/Browser/Reading boundary
→ Character Phone scope
→ system backup v3
→ restore and reload
```

回归重点：canonical ID 全程一致；foreign scope 被过滤；同一 life 只有一份 durable state；Scene 不被 Memory/History 污染；logical/physical request accounting 不丢失；没有 Provider 请求、真实聊天、真实 Diary 或真实 backup。

## 4. 原始痛点验收

完整的用户视角表见 [`docs/110-v2-original-pain-points-final-acceptance.md`](110-v2-original-pain-points-final-acceptance.md)。其关键结论为：

```text
OFFLINE_EXIT_BLOCKED_BY_HEAVY_MEMORY = false
SAME_NAME_CROSS_CHARACTER_LEAK = false
MEMORY_SCOPE_LEAK = false
```

取消计划已进入 production Safety-veto gate；temporary preference 仍诚实标记为 shadow-only/长期观察，不把未 productionized 语义包装成“已完成”。

本次 Original Requirement Gap Closure 继续保持 feature-freeze 边界，只补齐两个入口/隔离验收缺口：

- Offline 从 Online 进入已有可恢复故事时，先按 exact character/relation/identity scope 展示“继续之前的剧情 / 开启新的剧情 / 先不进入”，不再自动替用户决定；已有非阻塞 handoff 语义保持不变。
- Browser/Reading 作为角色手机内独立窗口按 owner identity + character ID 隔离；新增 synthetic cross-character regression，并复核 Cloudflare/HTML 错误页只生成友好状态。

对应证据：`scripts/offlineStoryResumePolicy.test.ts`、`scripts/characterPhoneBrowserScope.test.ts`、`scripts/characterPhoneBrowserDetails.test.ts`。本次没有新增持久化字段，因此 V3 backup schema/legacy restore 兼容前提未改变。

## 5. Cloudflare Worker RC

`src/cloudflare/worker.ts` 的 `includeV2Shadow` forwarding 修复已通过：

- `scripts/cloudflareMemoryV2Forwarding.test.ts`：PASS；online route 传递 V2 shadow，offline route 强制关闭。
- `npm run build`：已生成并验证 production bundle/server bundle。
- local Worker handler 与 package wiring：通过现有 Worker regression 和 release checks。

本轮没有更新正式 Early Daily-Use Worker，也没有执行 external deployment。若要把这条路径发布到 Cloudflare，需要单独的 reviewer/user authorization：

`EXTERNAL DEPLOYMENT PENDING USER AUTHORIZATION`

这是 release/operational follow-up，不是当前本地 source blocker。

## 6. 安全债务

`npm audit --omit=dev --audit-level=high` 仍报告既有依赖债务：1 high（`@xmldom/xmldom`）和 3 moderate（`qs` 依赖链）。本 RC 未擅自升级依赖；`scripts/securityGovernanceCheck.ts` 通过，未发现因 V2 新增的 secret、privacy 或 governance blocker。依赖升级应作为独立安全变更处理。

## 7. 验证清单

本轮已执行或复核：

| 检查 | 结果 |
| --- | --- |
| `npm test` | PASS（本轮 626/626；包含 Offline resume/new 与 Browser scope 回归） |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run install:check` | PASS |
| `npm run release:check` | PASS |
| `npm run smoke:check` | PASS |
| dependency direction gate | PASS（105 edges / 3 cycles，未恶化） |
| security governance | PASS |
| `git diff --check` | PASS |
| promotion / rollback | PASS |
| Worker forwarding | PASS |
| request accounting / failure safety | PASS |
| synthetic backup/restore/reload | PASS |

安全债务的 npm audit 数量不作为本轮代码回归失败；它已单独列入 release governance debt。

## 8. 工作区、数据和发布边界

本 RC 先前已修复 Offline 退出的 final blocker（先持久化 handoff、再异步启动既有 Memory consolidation）；本次 Original Requirement Closure 在 feature-freeze 边界内补齐 Offline 入口选择与 Browser 隔离回归，对应源代码与 deterministic regression 已固定于 source commit `4291c20846441922b8c6a497a5cdf6414f154765`。工作区原有 13 项 dirty 内容保持原样，分类如下：

- 1 个历史 campaign manifest 修改：既有 synthetic evidence 记录；不覆盖。
- 3 个 API/settings runtime 配置修改及 `scripts/textApiRuntimeConfig.test.ts`：既有用户/API 设置修复；不扩大。
- 8 个 `window-*` evidence 目录：既有 campaign evidence；不重写、不删除。
- 本轮不读取、不复制、不打印任何 API key、Authorization、真实聊天、Diary、Memory 或真实 browser profile。

本轮 source code 是否修改：`yes`（仅 offline-exit blocker 修复；没有架构扩张或产品功能新增）。本轮 real user data used：`NO`。credential exposed：`NO`。

Git 操作边界：不 push、不 merge、不 deploy；不提交 profile、backup、campaign artifact 或 secret。

## 9. 最终判断与后续动作

没有发现 V2 代码级 RC blocker。剩余事项均是有边界的运维/观察动作：

1. 由 reviewer/user 单独授权后，再决定是否进行 Cloudflare external deployment；不得覆盖 Early Daily-Use 版本。
2. 继续观察 promotion 后原七天 horizon 与真实长期使用，尤其是 temporary preference 的 shadow 结果；不伪造 evidence day。
3. 另立安全变更处理 npm audit 的既有 1 high/3 moderate 依赖债务。

在上述边界下，本地 source、runtime、backup 兼容、回滚、安全与文档门禁均达到 RC 要求。
