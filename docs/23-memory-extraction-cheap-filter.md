# Stage 4C-7 — Memory Extraction Cheap Filter

Stage 4C-7 adds a small deterministic local filter for **Normal Direct Chat
automatic memory extraction only**. The filter owns one decision: whether a
threshold-qualified batch is clearly low-value enough to skip one
`memory_extract` call. It has no Truth, Admission, or Memory write authority.

## Existing trigger baseline

`chatSideEffectController.afterReplySuccess` first handles the existing
threshold. `summaryTriggerRound` is clamped to 10–100 rounds and defaults to 50;
the extraction threshold is `rounds * 2` messages. The eligible batch is the
current direct-chat messages after `lastImmediateSummaryMsgId`. A scheduled
automatic extraction is guarded by an in-flight scope set and a five-minute
failure cooldown. `useChatMemoryExtraction` keeps the existing batch selection,
batch size, write coordinator, and marker updates.

When a batch succeeds—even with zero accepted claims—the existing archive cursor
advances to its last message. A failed extraction returns `-1`, leaves the
cursor unchanged, and enters cooldown. Messages are never deleted by this
flow.

## Filter contract

`src/domain/memory/memoryExtractionCheapFilter.ts` is a pure function with no
storage, Provider, Prompt, React, or feature imports. It returns either:

```ts
{ decision: "skip", reason: ... }
{ decision: "extract", reason: ... }
```

Safe skip reasons are limited to:

- `empty_batch`
- `reaction_only`
- `acknowledgement_only`
- `greeting_only`
- `repetition_only`

The filter is batch-level. Any possible memory guard, ordinary small talk,
question, unknown language, media/voice-only record, assistant-only batch, mixed
batch, or unsupported shape fails open to extraction. Important guards cover
relationship changes, birth/death/illness, travel/moving, work/school changes,
plans/appointments, family/pet changes, preferences/identity, hypotheses, mood,
and conflict. The guards are intentionally small and do not claim to perform
NLP or importance ranking.

## Production wiring decision

The existing cursor is already advanced for an honest successful extraction with
zero claims. For a direct relationship with an existing archive marker, a safe
skip reuses that cursor update and does not enqueue an AI task. This avoids a
durable skip log or schema migration. Group Chat, Offline, relationship-less
paths, and manual extraction remain unchanged.

If the cursor update cannot be applied, the filter has no authority to delete or
archive chat data; the normal extraction path remains the fallback. No message,
diary, relationship, scene, or Memory record is removed by a skip.

## Cost and accounting

A safe skip produces zero logical `memory_extract` requests, zero Provider
attempts, zero repair, and zero fallback for that batch. An important or
uncertain batch remains one logical request on the existing path. A skipped
batch also avoids the extraction system prompt, the Stage 4C-5 V2 shadow
overhead (about 328 tokens), batch input tokens, and output/repair risk. Exact
currency savings are not estimated; the savings are proportional to the normal
extraction prompt and batch size.

Diagnostics are ephemeral test/runtime decisions only: reason and counts. No raw
message body, Prompt, API key, AI response, or network telemetry is stored.

## Explicit non-goals

- no Extraction Schema V2 changes;
- no Admission or semantic dedup changes;
- no additional Provider request;
- no Candidate queue, migration, or durable skip log;
- no Offline, Group, Diary, Moments, Reading, Relationship, or Scene adoption.

