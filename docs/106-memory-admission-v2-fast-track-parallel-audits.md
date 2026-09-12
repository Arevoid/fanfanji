# Memory Admission V2 — Fast-Track Parallel Audits

This is a read-only architecture inventory made after the multi-scope runtime
run. It records existing seams and safe next work; it does not change product
semantics or authorize a cutover.

## Track A — Memory V2 stability

Covered by the current suite (602 tests at the start of this checkpoint and the
same suite after the evidence-only changes): exact character/relation/
conversation scope, source provenance, admission invariants, candidate
normalization, source cursors, replay prevention, projection enqueue/runner,
IndexedDB recovery, summary projection equivalence, zero-candidate handling,
safety-veto canonical absence, control survival, and Memory/Scene/Relationship
separation. Representative tests include
`memoryCrossAppScope.test.ts`, `memorySourceProvenance`,
`memoryExtractionLineageTransport`, `memoryProjectionRunner`,
`memoryProjectionStorageRecovery`, `memoryAdmissionLongEvidenceCollector`,
`directChatMemorySafetyVetoCanaryAuthority`, and
`conversationSummaryProjectionEquivalence`.

The remaining runtime debt is a broader restart/replay campaign and valid
safety-veto suppression evidence. The new B window is preserved as an
`INVALID_SAMPLE`; no production fix is inferred from it.

## Track B — Retrieval V2 readiness

The current chain is:

```text
characterKnowledgeRepository / memoryRepository
  → truthRetrievalService / MemoryRetriever
  → contributeDirectReplyTruthContext
  → PromptComposer / direct-chat prompt builders
```

`truthRetrievalService` requires an exact `characterId + relationId +
userIdentityId (+ conversationId when present)` scope, filters inactive,
superseded, recalled-off, and temporally inactive claims, ranks within a caller
limit, and fills one total budget across claims, corrections, and derived
summaries. `MemoryRetriever` keeps legacy MemoryItem reads relation-scoped and
can exclude canonical mirrors. `formatTruthRetrievalForPrompt` treats Truth as
the prompt authority, labels summaries as rebuildable/non-authoritative, and
does not dump the whole repository. Existing tests cover exact scope, ranking,
budget, temporal status, summary deduplication, and cross-character leakage.

Open audit items: production-scale relevance calibration, an independent token
budget benchmark across all prompt scenarios, and a future explicit episodic
layer. No vector-database redesign is proposed here.

## Track C — AI duplicate-call audit

The direct-chat canonical path is `AppChat → chatReplyController →
executeDirectReplyUseCase → executeDirectReplyTurn → requestDirectChatTurn →
requestAiReply → apiChat → /api/chat`. Format, context, degenerate-response,
and alias retries are request-local branches inside that controller; the outer
pipeline does not issue a second independent direct-chat request. Automatic
Memory extraction uses `MemoryService.extractMemories →
apiExtractMemoriesWithModelFallback` and records one logical action with its
provider attempts.

All discovered feature callers use the shared `apiChat` boundary:

- chat Memory extraction, Offline story, Inner Voice, Character Phone;
- Reading story/co-reading/analysis;
- Forum and Forum Story generation;
- Cinema text generation.

Server-side `callTextProvider` in `cloudflare/worker.ts` is the backend adapter
behind those routes, not a new browser bypass. Image, TTS, music, stickers, and
remote assets use separate protocol-specific transports by design. No second
Direct Chat entry or duplicated retry loop was found in this scan. A future
registry should keep these non-chat transports explicitly classified instead of
merging them into the text request contract.

## Track D — Repository / storage audit

| Classification | Current paths | Finding |
| --- | --- | --- |
| A — canonical | `core/storage/repositories/characterKnowledgeRepository.ts`, `memoryRepository.ts`, `messageRepository.ts`, `conversationSummaryRepository.ts`, `memoryProjectionJobRepository.ts` | Authoritative writes/read normalization and exact-scope filtering. |
| B — compatibility | `storageKeys.legacy*`, legacy branches in `messageRepository`, `characterRepository`, `momentRepository`, `legacyCharacterKnowledgeMigrationRunner.ts` | Required migration/fallback reads; do not delete before a proof-backed migration. |
| C — duplicate/bypass candidates | `App.tsx` persistence callbacks and repositories with default `localStorage` (music/widget/history) | Safe inventory item; ownership differs by feature and needs a separate convergence plan. |
| D — obsolete | None proven in this audit | No deletion candidate is promoted without dead-proof. |
| E — migration-sensitive | `FanfanjiReadingMetadataDB/messages-v4`, message/offline entry stores, system backup/restore, character-phone dual stores | Keep compatibility and restart tests intact. |

Storage uses IndexedDB for message, offline, phone, reading, assets, and
projection jobs where flags permit, with localStorage snapshots/fallbacks. The
storage diagnostics and preflight paths intentionally inspect both copies.
This audit did not delete, migrate, or rewrite any store.

## Track E — Legacy Memory registry

| Path | Status | Boundary |
| --- | --- | --- |
| `domain/memory/MemoryExtractor.ts` + `MemoryService.extractMemories` | production-used legacy-compatible extraction | Parses provider output, applies write policy, emits Truth and optional legacy mirrors. |
| `core/storage/repositories/memoryRepository.ts` / `MemoryItem` | compatibility-required | Legacy MemoryItem vault and compression; still used by UI and fallback reads. |
| `core/storage/repositories/characterKnowledgeRepository.ts` | production-used canonical Truth | Exact-scope claims and mutation policy. |
| `conversationSummaryRepository.ts` + projection runner | production-used derived layer | Rebuildable summaries and durable projection jobs. |
| `directChatMemoryCandidateAdapter.ts`, `directChatMemoryAdmission*`, safety-veto shadow/canary | shadow-only / dev-gated | Metadata comparison and veto observation; no independent writer. |
| `legacyCharacterKnowledgeMigrationRunner.ts` | compatibility-required | One-way migration bridge with backup/rollback safeguards. |
| `directChatMemoryShadowView.ts` / shadow telemetry | shadow-only | Read comparison and diagnostics; never the prompt authority. |
| Other old extraction/retrieval paths | unknown until feature-specific audit | Keep registered; no dead-code claim made. |

## Track F — God Component inventory

| File | LOC | Main responsibility domains | Safe next extraction |
| --- | ---: | --- | --- |
| `src/components/AppChat.tsx` | 11,367 | Direct/group chat UI, send/regenerate, context, Memory hooks, Moments, offline, diary, relationship network, phone/voice, persistence | Continue only seam-based orchestration extraction; do not move JSX wholesale. |
| `src/App.tsx` | 5,653 | App shell, hydration, storage callbacks, routing, dev fixture/evidence hooks | Keep dev-only controls isolated; no broad shell rewrite. |
| `src/components/AppCharacterPhone.tsx` | 4,580 | Phone UI, media, phone state and persistence | Separate UI/state only after phone-specific behavior tests. |
| `src/components/AppSettings.tsx` | 3,045 | Settings UI and configuration forms | Keep settings/storage migration compatibility. |
| `src/components/AppReading.tsx` | 2,659 | Reading UI and analysis flows | Feature-local audit first. |
| `src/components/AppMemory.tsx` | 1,847 | Memory/Truth/summary management UI and backup actions | Preserve explicit user confirmation and Truth authority. |

The existing `DirectReplyUseCase`, `DirectReplyTurnExecutor`,
`PostReplyCoordinator`, and `ChatSideEffectController` are already the safe
extraction seams. They keep React/UI, storage, Prompt/Context, Memory, Diary,
and unrelated feature services behind injected callbacks.

## Track G — Documentation consolidation

Historical stage reports and evidence files remain immutable. The durable map
for eventual consolidation is: Architecture V2; AI Runtime;
Context/Prompt Runtime; Memory V2; Admission Governance;
Storage/Repository; Testing; Migration/Backup; and AI Development Rules. This
file and `docs/105-memory-admission-v2-multi-scope-runtime-evidence.md` are
checkpoint inventories, not replacements for historical evidence.

