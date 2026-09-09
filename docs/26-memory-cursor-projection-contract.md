# Stage 4C-10 — Memory Cursor & Durable Projection Contract Foundation

> 基线：`68ec43e1f9dc803b7e3c3fa9751ec538b5770523`
>
> 本阶段实现的是 CONTRACT / CHARACTERIZATION / SHADOW FOUNDATION。没有 production wiring、storage schema、migration、queue executor、worker、scheduler、polling、Provider call、Offline 行为变更或 Admission cutover。

## 1. Current cursor audit

现有字段 `lastImmediateSummaryMsgId` 出现在 `Character` 和 `CharacterRelationship` 兼容结构中。实际读写如下：

| Path | File / function | Read or write | Scope | 实际保证 |
|---|---|---|---|---|
| Direct Chat Cheap Filter skip | `chatSideEffectController.afterReplySuccess` | relationship write | relation + current character | source batch 已通过 Cheap Filter 评估为低价值；不代表 extraction、summary 或 legacy 完成 |
| Direct Chat automatic extraction success | `chatSideEffectController.afterReplySuccess` scheduled task | relationship write | relation | `extractMemories` 返回非负；Direct hook 只有 canonical + summary 成功才返回非负，零 claim 也算成功；不代表 legacy/diary/其他 side effect |
| Direct Chat extraction boundary | `chatSideEffectController.afterReplySuccess`、`useChatMemoryExtraction.selectUnarchivedChatMessages` | relationship read | relation | marker 后的消息成为下一次 eligible source；marker 缺失时重新处理当前加载范围 |
| Manual archive | `useChatMemoryExtraction.handleExtractMemories` | relationship/character read + write | direct relation 或 group character | direct path 在 canonical+summary 成功后更新；group path 在本批 claims/summaries 处理后更新 |
| Immediate summary UI action | `App.tsx:handleStartImmediateSummary` | relationship read + write | explicit relation | canonical claim 写成功后即更新 marker，即使 summary write 失败只 warning；因此它只保证 source evaluated + canonical committed |
| Group archive | `useChatMemoryExtraction.handleExtractMemories` | character field write | group character | 批次 API summary、claims 和 ConversationSummary 流程完成后推进；没有 relation cursor |
| Relationship cleanup | `useChatRelationshipCleanupActions.clearFriendScopedMemory` | write/reset | relation | 清理关系时清除 cursor 与 compressedMemory；不是 processing progress |
| Relationship migration | `relationshipMigration.ts` | merge/read/write | relation | 重复关系合并时保留已有非空 cursor；不产生新的 processing semantics |
| Offline | OfflineStory sync hooks | no `lastImmediateSummaryMsgId` read/write | story + relation | 使用 `syncedSourceMessageIds`、`memorySyncStatus`、`archivedAt` 等 OfflineStory 字段；不能把 relationship cursor 当 Offline cursor |
| Start-chat / handoff | audited `AppChat`, Offline handoff context and start hooks | no current cursor read/write | story/handoff | handoff 读取 story source/sync markers，而非 `lastImmediateSummaryMsgId` |
| UI/debug | immediate-summary task state | no cursor read | character/relation | `phone_immediate_summary_task` 只记录 UI task 状态，不等于 source cursor |

因此当前 cursor writer 共有 Cheap Filter、自动 Direct extraction、manual archive、immediate summary、Group archive、cleanup/migration merge；reader 主要是 Direct/Group extraction boundary 和 Direct side-effect boundary。没有独立 Offline reader、handoff reader 或 durable projection reader。

### Current field guarantees by path

- **Cheap Filter skip:** A — source messages were evaluated; not B/C/D/E/F.
- **Direct automatic extraction with accepted claims:** A + B + C + D for the current direct hook, because the hook returns failure when canonical or summary write fails; not E/F.
- **Direct automatic extraction with zero accepted claims:** A + B (successful extraction with zero claims) and no canonical write was needed; not D/E/F.
- **Direct manual archive:** A + B + C + D when the `useChatMemoryExtraction` path succeeds; not E/F.
- **Immediate summary UI path:** A + B + C; D may be false because summary failure is warned but marker still advances; not E/F.
- **Group path:** A + B + C + D for a successful batch with records; not E/F. A no-record batch advances without a new projection.
- **Canonical write failure:** no cursor advancement in the direct extraction path; A may have happened in memory, but no durable processing progress is claimed.
- **Cursor callback failure:** claims/summary may already be durable; cursor guarantee is absent and a later pass can re-evaluate the range.

The field therefore does **not** mean “Summary completed to here”. The least surprising future name is `processedThroughMessageId` inside an explicit `MemorySourceProcessingCursor`; if a persisted compatibility field eventually needs a name, `archiveProcessedThroughMessageId` is more accurate than `lastImmediateSummaryMsgId`.

## 2. Target source cursor contract

The pure contract is implemented in [memorySourceProcessingCursor.ts](../src/domain/memory/memorySourceProcessingCursor.ts) (68 LOC). It is not imported by production writers.

```ts
type MemorySourceProcessingCursor = {
  sourceType: "direct_chat" | "group_chat" | "offline_story";
  scope: {
    characterId: string;
    relationId: string;
    userIdentityId: string;
    conversationId: string;
  };
  processedThroughMessageId: string;
  processedAt: number;
  processingOutcome:
    | "skipped_low_value"
    | "extracted_zero_candidates"
    | "canonical_committed"
    | "canonical_and_projection_committed";
};
```

The contract intentionally records source progress and a bounded outcome, not projection state. `canonical_and_projection_committed` is an observation of a completed combined operation; it must not be interpreted as a requirement that every future projection exists. Scope validation rejects blank IDs and never treats missing relation, identity, character, or conversation as a wildcard.

### Cursor policy

- Cheap Filter skip advances the source cursor because the source batch was explicitly evaluated; it never means `summary_completed`.
- Successful extraction with zero accepted claims advances the cursor because the source was evaluated and should not be sent repeatedly.
- Canonical success plus summary failure should advance the future source cursor with outcome `canonical_committed` and create a failed/pending projection job. Current production code does not yet do this; this stage only records the target contract.
- Canonical failure must not advance the future source cursor.
- Cursor and projection status are separate records. A cursor never carries “legacy mirror done” or “index done” booleans.

Current storage is not renamed or migrated.

## 3. Projection Job contract

The pure contract is implemented in [memoryProjectionJob.ts](../src/domain/memory/memoryProjectionJob.ts) (133 LOC). It has no storage imports and no runtime caller.

```ts
type MemoryProjectionJob = {
  jobId: string;
  projectionKind: "conversation_summary" | "legacy_memory_mirror";
  scope: { characterId: string; relationId: string; userIdentityId: string; conversationId: string };
  canonicalRefs: string[];
  canonicalRevision: string;
  status: "pending" | "running" | "completed" | "failed";
  attemptCount: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  lastErrorCode?: BoundedProjectionErrorCode;
  lease?: { ownerId: string; leaseUntil: number };
};
```

The first contract intentionally has only two real kinds: `conversation_summary` and `legacy_memory_mirror`. `memory_index` remains a future extension rather than an unused third implementation. A job contains canonical claim/event/reference IDs, exact scope, revision, counters, status, lease metadata and bounded error code. It does not contain Prompt, transcript, response, API key, Authorization, evidence quote/body, or full candidate statements.

### Identity and revision

`jobId` is deterministic from `projectionKind + exact scope + canonicalRevision + sorted unique canonicalRefs`. Reordering or repeating refs produces the same identity; adding a canonical ref or changing revision produces new work. A random ID may be added later as an observability correlation ID, but it is not the dedup key.

`canonicalRevision` is an opaque caller-supplied revision. The minimum safe policy is to derive it from the canonical write boundary (for example a monotonic scope revision or a stable claim-set revision); this stage deliberately does not add hashing infrastructure or a new canonical revision field. The ref set remains part of the identity, so a new claim set cannot silently reuse the old job.

### Status state machine

Allowed transitions:

```text
pending --start(owner, lease)--> running --complete--> completed
                                  |
                                  +--fail(errorCode)--> failed --retry--> pending
```

- `attemptCount` increments only when `pending → running`.
- `version` increments on every transition and is the future compare-and-set token.
- `lastErrorCode` is set only on failure and cleared on retry/start/complete.
- `completedAt` is set only on completion.
- `completed` is terminal for this job identity; a new canonical revision creates a new job.
- Illegal transitions include `pending → failed`, `pending → completed`, `running → pending`, `failed → completed`, and any transition out of `completed`.

The bounded error code set is `CANONICAL_MISSING`, `SUMMARY_WRITE_FAILED`, `LEGACY_MIRROR_FAILED`, `SCOPE_MISMATCH`, `LEASE_CONFLICT`, and `UNKNOWN`. Unknown runtime errors normalize to `UNKNOWN`; no exception body or stack is persisted.

## 4. Crash windows and recovery design

| Crash point | Current behavior | Future contract/recovery |
|---|---|---|
| Before canonical commit | no durable claim and no job; source cursor should remain behind | retry intake from source; no projection job is needed |
| Canonical success, before job creation | claims survive, but current system has no durable pending record; most dangerous gap | atomic outbox/intent or startup reconciliation from canonical revision + missing projection |
| Job pending | not currently persisted | startup loads pending, validates refs/scope, then attempts lease acquisition |
| Job running | no durable worker/lease today | expired lease becomes reclaimable; do not rely on a timer surviving refresh |
| Projection write succeeded, status not completed | possible with separate writes | retry must reread/dedupe projection, then CAS status to completed |
| Completed, duplicate startup | should be a no-op | status/version and deterministic identity prevent repeated logical work |

The canonical-to-job gap cannot be safely closed by merely writing two localStorage keys. The future options are: a transaction-capable repository, a local outbox, canonical record carrying a “projection-needed revision”, or startup reconciliation. This stage recommends documenting and characterizing the gap before choosing one.

### Outbox evaluation

The Local Outbox concept fits the desired boundary (`canonical commit + projection intent`), but current repositories use whole-array localStorage read/merge/write across independent keys. Without a transaction, a localStorage outbox would still have a commit gap or lost update across tabs. The preferred long-term direction is a dedicated transaction-capable repository (likely IndexedDB) or a canonical revision that startup can reconcile. No outbox is implemented here.

## 5. Storage, lease, and scope recommendations

### Pending state location

| Option | Assessment |
|---|---|
| Existing localStorage key | easy to inspect, but whole-array writes, quota, lost updates and crash gaps make it unsuitable for a growing job set |
| Dedicated localStorage repository | acceptable only as a short-lived shadow/very small fallback; still lacks atomicity and multi-tab CAS |
| Embedded on Relationship | reject: couples domain state to task lifecycle, breaks multi-conversation/identity separation and inflates relationship records |
| Embedded on ConversationSummary | reject: summary is a projection, not a queue; missing summaries cannot own their own rebuild metadata safely |
| Embedded on OfflineStory | only story-local handoff metadata belongs there; normal Direct Chat projections do not |
| Dedicated IndexedDB repository | recommended eventual durable home: per-job records, indexes, atomic claim+intent transaction, version/lease updates, larger payload headroom |

Recommendation: keep the current stage storage-neutral and shadow-only. When durable implementation is approved, use a `MemoryProjectionJobRepository` with IndexedDB as the primary store; a small localStorage fallback should be considered only if an explicit loss-tolerant mode is accepted. Do not migrate all existing storage as part of this contract.

### Multi-tab lease contract

The pure helper models `{ ownerId, leaseUntil }` and `version` but does not persist or schedule anything:

1. A tab can acquire a pending job when it has no lease, owns the lease, or the existing lease has expired.
2. A second tab must refuse an unexpired lease from another owner.
3. Lease acquisition and status changes must be compare-and-set by `version` in the future repository.
4. A crashed tab leaves a lease that becomes reclaimable after `leaseUntil`; no timer is required to make it reclaimable.
5. Reclaim creates a new running attempt and increments `attemptCount`; the old owner cannot commit a stale version.

This is a lease contract, not leader election.

### Cursor storage

The current relationship field should remain untouched for compatibility. Future source cursors should live in a dedicated repository because they are processing metadata, not relationship semantics; this also handles multiple conversations, identities, group scopes and Offline stories without overloading a relation object. Migration should be additive and per exact scope.

## 6. Projection and retrieval policy

`ConversationSummaryRecord` already has `status: active | stale | retracted`, `sourceClaimIds`, `sourceMessageIds`, timestamps, `projectionVersion`, and schema version. It does not have `rebuilding`; a pending/running job should remain outside the summary record. Existing claim mutation marks summaries stale, so the current status model can support a future rebuild without a parallel status system.

Future reader policy:

- `active` summary may be used normally.
- `stale` or missing summary is a cache miss; use canonical Truth claims/events when available.
- Do not block the chat or synchronously rebuild merely because a summary job is pending.
- `retracted` summary must not be used as active truth.

Direct ConversationSummary generation is currently local from accepted claims; it is not a second AI call. Therefore the first Background Consolidation implementation can be Provider-free: read canonical claims, build the local projection, write it idempotently. Legacy mirror is a later candidate because live readers remain.

Cursor/job interaction target:

```text
source batch evaluated
  -> canonical claims committed (or zero-candidate result)
  -> source cursor advances
  -> conversation_summary job pending/failed
  -> retrieval uses claims while summary is missing/stale
```

This avoids repeating extraction only because a derived summary write failed. It is a target contract; current Direct hook intentionally keeps the marker behind a summary failure for safety.

## 7. Offline fit and queue boundary

The same `MemoryProjectionJob` shape can eventually represent Offline `conversation_summary` and `legacy_memory_mirror` work after canonical Offline claims exist. It must not represent Offline extraction itself, scene completion, Handoff Capsule, MemoryDelta, relationship transition, or a raw transcript queue. Offline extraction/canonical intake is a separate durable-work problem.

`MemoryProjectionJob` is not a universal queue:

- not a raw source batch queue;
- not an extraction Provider job;
- not a candidate queue;
- not an Admission queue;
- only canonical → derived projection work.

This keeps the contract small and prevents a future God Service.

## 8. Characterization coverage

The pure characterization test is [memoryCursorProjectionContract.test.ts](../scripts/memoryCursorProjectionContract.test.ts). It covers 20 checks:

- exact scope and no wildcard/blank IDs;
- all four cursor outcomes;
- stable cursor serialization shape;
- Cheap Filter/zero-candidate/canonical/projection outcome vocabulary;
- deterministic job identity and sorted/deduped canonical refs;
- new canonical refs create new work;
- missing canonical refs rejected;
- pending/running/failed/retry/completed transitions;
- illegal transition rejection;
- attempt count and optimistic version increments;
- lease ownership, conflict and expiry/reclaim;
- unknown error normalization;
- no Prompt, transcript, API key, response body or evidence body in a job.

No production writer or worker imports these contracts. No storage write, schema change, migration, Provider call or UI was added.

## Required 78 answers

1. **Current cursor writers:** Direct Cheap Filter, automatic Direct extraction, manual archive, immediate summary, Group archive, cleanup/reset, and relationship migration merge.
2. **Current cursor readers:** Direct side-effect boundary, Direct/Group extraction boundary, and migration/cleanup data paths; no Offline/handoff reader.
3. **Current guarantees per path:** Cheap Filter = source evaluated; Direct hook success = source + extraction + canonical + summary; zero claims = evaluated/no facts; immediate summary = source + canonical only if summary fails; Group success = batch extraction/canonical/summary.
4. **Semantic mismatch:** the name says “immediate summary”, while the field is an archive/source-processing boundary with path-specific guarantees.
5. **Target cursor semantic:** source evaluation progress, not all projection completion.
6. **Target name:** `processedThroughMessageId` in a `MemorySourceProcessingCursor`; future persisted compatibility wording `archiveProcessedThroughMessageId`.
7. **Cursor scope:** characterId, relationId, userIdentityId, conversationId, plus sourceType; no wildcard dimensions.
8. **Cursor storage recommendation:** dedicated repository eventually; do not continue expanding Relationship semantics.
9. **Cheap Filter behavior:** advance cursor with `skipped_low_value`; never imply summary completion.
10. **Zero-claim behavior:** advance cursor with `extracted_zero_candidates` after successful evaluation.
11. **Canonical-success behavior:** advance with `canonical_committed`; create projection work separately.
12. **Summary-failure behavior:** target cursor still advances; projection job is failed/pending. Current production path intentionally does not yet advance.
13. **Canonical-failure behavior:** do not advance target cursor; retry intake.
14. **Projection separation rationale:** claims, summaries, mirrors and indexes have different failure/retry/rebuild semantics.
15. **Job contract file:** `src/domain/memory/memoryProjectionJob.ts`.
16. **Job LOC:** 133 LOC; cursor contract 68 LOC; both remain below the preferred 200 LOC per contract.
17. **Projection kinds:** `conversation_summary` and `legacy_memory_mirror`; no speculative 20-kind taxonomy.
18. **Job scope:** exact character/relation/identity/conversation scope.
19. **Canonical refs:** sorted unique canonical IDs; no raw transcript or body.
20. **Job identity:** projection kind + exact scope + canonical revision + sorted refs.
21. **Job dedup:** deterministic identity collapses reordered/duplicate ref creation; new refs/revision create new work.
22. **Revision/version policy:** caller supplies opaque canonical revision; job `version` supports future CAS; no hash infrastructure added.
23. **Statuses:** pending, running, completed, failed.
24. **Legal transitions:** pending→running→completed; running→failed; failed→pending for retry.
25. **Illegal transitions:** all terminal/skip transitions not listed above, including pending→completed and completed→anything.
26. **Retry semantics:** failed→pending clears error/lease; next start increments attempt count.
27. **Attempt count:** starts at 0; increments on each pending→running attempt.
28. **Error policy:** bounded error codes only; unknown values become `UNKNOWN`.
29. **Body/privacy policy:** no Prompt, transcript, response, API key, Authorization, evidence quote/body or full candidate statements.
30. **Crash before canonical:** no claim/job/cursor progress; retry intake.
31. **Crash canonical→job gap:** current dangerous gap; future transaction/outbox/reconciliation required.
32. **Crash pending:** future startup loads, validates refs/scope, acquires lease and resumes.
33. **Crash running:** expired lease becomes reclaimable; stale owner cannot CAS a newer version.
34. **Crash after projection write before completed:** reread/dedupe projection and CAS status to completed.
35. **Startup reconciliation:** load pending/failed and stale-running jobs, validate canonical refs, acquire versioned lease, resume bounded work.
36. **Outbox recommendation:** conceptually suitable, but not implementable safely across current localStorage keys; defer to transaction-capable storage or canonical revision reconciliation.
37. **localStorage suitability:** acceptable only for shadow/small fallback; poor for growing durable jobs due whole-array writes, quota, lost updates and cross-key gaps.
38. **IndexedDB suitability:** recommended eventual first durable home for jobs/cursor/intent because transactions, per-record updates and indexes matter.
39. **Multi-tab lease design:** ownerId + leaseUntil + version compare-and-set; second tab refuses active owner.
40. **Lease expiry:** running + expired lease is reclaimable; no timer persistence assumption.
41. **Optimistic version:** yes; increment every transition and require repository CAS.
42. **Failure telemetry:** projection kind, scope, attempt count, age, pending duration, completion duration, bounded last error code.
43. **User UI recommendation:** ordinary users should not see projection jobs or errors by default.
44. **Developer diagnostics:** expose metadata-only job state in a future developer/diagnostics view.
45. **ConversationSummary first candidate:** yes, conceptually; it is derived, rebuildable, claim-linked, and Provider-free.
46. **Legacy mirror timing:** later than ConversationSummary because live legacy readers and weaker provenance remain.
47. **Cursor/job interaction:** target is canonical commit → cursor advance → summary job pending; current implementation remains conservative until durable recovery exists.
48. **Retrieval while summary pending:** use canonical Truth; missing/stale summary is cache miss, never “no memory”.
49. **Stale summary policy:** ignore stale/retracted summaries for active retrieval; do not block or synchronously rebuild.
50. **Existing summary status support:** active/stale/retracted plus source IDs and projection version is sufficient; no `rebuilding` field added.
51. **Provider requirement:** no new Provider call; direct summary is local projection from claims.
52. **Offline fit:** same projection job can later cover Offline summary/mirror only after canonical intake; not Offline extraction or handoff.
53. **Why not universal queue:** raw intake, extraction, candidate admission and canonical→derived projection have different payload/privacy/retry semantics.
54. **Shadow construction added?:** yes, pure constructors and state helpers only.
55. **Production wiring?:** none; no production writer/worker imports the contracts.
56. **Storage writes?:** none added.
57. **Schema changes?:** none.
58. **Provider calls?:** none.
59. **Tests added:** one focused contract test file with 20 checks.
60. **Total tests:** 558/558 after adding the test file.
61. **Lint:** required and passed after contract addition.
62. **Dependency gate:** required unchanged: 105 baseline edges / 3 cycles.
63. **Build:** required for pure TS contract stage and must pass before commit.
64. **AI accounting:** unchanged; no new AI call or accounting path.
65. **Smoke:** production import graph is unchanged; Stage 4C-8 smoke baseline remains applicable, with existing browser debt.
66. **Commits:** one contract/characterization commit, with documentation in the same single-purpose stage commit if the final diff remains coherent.
67. **Final HEAD:** the commit created after the final validation, based on `68ec43e1f9dc803b7e3c3fa9751ec538b5770523`.
68. **Worktree status:** refactor and original repository must both be clean.
69. **User data impact:** none; contracts are not wired and no storage is written.
70. **Rollback:** revert the Stage 4C-10 commit; no runtime data migration is required.
71. **Existing debts:** `DIRECT_CHAT_BROWSER_SMOKE`, `REAL_MEMORY_SHADOW_REPORTS_BLOCKED`, `BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`.
72. **New debts:** current cursor remains conservative on summary failure; no durable pending record; canonical→job gap; no IndexedDB job repository; revision source is not yet standardized.
73. **Storage recommendation:** eventual dedicated IndexedDB repository; no current migration or localStorage queue.
74. **Migration recommendation:** characterize cursor → define canonical revision → shadow job descriptions → add transaction/pending repository → implement ConversationSummary projection → observe/recover → legacy mirror later → Offline adaptation.
75. **Cursor clear enough for production refactor?:** clear enough to stop treating the field as summary completion, not clear enough to rename/migrate production storage yet.
76. **Contract sufficient to begin durable implementation?:** sufficient for a future design spike, not sufficient to start durable implementation before repository transaction, startup reconciliation and multi-tab tests exist.
77. **Should Background Consolidation begin with ConversationSummary?:** yes as the first conceptual candidate, after durable recovery foundations are separately approved.
78. **Recommended Stage 4C-11:** a storage/recovery design and characterization stage: canonical revision source, startup reconciliation, repository transaction/lease contract, and failure fixtures; no worker or production wiring automatically.

## Explicit decisions

### `lastImmediateSummaryMsgId` 是否应该继续被理解为“Summary 已完成到这里”？

**NO。**

它当前是 path-dependent 的 source/archive processing marker。Cheap Filter skip、zero-claim extraction 和不同 summary failure path 已经证明它不能可靠表示所有 Summary、legacy mirror 或其他 projections 都完成。

### 是否已经有足够合同和恢复设计证据，可以在下一阶段开始实现第一个 durable Background Projection？

**NO。**

本阶段已建立最小纯合同、状态机、确定性 identity、scope/privacy 约束和 lease/version 方向，但尚未解决 canonical→job gap、transactional storage、startup reconciliation、实际 multi-tab CAS 和 revision authority。下一阶段应先补这些恢复设计与 characterization；本阶段完成后停止，不自动进入 Stage 4C-11。
