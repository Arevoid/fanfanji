# Stage 4C-8 — Memory Extraction Local Source Refs & Token Governance

## Baseline before the change

The previous Provider-visible history used:

```text
[messageId="<canonical-message-id>"][user|character] ...
```

Application message IDs are commonly UUID-shaped (`message-` plus 36
characters), approximately 44 characters per ID. The normal automatic
threshold is approximately 100 messages (50 rounds), although 20 and 50
message batches are also common for smaller configured limits.

Approximate source-ID payload cost, excluding message text:

| messages | canonical IDs | approximate tokens | source IDs in response |
| ---: | ---: | ---: | ---: |
| 20 | 880 chars | 220 | 880 chars |
| 50 | 2,200 chars | 550 | 2,200 chars |
| 100 | 4,400 chars | 1,100 | 4,400 chars |

The old source instruction/output examples contributed about 792 static
characters in a minimal refined prompt. Stage 4C-5 V2 shadow instructions add
1,311 characters, approximately 328 tokens; that semantic overhead is measured
separately from source-reference transport.

## Runtime contract

`src/domain/memory/memoryExtractionLocalSourceRefs.ts` is a 90-line pure
runtime contract. It depends only on the message type and the existing
`MemoryExtractionSourceEnvelope`.

For one request, the runtime creates a deterministic table in message order:

```text
M1 -> canonical-message-id-A
M2 -> canonical-message-id-B
```

The map is held only in memory for that extraction call. It has no global
meaning, no random IDs, no storage key, no migration, and no persistence.
The table also retains runtime role, actor and timestamp metadata; the model
cannot overwrite it.

Only `scenario: "chat"` uses local refs. Offline, manual-summary and
immediate-summary callers retain the canonical transport path in this stage.

## Prompt and parser boundary

Normal Direct Chat history is now shown as:

```text
[M1][user] ...
[M2][character] ...
```

The prompt gives one short rule: source refs must use the provided `M#`
values. Canonical IDs are not included in the Provider-visible prompt.

Legacy and V2 parser output is resolved at the extraction boundary. Downstream
`evaluateKnowledgeWrite`, `MemoryWriteCoordinator`, repositories, candidate
idempotency and summary projection continue to receive canonical message IDs.
`M#` never enters durable claims, candidates, provenance or idempotency keys.

Unknown or malformed refs are rejected without guessing, storage lookup or
fuzzy matching. Duplicate refs resolve to one canonical ID. Response order is
preserved through parsing, while existing deterministic source normalization
continues to govern idempotency. A local-ref parse failure does not trigger an
extra repair request merely because the ref is unknown; the candidate is
rejected at runtime resolution.

Repair and model fallback reuse the same history and therefore the same local
ref universe. They do not re-number refs.

## Measured prompt transport savings

Using identical message text and UUID-shaped canonical IDs:

| messages | before chars | after chars | delta | approx token delta |
| ---: | ---: | ---: | ---: | ---: |
| 20 | 2,301 | 1,289 | -1,012 | about -253 |
| 50 | 4,566 | 1,964 | -2,602 | about -651 |
| 100 | 8,341 | 3,090 | -5,251 | about -1,313 |

The local-ref source instruction is about 57 characters longer than the old
canonical-ID instruction, but the history and response source-reference
savings dominate. Local response refs cost approximately 51, 141 and 292
characters for 20, 50 and 100 messages, respectively, instead of 880, 2,200
and 4,400 characters. V2 semantic instruction overhead remains 1,311
characters (about 328 tokens); it was not conflated with source transport and
was not otherwise rewritten.

## Safety and non-goals

- Provider logical request count and repair/fallback behavior are unchanged.
- Cheap Filter runs before local-ref table creation and is unchanged.
- No Admission change, Memory read switch, Candidate persistence, dedup,
  migration, durable queue, schema change, storage write or localStorage key.
- No Offline, Group, Relationship, Scene, Diary, Moments or Reading adoption.
- No prompt body or response body is persisted by the local-ref table.

The production decision is intentionally narrow: the direct `chat` extraction
boundary has compatibility tests for legacy claims, V2 candidates, fallback,
repair, invalid refs, actor metadata, timestamps and scope. Browser smoke is
still a separate verification debt.
