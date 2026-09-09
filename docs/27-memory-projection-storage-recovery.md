# Stage 4C-11 — Projection Storage & Recovery Design Spike

> 基线：`807869006a36e2bd35a94ec5bb66cb95d886b1c8`
>
> 本阶段是 STORAGE / RECOVERY CONTRACT / CHARACTERIZATION。新增内容只包括纯 domain revision、纯 in-memory repository、纯 startup reconciliation 和测试/文档；没有真实 durable repository、schema、migration、worker、scheduler、polling、Provider、Offline 或 production projection wiring。

## 1. Canonical revision authority

### 现有 KnowledgeClaim schema

`KnowledgeClaim` 当前真实字段包括：

- identity/scope：`id`, `relationId`, `characterId`, `userIdentityId`, optional `conversationId`
- semantic state：`kind`, `subject`, `statement`, `truthStatus`, `temporalStatus`, `status`
- provenance：`source.kind`, `evidenceKey`, `producer`, `messageIds`, `eventId`, `storyId`, `sourceRecordId`
- mutation context：`recordedAt`, `occurredAt`, `validFrom`, `validTo`, `supersedesId`, `supersededById`, `retractionReason`
- schema/visibility：`schemaVersion`, `visibility`

当前没有 claim-level `updatedAt`、`revision` 或 `version`。`recordedAt` 是记录时间，不是可靠的单调 revision。Repository 的 append/dedup 使用 claim ID、evidence/meaning policy；retract 和 supersede 保留或增加 claim records。

### 候选策略比较

| Strategy | Determinism | Mutation detection | Ordering / duplicate behavior | Multi-tab / migration assessment |
|---|---|---|---|---|
| A. monotonic scope revision | 很好，但当前不存在 authority | 能覆盖所有 mutation | 稳定 | 需要 canonical repository 原子递增和迁移；现在不能凭空使用 |
| B. sorted claim IDs | 很好、简单 | 能发现 add/delete，不能发现 retract、supersede 状态或 in-place edit | 顺序稳定，重复 ID 可去重 | 迁移便宜但语义不足，拒绝作为唯一策略 |
| C. IDs + claim revision | 理想 | 当前没有 claim revision 字段 | 稳定 | 需要 schema 变更，暂不采用 |
| D. max(updatedAt) | 当前没有 `updatedAt`；即使增加也会有同时间戳/删除问题 | 不完整 | 与集合内容无关 | 不足，拒绝 |
| E. stable claim-set fingerprint | 需要少量纯代码 | 可覆盖现有 mutation fields 与 statement edit | 对 descriptor 排序后稳定；重复 descriptor 不改变 | 不需要 schema；适合当前 contract |
| F. repository-maintained revision | 最强 | 能覆盖任意 mutation | 稳定 | 需要 localStorage/IndexedDB 原子 repository；作为未来方向而非现状 |

### 本阶段选择

[memoryCanonicalRevision.ts](../src/domain/memory/memoryCanonicalRevision.ts)（69 LOC）从 exact scope 内的 canonical claims 生成 compact deterministic revision：

1. 使用 ID、status/truthStatus/temporalStatus、timestamps、supersede/retraction links、source refs 和 statement 的非加密 fingerprint；
2. 每个 descriptor 排序，重复 descriptor 去重，因此 append 同一 claim 不改变 revision；
3. 返回 `activeClaimIds`，用于 ConversationSummary job 的 canonical refs；
4. revision 本身不包含 statement/evidence 正文；
5. 这是小型稳定 fingerprint，不是安全 hash，也不引入 hash service/worker/远程计算。

该策略能覆盖当前 repository 支持的 added、retracted、superseded、deleted 以及 statement 变化。若未来允许不更新这些字段的任意原地 mutation，必须先增加明确 mutation revision authority；不能假设 `recordedAt` 足够。

ConversationSummary job 对应的是当前 scope 的 active canonical claim set，而不是 raw chat batch。这样 retract/supersede/delete 会产生新的 revision 并触发重建判断。

## 2. Pure repository contract

[memoryProjectionJobRepository.ts](../src/domain/memory/memoryProjectionJobRepository.ts)（113 LOC）提供 interface 和 `InMemoryMemoryProjectionJobRepository`，仅供 characterization：

```text
get(jobId)
listPending({ scope, projectionKind, includeExpiredRunning, now })
insertIfAbsent(job)
compareAndSet(jobId, expectedVersion, next)
markRunning(jobId, expectedVersion, ownerId, now, leaseUntil)
markCompleted(jobId, expectedVersion, now)
markFailed(jobId, expectedVersion, errorCode, now)
reclaimExpired(now, ownerId, leaseUntil)
```

没有 `saveJobs(jobs[])` 万能接口。Mutation result 是 bounded union：

- `updated`
- `conflict`
- `not_found`

`insertIfAbsent` 返回 `inserted` 或 `exists`，两个 tab 使用同一 deterministic job identity 时最终只有一个逻辑 job。`compareAndSet` 要求 jobId、expectedVersion、next.version（必须是 current+1）和时间顺序一致；不满足时返回 `conflict`，不把正常并发竞争当 exception。

`markRunning` 只接受 pending，并创建 owner lease；`markCompleted`/`markFailed` 只接受 running。过期 running 通过 old version CAS 转为新的 running owner，旧 owner 使用旧 version 完成时必然 conflict。`completed` 是 terminal；新的 canonical revision 使用新的 deterministic jobId。

第一版 ConversationSummary 假设 job 很短，不需要 heartbeat renewal。Lease duration 仍必须由未来 worker 明确设置；若实际 projection 变长，再单独批准 renewal contract。

## 3. Startup reconciliation

[memoryProjectionReconciliation.ts](../src/domain/memory/memoryProjectionReconciliation.ts)（62 LOC）是单 scope pure planner：

```text
canonical snapshot (revision + activeClaimIds + exact scope)
summary metadata (status + sourceClaimIds + optional canonicalRevision)
existing job metadata
        ↓
no_active_claims | current | already_scheduled | missing(job description)
```

它不读取 transcript、不写 storage、不执行 Provider，也不插入 job。未来 startup flow 应是：

```text
App startup
  → load active/recent exact scopes
  → derive canonical revision from claim metadata
  → inspect summary/job metadata
  → insertIfAbsent missing conversation_summary jobs
  → load pending/failed/expired-running jobs
  → future worker may acquire leases
  → app becomes ready
```

如果 canonical revision 是 R2、summary/job 只到 R1 或不存在，则只创建 R2 的 `conversation_summary` job；不会重跑 extraction，也不会扫描完整 transcript。两次 startup 通过 deterministic identity + insertIfAbsent 幂等。

现有 `ConversationSummaryRecord` 没有 `canonicalRevision` 字段。它有 `projectionVersion`、`status`、`sourceClaimIds`、`sourceMessageIds`、`generatedAt`、scope 和 schema version。`projectionVersion` 是 projection algorithm/schema 版本，不是 canonical state revision。没有新 production field 的前提下，旧 summary 的 currentness 只能判定为 unknown；reconciliation 应在 active/recent bounded policy 内安排安全 rebuild，而不是假定旧 summary 已经 current。

历史数据不得在一次启动时全量制造任务。未来应只处理 active/recent scopes，使用 per-start cap，并优先当前活动关系、stale/missing projection。全量历史 backfill 不属于 Stage 4C-11。

## 4. Storage technology audit

### Claims and summaries today

- `KnowledgeClaim`：`phone_character_knowledge_claims`，通过 `readArray/writeArray` 存在 localStorage；`characterKnowledgeRepository` 负责 normalize/dedup/append/retract/supersede。
- `ConversationSummary`：`phone_conversation_summaries`，通过 `readArray/writeArray` 存在 localStorage；repository 按 scope + normalized meaning 合并，并能标记 stale/retracted。
- `MemoryItem`：`phone_memory_vault_items`，同样是 localStorage whole-array/compressed write。
- current cursor：Relationship/Character field，随关系/角色快照保存，不是独立 repository。

### Existing IndexedDB infrastructure

项目已有多个 feature-specific IndexedDB modules：`readingAssetDb`、`messageEntryDb`、`offlineStoryDb`/`offlineStoryEntryDb`、`characterPhoneDb`、`cinemaAssetDb` 等。它们各自 open database、创建 object store、使用 readwrite transaction；部分 repository 有 legacy localStorage fallback、write queue 或 latest-snapshot coalescing。

但当前没有 memory projection 的共享 IndexedDB database、object store、generic repository、canonical revision store、per-record CAS 或跨 localStorage/IndexedDB transaction。现有 `backgroundSchedulerTaskRepository` 也不是答案：它把 bounded snapshots 和 leases 写入 localStorage whole-array，只有 best-effort read-after-write lease verification，没有 job version CAS，也没有 canonical claim transaction。

### Transaction boundary

如果 claims 仍在 localStorage，而 projection jobs 放 IndexedDB，跨 engine 不可能同 transaction。当前正确模型只能是：

```text
canonical localStorage commit
  ↓ (crash gap exists)
startup reconciliation compares canonical revision and summary/job metadata
  ↓
insertIfAbsent projection job
```

Option A（canonical + job same transaction）只有在 canonical claims 和 jobs 迁移到同一 transaction-capable repository 后才成立。对当前 repo，Option B（startup reconciliation）更现实、更诚实；它不能消除瞬时 gap，但可以恢复 canonical success/job missing。

### Future indexes

若未来使用 IndexedDB，Projection Job store 至少需要：

- primary key `jobId`
- `status`
- exact `scopeKey`
- `projectionKind`
- `leaseUntil`
- `updatedAt`

Cursor 可同一 database 但使用不同 object store/repository；不应和 job 记录混成万能表。没有实际 store/migration 在本阶段创建。

## 5. Crash, CAS, lease and retry characterization

1. **Before canonical:** no canonical revision/job/cursor progress; retry intake.
2. **Canonical → job gap:** canonical survives but no job; next startup derives R2 and inserts missing job.
3. **Pending crash:** pending record remains pending.
4. **Running crash:** unexpired lease remains owned; expired lease is reclaimable by old-version CAS.
5. **Projection write/status gap:** future worker rereads summary metadata and marks completed if target revision already exists; otherwise idempotently writes then CASes status.
6. **At-least-once:** preferred policy; exactly-once is not required or realistic. It relies on deterministic job identity and idempotent summary repository behavior.
7. **Two-tab reconcile:** both derive same jobId; `insertIfAbsent` leaves one logical job.
8. **Two-tab lease:** A wins `pending v3 → running v4 owner=A`; B receives `conflict`.
9. **Stale owner:** after expiry, B reclaims `running v4 → running v5 owner=B`; A’s `complete expectedVersion=4` returns conflict.
10. **Retryable errors:** temporary storage failure, transient transaction failure, and projection write failure are candidates for retry; lease conflict is coordination, not a job failure.
11. **Non-retryable until canonical changes:** missing canonical refs and scope mismatch; retrying unchanged inputs cannot fix them. They should remain bounded failed diagnostics until reconciliation sees a new revision or a developer repair is approved.
12. **Age telemetry:** status, attempt count, `createdAt`, `updatedAt`, pending/running/failed age and bounded error code; no正文。

## 6. Privacy and production boundary

The repository contract allows only IDs, exact scope, canonical refs, revision, status, lease, counters, bounded error code and timestamps. It forbids Prompt, message content, transcript, response body, API key, Authorization and evidence quote.

No production module imports the new repository or reconciliation planner. Durable writes added by this stage: **0**. Schema changes: **0**. Provider calls: **0**. Offline behavior: unchanged. No Candidate persistence, Admission cutover, Memory read switch, legacy retirement, Handoff Capsule or MemoryDelta was added.

## Required 72 answers

1. **KnowledgeClaim revision fields:** ID, status/truthStatus, temporal status, recorded/occurred/valid timestamps, supersede links, source refs and statement; no updatedAt/revision/version.
2. **Canonical revision authority recommendation:** current pure deterministic claim-set fingerprint; future stronger authority can be repository-maintained revision after transactional storage.
3. **Rejected revision strategies:** IDs-only, max(updatedAt), random IDs, and assumed monotonic scope revision without a real writer.
4. **Chosen revision semantics:** exact-scope canonical claim descriptors sorted and fingerprinted; active IDs are separate refs for the projection job.
5. **Mutation detection:** add/delete changes descriptors; retract/supersede changes status/links and IDs; source/statement changes change descriptor fingerprint.
6. **Deterministic?:** yes, for the same canonical snapshot.
7. **Ordering stable?:** yes; descriptors and active IDs are sorted.
8. **Duplicate append stable?:** yes for repeated identical canonical claim descriptors; repository normalization remains the source of canonical uniqueness.
9. **Repository interface file:** `src/domain/memory/memoryProjectionJobRepository.ts`.
10. **Repository LOC:** 113 LOC including interface, result types and pure in-memory implementation.
11. **In-memory implementation?:** yes, `InMemoryMemoryProjectionJobRepository`; no production import or persistence.
12. **InsertIfAbsent behavior:** same deterministic jobId returns `exists`; only first insert is logical creation.
13. **CAS behavior:** jobId + expectedVersion + next version must match; otherwise bounded conflict.
14. **CAS conflict result:** `{ kind: "conflict", job?: current }`.
15. **Lease acquire:** pending → running with ownerId and leaseUntil, protected by expectedVersion.
16. **Lease conflict:** competing owner cannot acquire an active running lease; repository returns conflict.
17. **Lease reclaim:** expired running job uses old-version CAS and a new owner lease; status remains running with a new version/attempt.
18. **Stale owner behavior:** old expectedVersion completion/failure is rejected as conflict.
19. **Completed terminal:** completed jobs cannot be rerun; a new canonical revision creates a new job identity.
20. **Retry semantics:** pure job state supports failed → pending; next running attempt increments attemptCount. Durable scheduler/backoff is not implemented.
21. **Error classification:** bounded retryable projection/storage failures versus canonical-missing/scope-mismatch failures that wait for canonical change or diagnostics.
22. **Claims storage today:** localStorage key `phone_character_knowledge_claims` via `characterKnowledgeRepository`.
23. **Summaries storage today:** localStorage key `phone_conversation_summaries` via `conversationSummaryRepository`.
24. **IndexedDB infrastructure today:** feature-specific databases exist for reading, messages, Offline stories, character phone, cinema assets, etc.; no shared memory projection DB.
25. **Transaction support today:** IndexedDB modules have per-database transactions; claims/summaries are separate localStorage keys; no cross-store transaction.
26. **localStorage risks:** whole-array lost updates, quota/serialization pressure, read-modify-write races and no atomic cross-key commit.
27. **Cross-store atomicity:** unavailable while claims remain localStorage and jobs would be IndexedDB.
28. **Canonical→job gap solution:** startup reconciliation from canonical revision plus deterministic insertIfAbsent; eventual same-DB transaction is a later option.
29. **Startup reconciliation input:** exact scope, canonical revision/active claim IDs, summary metadata, existing job metadata; no transcript.
30. **Startup reconciliation output:** at most a missing `conversation_summary` job description for the inspected scope.
31. **Reconciliation idempotency:** deterministic job identity + insertIfAbsent.
32. **Active-scope bounding:** active/recent scopes first, stale/missing only, per-start cap; no full backfill.
33. **Historical backfill strategy:** a separately approved, bounded migration with observability and repair; not automatic startup work.
34. **Current summary metadata:** status, sourceClaimIds/sourceMessageIds, projectionVersion, timestamps, scope and schema version; no canonicalRevision.
35. **Summary-current detection:** future metadata compares canonicalRevision and exact active refs; current records lacking revision are unknown and should be safely rebuildable, not trusted as proof.
36. **Crash before canonical:** no job expected; retry intake.
37. **Crash canonical→job:** reconciliation creates the missing deterministic job on next startup.
38. **Crash pending:** pending remains pending and is listed.
39. **Crash running:** unexpired lease waits; expired lease can be reclaimed with CAS.
40. **Crash projection-write/status gap:** reread current summary metadata, mark complete if already current, otherwise retry idempotently.
41. **At-least-once policy:** yes; exactly-once is not a target.
42. **Summary write idempotency:** existing repository normalizes by scope + meaning and merges source IDs/claim IDs; enough for at-least-once meaning-level writes, subject to current whole-array races.
43. **Two-tab reconcile:** same identity, one logical insert.
44. **Two-tab lease:** one expectedVersion update succeeds, the other returns conflict.
45. **Expired lease:** new owner may reclaim after `leaseUntil`; stale old version is fenced.
46. **Version/CAS:** required for every future per-record mutation and reclaim.
47. **Indexes recommendation:** status, leaseUntil, scopeKey, projectionKind, updatedAt, with jobId primary key.
48. **Cursor/job store separation:** same future IndexedDB database is acceptable, but separate object stores and repositories.
49. **Privacy:** metadata/refs only; no bodies or credentials.
50. **Telemetry metadata:** projection kind, exact scope, attempt count, ages/durations, status and bounded error code.
51. **Production wiring?:** none.
52. **Storage writes?:** zero new durable writes.
53. **Schema changes?:** none.
54. **Provider calls?:** zero delta.
55. **Tests added:** one new focused storage/recovery characterization file; the Stage 4C-10 cursor contract test remains in the suite.
56. **Total tests:** 559/559 after adding this stage's focused test file.
57. **Lint:** required and passed.
58. **Dependency gate:** required and unchanged at 105 baseline edges / 3 cycles.
59. **Build:** required and passed.
60. **AI accounting:** required and unchanged; passed.
61. **Smoke:** not rerun because production import graph is unchanged; Stage 4C-8 smoke baseline remains the applicable baseline.
62. **Commits:** one single-purpose Stage 4C-11 contract/recovery commit, after validation.
63. **Final HEAD:** the new commit based on `807869006a36e2bd35a94ec5bb66cb95d886b1c8`.
64. **Worktree status:** refactor and original repository must be clean.
65. **User data impact:** none; no durable repository or migration was executed.
66. **Rollback:** revert the one Stage 4C-11 commit; no data rollback is required.
67. **Existing debts:** `DIRECT_CHAT_BROWSER_SMOKE`, `REAL_MEMORY_SHADOW_REPORTS_BLOCKED`, `BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`.
68. **New debts:** canonical revision is still derived rather than repository-authoritative; current summaries lack canonicalRevision; cross-store transaction gap remains; no real startup runner/CAS/IndexedDB job store exists.
69. **Storage/recovery contract sufficient?:** sufficient for design/characterization, not sufficient for durable production implementation.
70. **ConversationSummary next?:** yes as the narrow first candidate, but only after repository/reconciliation implementation is separately approved.
71. **Background worker next?:** no automatic worker; the next stage should still implement storage/recovery foundations before execution.
72. **Recommended Stage 4C-12:** a very narrow durable repository + startup reconciliation implementation for ConversationSummary only, after approving IndexedDB schema/transaction design; no legacy mirror, Offline, worker breadth or Admission cutover.

## Explicit decisions

### canonical → projection job 的 crash gap 是否已经有可恢复方案？

有**设计级**可恢复方案：startup reconciliation 用 exact scope、canonical revision、active claim IDs、summary metadata 和 existing job metadata 检测 R2 canonical state 与 R1/missing projection 的差异，并通过 deterministic identity + `insertIfAbsent` 补建 job。它尚未成为真实 durable repository 或 startup runtime，因此不是已部署的恢复能力。

### 下一阶段是否可以开始实现 ConversationSummary 的第一个 durable Background Projection？

**NO。**

本阶段已经证明 pure revision、repository CAS/lease、reconciliation 和 crash cases 可以形成安全合同，但真实 IndexedDB object store、跨 localStorage/IndexedDB gap 的启动入口、CAS transaction、bounded active-scope discovery 和 at-least-once write verification 尚未实现。下一阶段应先实现这些最小 durable foundation，再单独批准 ConversationSummary projection；本阶段完成后停止，不自动进入 Stage 4C-12。
