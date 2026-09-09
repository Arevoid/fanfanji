# Stage 4D-7 — Real Metadata Characterization

Status: observation-only characterization. No Prompt, Provider, admission
authority, canonical Knowledge write, cursor, summary, projection, MemoryItem,
Event, RelationshipState, or storage schema change was made.

- Starting refactor HEAD: `d74c748e30831a42044c865cbbc136c13d91639c`
- Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Runtime persistence mode: `observation_only`
- Evidence origin: `real_runtime`

## 1. Runtime boundary and batches

Two isolated temporary Direct Chat conversations were used. Eight new synthetic
test messages were added in total, four per conversation. The existing
temporary messages were retained. The samples covered objective/subjective and
plan-lifecycle semantics in one batch, and preference/scene/relationship
semantics in the other. No user production conversation was used.

`extractNow()` was invoked twice. The first invocation returned `completed`
directly. The second CDP wait expired before the automation call returned, but
the Provider fallback completion, Ledger records, and Shadow records arrived;
the run therefore has five observations for that batch and is counted as a
completed underlying extraction, with an automation-timeout note.

## 2. Provider and request equivalence

The two extraction runs created four `memory_extract` Ledger records:

- two default-model primary failures (`gemini-3.5-flash`);
- two active-model fallback successes (`【量子花园】gemini-3.5-flash`);
- two logical extraction operations, each with one primary failure followed by
  one fallback success;
- no additional Provider request attributable to the metadata contract.

This is the existing `MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK` debt. It was
not changed in this stage.

## 3. Metadata source classification

The runtime implementation distinguishes structured V2 candidates from legacy
fallback candidates using `metadataSource`. All seven observations were
`metadataSource=legacy`; model-native V2 metadata observations: `0`.

Because the privacy-safe Shadow schema does not export candidate bodies or
untrusted raw metadata, the counts below treat a legacy fallback as missing
model-native metadata. No legacy fallback guess is represented as a V2 model
emission. Runtime-owned and policy-derived fields were also absent from the
export when no structured V2 candidate existed.

## 4. Orthogonal metadata coverage

| Field | Present | Missing | Values observed |
| --- | ---: | ---: | --- |
| `epistemicStatus` | 0 | 7 | none |
| `planLifecycle` | 0 | 7 | none |
| `durability` | 0 | 7 | none; legacy preference normalization reached `unknown_preference_durability` |
| proposed `authorityRole` | 0 | 7 | none |
| resolved `authorityRole` | 0 | 7 | none; no runtime-derived role available for legacy candidates |

Policy-visible distributions from the sanitized export:

- total observations: 7;
- `v2State`: `accepted=6`, `needs_review=1`;
- `v2ReasonCode`: `accepted_fact=2`, `accepted_belief=2`,
  `accepted_plan=1`, `unknown_preference_durability=1`,
  `accepted_belief`/`accepted_fact` legacy projections account for the rest;
- `metadataSource`: `legacy=7`;
- no V2 authority role distribution was observable.

The small runtime sample observed legacy `fact`, `belief`, and `plan` outputs.
It did not observe a standalone legacy `preference` or `hypothesis` candidate;
Stage 4D-6 parser and compatibility tests remain the evidence for those paths.

## 5. Cross-field safety

- model proposal conflicts: `0` observed;
- `model_conflict_safely_rejected`: `0` observed, because no V2 proposal was
  emitted;
- unsafe resolutions: `0`;
- P0: `0`;
- P1: `0`;
- P2: `1` (legacy accepted versus conservative V2 review for unknown
  preference durability);
- P3: `4`;
- P4: `2`.

All observed records had exact scope, provenance, and traceability. The
sanitized export reported `scopeMismatch=0`, `provenanceMismatch=0`,
`temporalMismatch=0`, and `failedOpenCount=0`.

## 6. Legacy compatibility and authority invariants

The run remained on the legacy production authority path. `observation_only`
completed Provider, parser, source binding, and Shadow admission work without
calling canonical claim, cursor, summary, projection, MemoryItem, Event, or
RelationshipState writes. No production authority change occurred.

The real export was schema version `2` and producer version
`admission-v2-shadow.v2`. It contained only bounded classifications, counts,
fingerprints, scope/provenance booleans, and policy outcomes. It contained no
statement, chat/reply body, Prompt, system Prompt, raw response, evidence quote,
raw IDs, candidate ID, idempotency key, API key, Authorization, exception body,
or stack trace.

## 7. Prompt extension decision

The current Prompt does **not** reliably emit the required V2 metadata in this
targeted runtime sample:

- epistemic boundary: not observable as model-native metadata;
- plan lifecycle: not observable as model-native metadata;
- preference durability: not observable as model-native metadata;
- authority role: not observable as model-native or runtime-derived metadata
  for these legacy candidates.

This is the Stage 4D-7 Case C result:

`CURRENT_PROMPT_DOES_NOT_RELIABLY_EMIT_REQUIRED_V2_METADATA`

The next stage should design the smallest Prompt/schema extension that targets
these measured gaps. Do not infer authority from statement text, and do not
start Canary implementation until that extension and its contract are approved.

## 8. Readiness

Readiness: `NEED PROMPT/CONTRACT REVISION`.

There are no unresolved P0/P1 safety findings, and exact scope/provenance and
privacy boundaries held. However, the required orthogonal metadata was absent
from all seven real observations, so the evidence is insufficient for Canary
Design. No further blind evidence sampling was performed.
