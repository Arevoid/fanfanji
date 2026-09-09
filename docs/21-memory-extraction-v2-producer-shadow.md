# Stage 4C-5 — Memory Extraction V2 Producer Shadow

Status: implemented as shadow-only producer output for the automatic normal
Direct Chat extraction path. Stage 4C-6 is not started.

## Baseline before this stage

The producer was the legacy JSONL Prompt in
`knowledgeExtractionProtocol.ts`. It required `statement`, optional
`memoryText`, `kind=fact|preference|plan|belief|hypothesis`, `subject`,
`temporalStatus`, `sourceMessageIds`, and `evidenceQuote`. The same parser was
used by the server route and browser fallback. `parseOrRepair...` issued one
repair request only when no valid structured legacy candidate was found.

The normal successful path was one `memory_extract` logical request with one
provider attempt. A malformed legacy response could use the existing repair
attempt; backend network fallback remained backend plus browser-direct. Model
fallback retained its existing second request behavior. No V2 producer request
existed at baseline.

## Producer shape

When `enableV2Shadow` is set by the automatic Direct Chat extraction hook, the
Prompt adds a small optional nested object to the same JSON candidate:

```json
{
  "statement": "…",
  "kind": "fact",
  "subject": "user",
  "temporalStatus": "present",
  "sourceMessageIds": ["message-id"],
  "evidenceQuote": "…",
  "v2": {
    "schemaVersion": 2,
    "kind": "fact",
    "semanticFacet": "preference",
    "durability": "stable"
  }
}
```

The V2 object reuses the outer statement, temporal status, source references,
and evidence quote. It does not duplicate long text. A V2-only event,
episodic, relationship signal, scene-only, subjective reflection, or unknown
candidate may omit legacy `kind`/`subject`; the old parser then ignores that
projection while the V2 shadow parser can still observe it.

The V2 parser is implemented in the existing
`memoryExtractionSchema.ts` contract. No V3 schema, feature-specific enum, or
second candidate model was introduced.

## Compatibility and fail-open rules

* Legacy-only output parses exactly as before.
* A valid legacy candidate with valid V2 metadata produces both projections.
* Missing or malformed optional V2 metadata drops only the V2 projection.
* An invalid V2 marker does not trigger repair when the legacy candidate is
  valid.
* A valid V2-only candidate does not trigger repair merely because there is no
  legacy claim.
* Ordinary malformed non-JSON output retains the existing repair behavior.
* V2 parser/normalizer/adapter failures cannot block
  `evaluateKnowledgeWrite` or `MemoryWriteCoordinator`.

`v2MetadataPresent` is a transient response marker used to prevent a malformed
optional V2 object from being mistaken for a transport failure and retried.
It is not persisted.

## Semantic classification

The Prompt gives short boundaries only:

* stable preference → `fact + preference + stable`;
* temporary/unknown preference → review-oriented durability;
* hypothesis → `belief + hypothesis`;
* event → what happened;
* episodic → a long-term memorable experience;
* relationship signal → controlled signal description only;
* scene-only → short-lived place, pose, clothing, environment, or action;
* subjective reflection → unverified feeling or judgment;
* unknown → safe unsupported classification.

The AI cannot emit canonical scope, actor/target IDs, authority, Truth,
RelationshipState, or SceneState. Runtime scope and the existing Admission
shadow remain authoritative. The legacy extraction protocol still requires its
validated source message IDs; V2 adds no duplicate references and canonical
conversation/actor/target IDs remain runtime-owned.

## Accounting and storage

The automatic Direct Chat path passes the producer flag through the existing
single `memory_extract` request. The browser fallback uses the same additive
Prompt and parser. There is no second V2 request and no new repair request for
V2 metadata. Focused characterization measured the normal refined Prompt
overhead at 1,311 characters, approximately 328 tokens using a conservative
four-characters-per-token estimate.

Legacy `acceptedClaims`, `rejectedCandidateCount`, canonical write input,
summary input, and compatibility output remain unchanged for the same legacy
response. V2 metadata is carried transiently in `structuredCandidatesV2` and
then can be inspected by the existing Direct Chat Admission shadow adapter;
there is no runtime report, localStorage key, IndexedDB schema, candidate
persistence, queue, telemetry backend, or user setting.

## Scope boundary

Only automatic normal Direct Chat requests enable the producer flag. Offline,
group, diary, Moments, Reading, InnerVoice, Character Phone, proactive, forum,
cinema, and manual/immediate-summary paths remain on the legacy Prompt. The
existing verification debts remain:

* `DIRECT_CHAT_BROWSER_SMOKE`
* `REAL_MEMORY_SHADOW_REPORTS_BLOCKED`
* `BUILD_RUNTIME_ASSERTION_WINDOWS_NODE`

Direct Chat production Admission is **not** switched on by this stage.
