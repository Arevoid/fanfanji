# Stage 4C-17 — Memory V2 Direct Chat Cutover Closeout

**Baseline:** `0f2855f10f5285de0afacc97d81c5afc266e7db3`  
**Scope:** Stage 4C-1 through Stage 4C-16 only  
**Decision:** close the normal Direct Chat Summary cutover with explicit deferred
debts; do not begin Admission V2.

## 1. Closeout decision

The Stage 4C-16 production contract is now the following narrow path:

```text
automatic one-to-one Direct Chat memory extraction
  -> canonical KnowledgeClaim append
  -> one final exact-scope canonical snapshot
  -> durable ConversationSummary projection enqueue
       inserted / exists: no synchronous Summary write
       unavailable: synchronous canonical-snapshot Summary fallback
       invalid canonical snapshot: hold the archive cursor
```

`KnowledgeClaim` is the authority. `ConversationSummary` is a derived,
rebuildable projection and may be absent or stale without hiding canonical
Truth. `MemoryWriteCoordinator` remains a shared synchronous coordinator for
Manual Archive, Group and Offline-compatible callers; it was not globally
changed to claims-only semantics.

The automatic Direct Chat cursor is still persisted through the existing
`lastImmediateSummaryMsgId` compatibility field. Its Stage 4C-16 meaning is
“canonical intake safely processed through this source message”, not “the
ConversationSummary projection has completed”. The field name is retained as
an explicit compatibility debt; no storage migration is part of this closeout.

This stage makes no Admission cutover, legacy Memory retirement, Prompt or
Provider change, queue/worker expansion, database migration, or UI change.

## 2. Production/shadow/compatibility audit

The audit used the Stage 4C commit history, import/reference search across
`src`, the Stage 4C test set, and the stage documents. The result is a
conservative classification: no production file is deleted because every
candidate either remains on a failure/compatibility path, is an explicit
opt-in diagnostic, or is required by the future Admission V2 design.

| Area | Current evidence | Classification | Stage 4C-17 action |
| --- | --- | --- | --- |
| `conversationSummaryProjectionEquivalence.ts` | Imported by permanent equivalence/convergence tests; no longer imported by the automatic extraction hook after 4C-16 | KEEP | Keep as a pure invariant test utility; no runtime shadow call remains in the cutover hook |
| Old synchronous automatic Direct Chat Summary path | `useChatMemoryExtraction` still builds a Summary only for enqueue-unavailable fallback; the same coordinator is used by Manual/Group paths | KEEP | Do not delete; required for durable fallback and compatibility callers |
| `MemoryWriteCoordinator` | Canonical-first ordering and shared Summary/legacy compatibility write coordination | KEEP | Do not narrow globally; non-Direct-Chat callers still depend on it |
| `useChatMemoryExtraction` | Active automatic Direct Chat intake, manual archive, group archive and cursor advancement | KEEP | Keep as the current feature-owned orchestration seam |
| `directChatSummaryCutoverPolicy` | Pure decision table for automatic/manual, enqueue, fallback, no-active-claim and cursor outcomes | KEEP | Keep as the explicit cutover contract |
| `canonicalMemoryCommitSnapshot` | Exact scope, active claim IDs, source message IDs and canonical revision used by enqueue/fallback/executor | KEEP | Keep as the shared input contract |
| `canonicalStateResolved` enqueue compatibility input | Negative/invalid canonical-read behavior is covered by enqueue tests; callers can still distinguish unavailable canonical state from an empty claim set | DEFER | Do not remove or replace with a larger abstraction in this closeout |
| V2 extraction flag (`enableMemoryExtractionV2Shadow`) | Automatic Direct Chat leaves the flag off; manual archive compatibility tests explicitly exercise the producer shadow | DEFER / ACTIVE-DEBT | Preserve until a separately approved producer/admission decision |
| `directChatMemoryShadowTelemetry`, comparison and view | Explicit debug-only, bounded in-memory diagnostics; normal production configuration is disabled and the result never changes Truth selection | DEFER / ACTIVE-DEBT | Preserve for the blocked real-report/read-switch gate; no storage/network/provider side effect was found |
| `directChatMemoryCandidateAdapter` and `directChatMemoryAdmissionShadow` | Pure candidate/admission comparison used by tests and future Admission V2; production Direct Chat hook is not wired to them | DEFER / ACTIVE-DEBT | Preserve; deleting would remove the next-stage evidence seam |
| Candidate metadata, schema V2 and source envelope | Runtime-owned scope, temporal, producer and provenance contracts | KEEP / DEFER | Preserve compatibility and characterization coverage |
| Provenance and local source refs | `memoryExtractionLocalSourceRefs`, source envelope and candidate provenance; `M1/M2` labels stay prompt-local and never enter durable records | KEEP | No cleanup; this is the traceability boundary |
| Cheap filter | Active automatic Direct Chat preflight; skip advances the existing archive cursor without an AI extraction request | KEEP | Preserve; changing it would alter extraction behavior |
| Projection job/domain/repository | Durable metadata-only intent with deterministic identity and `insertIfAbsent` | KEEP | Required for at-least-once recovery |
| Projection executor/runner | Bounded five-job drain, lease/CAS fencing, current canonical revision checks and idempotent Summary writes | KEEP | Required runtime, not a temporary shadow |
| Drain scheduler | Coalesced zero-delay, fire-and-forget scheduling; no polling or per-job timer | KEEP | Required real-time enqueue behavior |
| Startup reconciliation | Bounded repair of localStorage/IndexedDB crash windows | KEEP | Required recovery path after non-atomic stores |
| Source-processing cursor contract | Canonical intake boundary with the legacy relationship field as compatibility storage | DEFER / ACTIVE-DEBT | Documented debt; no rename or migration here |
| Legacy `MemoryItem` readers/writers | Group, Offline, Moments, management and compatibility surfaces remain active | KEEP / DEFER | No retirement or data rewrite |

### 2.1 Safe-cleanup conclusion

There is no proven-obsolete production implementation in the Stage 4C seam.
The old synchronous path is not dead code: it is the approved durable enqueue
fallback and remains the Manual/Group/Offline compatibility path. The former
Summary equivalence comparator is no longer on the normal runtime path, but it
is still the permanent test invariant that protects the shared projection
semantics. Shadow and Admission files are intentionally retained as
default-off evidence and future-stage contracts. Therefore this closeout is
documentation-only; no code was deleted, moved, or weakened.

## 3. Formal source-of-truth map

| Concept | Authoritative owner | Derived/compatibility consumers | Current status |
| --- | --- | --- | --- |
| `KnowledgeClaim` | `characterKnowledgeRepository` / canonical claim records, exact character + relation + identity + conversation scope | Truth retrieval, canonical snapshot and projection executor | Canonical authority |
| `ConversationSummary` | `conversationSummaryRepository` records produced by sync fallback or durable projection | Prompt retrieval as a non-authoritative cache, management and compatibility readers | Derived/rebuildable projection |
| Cursor | Automatic Direct Chat canonical intake progress; persisted today through `lastImmediateSummaryMsgId` on the relationship compatibility shape | `useChatMemoryExtraction` and `chatSideEffectController` | Canonical-intake progress; field naming debt remains |
| `ProjectionJob` | `memoryProjectionJobRepository` / IndexedDB metadata record | enqueue, bounded runner, scheduler and startup reconciliation | Durable projection intent, no transcript/body |
| Legacy `MemoryItem` | Existing legacy memory repository and feature-owned stores | Offline, Group, Moments, management and compatibility flows | Compatibility surface; not V2 Truth authority |

The Stage 4C implementation deliberately does not make a `MemoryItem` write
the authority, does not turn a Summary into a claim, and does not treat a
ProjectionJob as user-visible memory.

## 4. Direct Chat call chain and boundary

### 4.1 Normal send

The current real call chain is:

```text
sendCustomMessage / composer controller
  -> persist the user Message through the existing AppChat callback
  -> chatReplyController.generate
  -> executeDirectReplyPipeline
  -> prepareDirectReplyContext (shared history snapshot)
  -> prepareDirectReplyTurn (shared system-instruction builder)
  -> executeDirectReplyUseCase
  -> requestDirectChatTurn / AI runtime and request ledger
  -> parse response and sequentially deliver character bubbles
  -> postReply callback
  -> postReplyCoordinator (normal_send)
       -> chatSideEffectController.afterReplySuccess
       -> optional Diary scheduler
```

The user message is persisted before the reply request. Delivery owns the
generated candidate/message IDs and does not insert the same candidate twice.
The normal automatic memory extraction is scheduled by the side-effect
controller after a successful reply, with its existing threshold, cheap filter,
200 ms delay, in-flight guard and cooldown behavior.

### 4.2 Regenerate

Regenerate reconstructs the target/history boundary in the existing AppChat
caller, calls `generateRegeneratedChatTurn`, and uses the same request/runtime
accounting contract. It does not schedule normal post-reply work: the
`regenerate_none` policy deliberately produces no Memory extraction or Diary
side effect. The target replacement and candidate delivery remain owned by the
existing regeneration flow.

### 4.3 Send-only and non-Direct paths

Send-only persists the user message and stops before `chatReplyController`;
there is no provider request. Group Chat continues through its group pipeline.
Offline delivery updates the story-local message store and does not enter the
automatic Direct Chat Summary cutover. Proactive, Moments, Forum, Reading,
Voice, image generation, Character Phone and unrelated background jobs remain
feature-owned.

## 5. `afterReplySuccess` side-effect audit

| Side effect | Current timing | Can fail/block the delivered reply? | Future owner suggestion |
| --- | --- | --- | --- |
| Offline story message append | Synchronous callback branch for an offline turn | It is a post-delivery persistence attempt; no provider retry or reply rollback | Keep in Offline runtime |
| Automatic Memory extraction | Delayed (`200 ms`) scheduled task after normal Direct Chat; threshold and cheap filter apply | No; failures set a cooldown and log, while the delivered reply remains | Background consolidation/job runtime in a later stage |
| Relationship archive cursor update | After successful canonical intake/fallback outcome | No reply rollback; cursor is held on unsafe canonical/fallback failure | Memory intake coordinator, after cursor semantics are renamed/ migrated |
| Durable Summary enqueue | Inside the extraction path after canonical commit | No; IndexedDB failure is converted to synchronous Summary fallback or held cursor | Existing projection runtime |
| Diary generation | Scheduled by `postReplyCoordinator`; returned Promise is fire-and-forget with failure swallowed into coordinator metadata | No; it does not block the delivered reply | Background job runtime with explicit lineage |
| Relationship/offline appointment and handoff markers | Post-delivery callback before coordinator scheduling, with warning on persistence failure | No provider retry; failures are reported as warnings | Feature-owned coordinators |
| Inline inner voice persistence | Post-delivery callback, deduplicated by trigger message | Does not alter the already delivered bubbles | InnerVoice service |
| Character Moments cover update | Best-effort post-reply update, using field patch when available | No | Character/Moments feature |
| Regenerate side effects | Suppressed by `regenerate_none` | No | Keep suppressed unless separately approved |

No Stage 4C file takes ownership of payment, proactive jobs, Group Chat, Voice,
image generation, Forum, Moments generation, Reading or Character Phone
background generation. Those are explicitly outside a future
`DirectReplyUseCase`.

## 6. Test audit and classification

The Stage 4C tests were reviewed as follows:

- **Permanent invariants:** canonical snapshot determinism, exact scope and
  revision, Summary projection equivalence, Truth-over-Summary read behavior,
  enqueue idempotency, no-active-claims no-op, cursor/fallback policy, runner
  lease/CAS behavior, startup reconciliation, source refs, provenance and
  cheap-filter safety.
- **Migration/characterization:** legacy Memory repository behavior,
  MemoryWriteCoordinator ordering, old summary readers, compatibility fields,
  V2 extraction schema and producer flags.
- **Shadow evidence:** Direct Chat memory comparison/telemetry and Candidate /
  Admission shadow tests. These remain default-off and are not production
  cutover tests.
- **Duplicate/obsolete candidates:** the old runtime equivalence call and the
  former automatic synchronous happy-path branch were checked. The equivalence
  call is absent from the cutover hook; the synchronous branch remains only
  where the fallback/manual contract requires it. No test is removed because
  of this classification.

Existing coverage does not claim real browser or real shadow-report evidence;
those remain separate debts below.

## 7. Documentation status

| Documents | Classification | Treatment |
| --- | --- | --- |
| `docs/26-memory-cursor-projection-contract.md`, `docs/27-memory-projection-storage-recovery.md`, `docs/28-memory-projection-durable-repository.md`, `docs/29-conversation-summary-background-projection.md`, `docs/32-direct-chat-summary-background-cutover.md` | ACTIVE SPEC / implementation contract | Retain as current contracts; this document closes the cutover boundary |
| `docs/17` through `docs/25` Stage 4C audit/contract files | HISTORICAL STAGE RECORD | Retain evidence and original scope; later decisions are recorded here rather than rewriting history |
| `docs/30-direct-chat-summary-cutover-shadow.md`, the pre-cutover parts of `docs/31-direct-chat-summary-canonical-convergence.md` | SUPERSEDED for the final automatic cutover decision | Retain as historical convergence/shadow evidence; `docs/32` and this closeout are authoritative for final behavior |
| `docs/14-worldbook-context-boundary-audit.md`, `docs/16-memory-shadow-read-switch-gate.md` and the debt section below | ACTIVE-DEBT records | Keep explicit blocked evidence; do not relabel synthetic evidence as real runtime evidence |
| this file (`docs/33-memory-v2-direct-chat-cutover-closeout.md`) | ACTIVE CLOSEOUT SPEC | Single summary of authority, boundaries, deferred debts and rollback |

## 8. Debt re-evaluation

### `REAL_MEMORY_SHADOW_REPORTS_BLOCKED`

**Status: ACTIVE-DEBT, non-blocking for this narrow Summary cutover but blocking
for a Memory read switch or Admission V2 readiness claim.** The collector is
explicitly opt-in and the existing Stage 4B evidence has zero real reports.
Synthetic reports remain useful characterization only.

### `BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`

**Status: RESOLVED for the current baseline; retain the historical record.**
The current clean build completes on this Windows/Node environment. The old
UV-handle assertion is not a current failure and did not justify a production
workaround. It should be re-opened only if a fresh reproducible failure occurs.

### `DIRECT_CHAT_BROWSER_SMOKE`

**Status: ACTIVE-DEBT / verification blocked.** The approved browser smoke was
attempted in the available Codex CUA environment and failed before a tab could
be created with:

```text
failed to write kernel assets: 系统找不到指定的路径。 (os error 3)
```

Therefore no real UI turn, scrolling result, bubble count, or browser-observed
Ledger record is claimed here. This is an environment verification debt, not a
reason to alter production code.

Other remaining debts are explicit: the legacy cursor field name/semantics,
non-atomic localStorage/IndexedDB commit window, incomplete
`parentActionId` lineage into Memory/Diary background work, and legacy
`MemoryItem` retirement. None is silently resolved by this closeout.

## 9. Final judgment and next-stage boundary

Stage 4C can be considered **closed for the approved normal Direct Chat
Summary cutover**: canonical Truth is authoritative, durable projection is
first, synchronous fallback is bounded, recovery paths are retained, and the
out-of-scope feature paths are unchanged. The closeout does **not** mean the
entire Memory V2 migration is complete.

Admission V2 is **not ready for approval**. It still requires real shadow
reports, a separately approved candidate/Admission runtime contract, and a
decision on legacy/read-switch evidence. The next proposal should be a design
and evidence stage, not an automatic production cutover.

No user data or storage schema is changed by this closeout commit. Rollback is
`git revert <closeout-commit>`; reverting it removes only this documentation
record and returns the worktree to the already-verified Stage 4C-16 baseline.

## 10. Verification record

The final verification for this closeout must retain the current baseline
counts and the explicit browser limitation:

- `npm run lint`: pass
- `npm test`: all discovered tests pass; no existing test is removed
- `npm run build`: pass; the generated service-worker cache file is restored
  to its tracked baseline after the build-only generated change
- dependency gate: 105 concrete allowlisted edges, 3 baseline cycles, no new
  edge/cycle
- AI accounting and the Stage 4C Memory/projection/cutover tests: pass
- browser smoke: not executable in the current CUA environment; debt remains
  `DIRECT_CHAT_BROWSER_SMOKE`

The next stage is not started by this document.
