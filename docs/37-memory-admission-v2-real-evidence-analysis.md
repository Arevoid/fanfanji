# Stage 4D-3 — Real Runtime Admission Evidence Analysis

Status: collected as development-only, metadata-only evidence. No production
Admission cutover was performed.

## Run boundary

- Evidence origin: `real_runtime`
- Runtime: refactor development server, normal one-to-one Direct Chat
- Conversation: existing `Stage4D3 临时样本`
- New user messages in this run: 3
- Persistence mode: `observation_only`
- Shadow buffer before extraction: 0
- Shadow buffer after extraction: 5
- Provider request for ordinary `chat_reply`: succeeded with one provider request
- No synthetic transcript, mocked Provider response, or manually edited JSON was used.

## Extraction result

The dev-only extraction completed with an active direct scope and 8 messages in
the selected unarchived conversation window. Provider observation was true and
the candidate count was 5. The first extraction-model request used the endpoint's
default `gemini-3.5-flash` name and returned `provider_unavailable`/model-not-found;
the existing model fallback then succeeded with the active configured model.
This produced two logical `memory_extract` Ledger records, one failed primary
record and one successful fallback record. Each record had one provider attempt;
the Ledger retry and fallback counters remained zero because the model fallback
is represented as a separate logical request.

Successful extraction metadata:

- provider: `server-proxy`
- model: active configured chat model
- estimated input tokens: 119
- input characters: 475
- output characters: 863
- retry count: 0
- fallback count: 0

## Shadow metrics

| Metric | Count |
| --- | ---: |
| total observations | 5 |
| comparable | 5 |
| incomparable | 0 |
| both accepted | 3 |
| both rejected | 0 |
| legacy accepted / V2 rejected | 0 |
| legacy rejected / V2 accepted | 0 |
| kind mismatch | 0 |
| scope mismatch | 0 |
| provenance mismatch | 0 |
| temporal mismatch | 0 |
| duplicate mismatch | 0 |
| failed-open | 0 |
| P0 / P1 / P2 / P3 / P4 | 0 / 0 / 2 / 0 / 3 |

## Taxonomy observed

- `fact`: 4
- `plan`: 1
- `event`: `not_observed_in_real_sample`
- `belief`: `not_observed_in_real_sample`
- `episodic`: `not_observed_in_real_sample`
- `preference`: `not_observed_in_real_sample`
- `relationship_signal`: `not_observed_in_real_sample`
- `scene_only`: `not_observed_in_real_sample`
- `subjective_reflection`: `not_observed_in_real_sample`
- `unknown`: `not_observed_in_real_sample`

The user messages covered several themes, but only the candidate kinds above
were emitted by the real extraction response. Theme coverage is not treated as
candidate taxonomy evidence.

## Privacy audit

The exported metadata-only JSON reported `evidenceOrigin: real_runtime`. The
sanitized observation schema contained no statement, chat body, reply body,
Prompt, system prompt, raw Provider response, raw source/message IDs, scope IDs,
character/relation/identity/conversation IDs, API key, Authorization header,
Provider payload, exception text, stack trace, candidate ID, or idempotency key.
No P0 privacy finding was observed.

## Authority invariants

The following before/after metadata summaries were identical; values are kept
out of this document and compared only as local opaque digests/counts:

- KnowledgeClaim storage: unchanged (1 record)
- Direct-chat cursor/relationship storage: unchanged (10 records)
- Conversation Summary storage: unchanged (0 records)
- Memory ProjectionJob IndexedDB store: unchanged (0 records)
- MemoryItem storage: unchanged (0 records)

The run used `observation_only`; no canonical Memory authority was modified.

## Mapping blockers and readiness

The real sample is insufficient to resolve episodic canonical mapping,
preference durability, plan temporal/OpenLoop boundaries, or the final
candidate-to-claim adapter contract. Relationship signals, scene-only material,
and subjective reflection were not observed as emitted taxonomy candidates.

Evidence sufficiency: `NEED MORE REAL EVIDENCE`.

Readiness: not ready for canary design. No production authority or production
cutover was changed.
