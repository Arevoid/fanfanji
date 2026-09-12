# Early Usable Baseline — Production and Backup Audit

Date: 2026-09-12

This audit is limited to the isolated refactor worktree. It does not open a
real user profile or backup. Admission V2 remains paused and shadow/dev-gated;
the Early Baseline, when reached, will continue to use the existing
legacy-compatible production memory path.

## Production behavior

- Normal Direct Chat memory extraction is `useChatMemoryExtraction` →
  `MemoryService.extractMemories` → source/provenance checks →
  `evaluateKnowledgeWrite` → `commitMemoryWriteBundle` → canonical
  `KnowledgeClaim`/Summary repositories. Admission V2 does not own this write.
- Canonical Truth/Knowledge retrieval remains the exact-scope repository path;
  Summary is a derived projection/read model and is rebuilt or read through
  `conversationSummaryRepository`/the projection seam.
- Safety-veto Shadow/Canary and the long-evidence Collector are disabled unless
  explicitly enabled in a development/test runtime. No production Memory write
  is vetoed by the canary.
- Campaign evidence is synthetic and isolated; it is not collected from normal
  user conversations.

## Production dev-tool absence

The production Vite build was generated into a temporary directory. It emitted
no standalone chunks for the fixture/evidence installers or their dynamic
control module. Installer modules retain explicit DEV guards, and the bundle
compiles `import.meta.env.DEV` to false. The check is codified in
`scripts/productionDevToolAbsence.test.ts`.

The source names may still occur in shared feature chunks because the existing
Memory extraction seam is shared with dev diagnostics; this is not an installed
production global. The contract tested here is runtime absence of the globals,
not source-string erasure.

## Backup coverage matrix

| Domain | Exported? | Imported? | Semantics | Schema/version | Migration | Rollback | Post-restore verification | Risk/limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Characters | Yes (`character-archive-v4`) | Yes | replace | IDB v4 / system backup v3 | legacy flat character keys map to canonical archive | snapshot + compensating restore | repository reload + ID/owner inventory | local legacy copy may coexist when IDB is unavailable |
| Relations | Yes (`phone_character_relationships`) | Yes | replace | local key | no semantic rewrite in importer | local snapshot | owner/character/conversation IDs | relationship graph is localStorage-scoped |
| Direct Chat messages | Yes (`messages-v4` and entry store when enabled) | Yes | replace | `messages-v4`, `message-entry-v1` | legacy `phone_messages(_v3)` maps to entry store | IDB snapshot + local snapshot | reload and message ID inventory | no single atomic transaction across stores |
| Legacy MemoryItem | Yes (`phone_memory_vault_items`) | Yes | replace | legacy local key | preserved as legacy-compatible data | local snapshot | key/record inventory | not promoted to V2 authority |
| Canonical Truth/Knowledge | Yes (`phone_character_knowledge_claims`) | Yes | replace | canonical local key | existing app migration runs separately | local snapshot | scope/claim ID inventory | importer does not semantically merge claims |
| Conversation Summary | Yes (`phone_conversation_summaries`) | Yes | replace/derived | projection schema | rebuilt by existing projection path where required | local snapshot | summary scope/readback | summary remains derived, not authority |
| Moments | Yes (`moments-v4`, optional legacy key) | Yes | replace | IDB v4 | existing repository normalization | IDB snapshot | character/author inventory | local legacy mirror may be retained |
| Diary | Yes (`phone_diary_*`) | Yes | replace + sanitizer | local keys | relationship ownership sanitizer only | local snapshot | count/owner/relation checks | invalid/unowned records are dropped safely |
| Offline | Yes (durable `offline-story-entry-v1`, otherwise local key) | Yes | replace | content-entry v1 | legacy local fallback | durable + local snapshot | reload and story ID inventory | durable and legacy copies are deliberately not duplicated |
| Character Phone | Yes (`character-phone-v1`) | Yes | replace | IDB v1 | repository normalizes records | IDB snapshot | owner/character inventory | large media blobs use the phone/reading stores, not external upload |
| Settings/preferences | Yes (`phone_settings`, appearance, homescreen, apps, presets, etc.) | Yes | replace per allowlisted key | system backup v3 | legacy keys accepted where explicitly mapped | local snapshot | reload and selected settings | only explicit allowlist keys are restored |
| Reading/browser/media metadata | Metadata stores and requested local keys | Yes | replace per module | reading/co-reading/story store versions | module-specific importers | IDB snapshot | module inventory | binary Reading archive export remains a separate flow |
| Forum/Moments/Phone background state | Explicit allowlisted local keys | Yes | replace + sanitizer where defined | module-specific local schemas | module-specific readers | local snapshot | no-crash/readback smoke | private actor fields are removed from backup exports |

The system envelope is version 3 and accepts version 2 plus the legacy flat
format. Unknown IndexedDB modules are skipped and reported; unknown local keys
are rejected by the UI allowlist. Integrity checks are warning-based for older
exports, requiring explicit confirmation before restore.

## Synthetic round-trip and migration

`scripts/earlyBaselineBackupRoundTrip.test.ts` builds a populated synthetic
fixture with two identities/characters, two relations, messages, legacy
MemoryItem, canonical Knowledge, Summary, Moments, Diary, Offline, Phone and
settings. It exports, parses, restores to the fake IndexedDB target, reloads
repositories, compares IDs/owners/scopes, restores the pre-import snapshot, and
executes the flat legacy mapping path. No real data is involved.

The importer takes a localStorage snapshot and a complete IndexedDB snapshot
before writing. On failure it performs compensating restoration and surfaces
rollback errors. This is recoverable but not an atomic cross-store transaction;
that limitation remains an Early Baseline risk to re-check with a real backup.

## Early Baseline smoke scope

Automated synthetic coverage now proves the backup/restore seam, legacy mapping,
production dev-tool absence, campaign snapshot consistency, and existing
Memory/Direct Chat contracts. Real-device and real-backup acceptance are
intentionally deferred until the explicit Early Baseline gate is met. The
remaining Admission campaign thresholds are not a blocker for starting normal
use, but they are still required for FIRST USABLE BASELINE and production
promotion.
