# Stage 4C-2：MemoryCandidate / Admission Contract

## 状态与边界

本文件记录 Stage 4C-2 建立的领域契约。它是可测试的 capture/intake
contract，不是新的写入 runtime。当前 Direct Chat、Group、Offline、Diary、
Moments、Reading、Character Phone、Proactive、Forum 等 producer 均未切换到它。

本阶段没有修改 Prompt、Context、Provider、retry/fallback、阈值、Relationship、
Scene、storage schema、MemoryWriteCoordinator、MemoryService、队列、worker、
已有数据或任何 feature producer。

流程边界保持为：

```text
producer -> MemoryCandidate -> pure admission decision -> (future projection)
                                                    \-> existing write policy/coordinator
```

当前最后一步没有被本契约自动执行。`MemoryCandidate` 不是
`MemoryRecord`/`KnowledgeClaim`，candidate kind 也不是最终 storage kind。

## 代码位置

| 文件 | 职责 | 依赖/规模约束 |
| --- | --- | --- |
| `src/domain/memory/memoryCandidate.ts` | 字段、来源/时间/谱系类型、source-based idempotency key、证据检查 | 仅依赖既有 character-knowledge 类型与 memory source app；约 170 LOC |
| `src/domain/memory/memoryAdmission.ts` | producer permission matrix、纯 `evaluateMemoryCandidate`、decision 类型 | 仅依赖 `memoryCandidate`；约 180 LOC |
| `scripts/memoryCandidateAdmissionContract.test.ts` | 纯契约 characterization | 不触及 UI、provider 或 storage |

两份 domain 文件都不导入 feature、React、Prompt、provider、monitoring、repository
或具体 storage。它们没有创建全局 manager，也没有引入 callback/feature coupling。

## MemoryCandidate 字段

`MemoryCandidate` 的最小字段如下：

- `schemaVersion`：当前为 `1`。
- `candidateId`：producer 提供的 opaque candidate identity；本契约不生成 ID。
- `candidateKind`：见下表。
- `statement`：候选陈述本身；仅作为 intake 对象，不写入 AI Request Ledger。
- `subject`：复用既有 `user | character | relationship | other` vocabulary。
- `scope`：必须有 `characterId`、`relationId`、`userIdentityId`；`conversationId` 可选，
  但缺失不是跨会话 wildcard。
- `provenance`：producer、source type、authorship、可选 app、source message/event/
  record IDs、source conversation ID，以及在可知时的 canonical `actorId`/`targetId`。
- `evidence`：source IDs 和稳定 `evidenceKey`；不接受 prompt、response、API key、
  Authorization 或异常正文作为证据字段。
- `temporal`：复用 `past | present | future | timeless | unknown`，并携带
  `occurredAt`/`recordedAt`/`validFrom`/`validTo`。
- `confidence`：可选 0–1，表示候选置信度，不代表 authority。
- `importance`：可选 1–10，仅作 retrieval/consolidation signal。
- `lineage`：可选 `parentActionId`、`producerActionId`、现有 AI `sourceRequestId`。

### Candidate kinds

| kind | 本契约含义 | 默认 admission 结果 |
| --- | --- | --- |
| `fact` | 可能进入 truth 语义的事实候选 | accepted → `truth` |
| `event` | 有时间层的事件候选 | accepted → `event` |
| `plan` | 未来意图/计划候选；仍使用 `future` temporal status | accepted → `truth`，不改写为已发生 |
| `belief` | 可召回但非关系事实的信念候选 | accepted → `belief` |
| `episodic` | 情节性记忆候选 | accepted → `episodic` |
| `relationship_signal` | 可能相关但不能改变 RelationshipState 的信号 | `needs_review` |
| `scene_only` | 仅当前/故事场景的文字 | rejected；不能直接进入 canonical Truth |
| `subjective_reflection` | Diary/InnerVoice 等主观反思 | rejected；不能自动升级为 Truth |
| `unknown` | 未知或未分类候选 | rejected |

`fact/event/plan/belief/episodic` 的 accepted 只是 admission classification；
没有 repository write，也不替换既有 `evaluateKnowledgeWrite` 的 statement、evidence、
offline boundary、truth status 或 temporal normalization。

## Scope、provenance 与时间

### Scope hard gate

`characterId + relationId + userIdentityId` 是 relation-private candidate 的最小
闭合 scope。任一缺失都得到 `insufficient_scope`。`conversationId` 只增加 record
scope；没有它不能读取或写入所有 conversation。若 candidate scope 与 source
conversation ID 不一致，得到 `scope_mismatch`。

### Provenance minimum

必须有 producer、source type、authorship，并且至少有 message/event/record reference；
显式 manual source 可以用稳定 `evidenceKey` 表示确认入口。没有 traceable provenance
得到 `missing_provenance`。source conversation ID 是 provenance，不等同于必须存在的
record scope conversation ID。

### Temporal contract

时间 vocabulary 直接复用 `TemporalStatus`。时间字段只做形状和区间校验：
`recordedAt` 必须存在，`validFrom <= validTo`（若两者都存在），不发明新的 Scene/时间
系统。历史 event 仍然是 event，不会成为当前线上 Scene；episodic 也不推断共同在场。

### Confidence / importance

两者只表示候选信号。它们不能授予 Truth authority、不能改变 Relationship、也不触发
阈值、embedding、LLM semantic judge 或 consolidation。

## Idempotency 与 dedup

`buildMemoryCandidateIdempotencyKey` 是 deterministic source-based key，使用：

```text
scope + candidateKind + producer + sourceType + authorship + actor/target
+ source conversation
+ normalized source message/event/record references + evidenceKey
```

各 ID 去空白、去重、排序后编码；`candidateId` 和 statement 故意不参与。因而：

- 同一 source + 同一 candidate kind 得到同一 key；
- 同一 source + 不同 kind 得到不同 key；
- 不同 source 即使 statement 相同也不是同一 source key；
- 不使用 LLM semantic hash，也不声称完成 semantic dedup。

`evaluateMemoryCandidate` 可接收调用方拥有的 `knownIdempotencyKeys`，命中后返回
`duplicate`。本阶段没有持久化 duplicate index，也没有 supersede/retract 或 queue。

## AdmissionDecision

决定对象包含 `state`、`reason`、`candidateId`、`idempotencyKey`、可选 `target` 和
`authority`：

- `accepted`：只表示通过本阶段的形状、scope、provenance、temporal 和 producer
  permission；target 明确为 `truth`、`event`、`episodic` 或 `belief`。
- `rejected`：scope、provenance、时间、producer、unknown、scene-only 或 subjective
  不满足契约；拒绝不删除 source。
- `duplicate`：source-based key 已由调用方标记存在。
- `needs_review`：relationship signal 需要显式 review，不会变更 RelationshipState。
- `deferred`：类型保留给未来的 corroboration/batching/plan resolution；当前纯
  evaluator 不创建 durable queue，也没有把等待伪装成 accepted。

AI 产生的 candidate 永远是 `candidate_only` authority。只有明确的 user-authored
manual source 可返回 `manual_trusted`；这仍不执行写入。

## Producer permission matrix

| producer | 可提出的主要 kinds | confirmation / authority |
| --- | --- | --- |
| Direct Chat | fact/event/plan/belief/episodic/relationship signal/scene | no auto authority |
| Group Chat | 同上 | no auto authority |
| Offline | fact/event/plan/belief/episodic/signal/scene | later confirmation required |
| Manual | fact/event/plan/belief/episodic/signal | trusted only when explicit user manual source |
| Diary | plan/belief/episodic/subjective/scene | review/confirmation; no Truth upgrade |
| Moments | episodic/signal/scene | public feature record; confirmation required |
| Reading | fact/event/plan/belief/episodic/scene | explicit confirmation remains required |
| InnerVoice | belief/episodic/subjective | never relationship authority |
| CharacterPhone | episodic/signal/scene | review/confirmation |
| Proactive | episodic/signal/scene | review/confirmation |
| Cinema | fact/event/plan/belief/episodic/scene | user confirmation required |
| Forum | episodic/signal/scene | public/story review required |

This matrix is proposal permission, not producer rewiring. Existing producers and source
policies remain authoritative until a separately approved integration stage.

## Existing policies and projection boundary

- `evaluateKnowledgeWrite` remains the current canonical claim write policy. The new
  evaluator is an earlier intake classification, not a rename or replacement. A future
  adapter must map accepted `truth`/`event`/`episodic`/`belief` targets into existing
  `KnowledgeWriteCandidate`/`MemoryRecord` semantics and still pass evidence, temporal,
  low-information, offline and truth-status rules.
- `MemoryWriteCoordinator` remains unchanged: canonical claims first, then summaries and
  legacy projections; it is not called by this contract.
- No relationship transition, Scene mutation, summary, legacy memory, storage write,
  provider call, Prompt change or read-path switch occurs here.
- Rejected/needs-review candidates do not delete source material. Projection/retry policy
  remains a future design.

## Lineage and privacy

Lineage uses existing opaque IDs: `parentActionId` can connect the originating user action;
`producerActionId` identifies the extraction/producer action; `sourceRequestId` can point to
an existing AI request ledger request without importing monitoring into domain memory. The
contract deliberately does not extend the Ledger schema or force a chat→memory→diary chain.

Candidate objects and tests contain short identifiers and statements only. The AI Request
Ledger remains metadata-only; no candidate statement, prompt, full response, API key,
Authorization header or exception body is added to it.

## Verification and known limits

`scripts/memoryCandidateAdmissionContract.test.ts` covers deterministic keys, exact scope,
provenance, temporal bounds, producer permissions, scene/subjective/relationship boundaries,
manual authority, duplicate detection and privacy-shaped fields. Existing producer tests
remain unchanged. Dependency direction remains the approved 105 edges / 3 cycles baseline.

This stage does not claim semantic deduplication, corroboration queues, expiry workers,
candidate persistence, producer integration, browser smoke coverage, or full cross-feature
lineage. Those are explicit follow-up work, not hidden behavior.
