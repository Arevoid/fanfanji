# Memory Extraction Runtime Source Provenance (Stage 4C-6)

Stage 4C-6 adds a runtime-owned source envelope and a deterministic, shadow-only
source binding step for Direct Chat V2 candidates. It does not switch production
Admission, legacy writes, Memory reads, persistence, or provider behavior.

## Existing lifecycle

`useChatMemoryExtraction` chooses the unarchived batch and passes its `Message`
records to `MemoryService.extractMemories`. `MemoryExtractor` projects each
record into API history using the canonical message ID and serialized text.
The extraction prompt currently displays the full `messageId`; the model returns
`sourceMessageIds` and `evidenceQuote`. The parser validates legacy and V2 IDs
against the current batch. Valid legacy candidates become `KnowledgeClaim`
objects and are written through the existing `MemoryWriteCoordinator` path.

The runtime source envelope is now created before the provider call. It contains
only canonical scope IDs, message IDs, actor/role metadata, timestamps, and
optional action lineage. It never contains message bodies, prompts, responses,
API keys, or storage records.

## Runtime-owned contract

`src/domain/memory/memoryExtractionSourceEnvelope.ts` defines the envelope and
the allowed source universe for one extraction request. Its `messageSources`
list is the only source set that a V2 shadow binding may use. The direct-chat
binding service:

- keeps only IDs present in the current envelope;
- drops invalid IDs without looking at storage or another batch;
- de-duplicates and sorts valid IDs deterministically;
- marks mixed valid/invalid hints as `partial` and withholds trusted refs;
- marks missing hints as `missing`;
- rejects scope mismatches;
- resolves actor/target roles only to runtime scope IDs;
- derives authorship only when all trusted source messages have one runtime role.

Source timestamps remain evidence metadata. They are not copied into candidate
temporal fields. Candidate temporal values still describe when the event is
said to have happened.

The adapter exposes binding diagnostics to the existing Admission shadow only.
The current legacy adapter path remains compatible when no envelope is supplied;
production Admission remains fail-open and unchanged.

## Parser and fallback behavior

Legacy parsing still rejects out-of-batch IDs. When the additive Direct Chat V2
shadow flag is enabled, V2 parsing may retain raw source hints so runtime binding
can count invalid, duplicate, missing, and partial references. Those hints are
never trusted directly. Parser repair and model fallback reuse the same history
IDs, so the canonical source universe remains stable while provider output may
change.

No local `M1`/`M2` references are introduced in this stage. The prompt remains
backward-compatible and continues to display canonical IDs; short refs require a
separate compatibility and token-budget decision.

## Explicit non-goals

- no production Admission cutover;
- no Memory read switch or candidate persistence;
- no storage/schema/localStorage writes;
- no fuzzy, embedding, or AI provenance resolver;
- no extra provider request;
- no Offline, Group, Relationship Growth, Scene Runtime, or post-reply lineage rewrite.

