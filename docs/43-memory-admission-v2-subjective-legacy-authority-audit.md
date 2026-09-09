# Stage 4D-9A — Subjective Legacy Authority Path Audit

Status: **audit complete; no production behavior changed**.

- Starting refactor HEAD: `b4b1cfeaeb6b69582cb99ba041c21408a5426c66`
- Original repository baseline: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Runtime writes: not executed; Stage 4D-8 used `observation_only`
- Plan/preference real batches: not resumed

## 1. Stage 4D-8 P1 reproduction

The sanitized real-runtime evidence retained the V2 candidate kind
`subjective_reflection`, `epistemicStatus=subjective`, and an exact scope and
provenance match. The raw Provider body and the outer legacy kind were not
exported by design. A pure recreation in
`scripts/memorySubjectiveLegacyAuthorityAudit.test.ts` uses the compatible
legacy projection `belief` and reproduces the same comparison:

| Path | Result |
| --- | --- |
| legacy diagnostic | `accepted` / `accepted` |
| V2 candidate kind | `subjective_reflection` |
| V2 authority role | `non_objective` |
| V2 decision | `rejected` / `subjective_not_objective_truth` |
| Shadow mismatch | `old_allow_new_reject` |

The legacy diagnostic is the stable classification granularity. A legacy
`hypothesis` is also normalized to shadow kind `belief` by
`candidateKindForLegacyKind`, so the sanitized record cannot distinguish those
two legacy spellings.

## 2. Complete legacy path

```text
Provider response
  -> api extraction parser
  -> legacy candidate normalization
  -> source/evidence binding in MemoryExtractor
  -> KnowledgeWriteCandidate
  -> evaluateKnowledgeWrite
  -> acceptedClaims
  -> useChatMemoryExtraction commitMemoryWriteBundle
  -> KnowledgeClaim repository
  -> Truth retrieval / prompt projection
```

### Provider response and parser

The response may contain the legacy fields and an embedded/additive `v2`
object. `normalizeExtractedKnowledgeCandidate` reads only the legacy
`statement`, `kind`, `subject`, `temporalStatus`, source refs, and evidence
quote. It does not read `epistemicStatus`, `authorityRole`, or other V2
metadata. `normalizeEmbeddedMemoryExtractionCandidateV2` parses the same object
separately. Therefore the loss occurs at the parallel **structured V2 → legacy
projection** boundary; V2 metadata never enters the legacy write candidate.

### Source binding and legacy diagnostics

`MemoryExtractor` binds source refs to the current exact source envelope,
checks evidence, constructs a `KnowledgeWriteCandidate`, and records a
classification-only diagnostic. `decision=accepted` here means that the
legacy KnowledgeWrite policy accepted the candidate. The diagnostic does not
mean that an objective Truth authority decision was made.

### KnowledgeWriteCandidate and policy

The candidate contains legacy `kind`, `subject`, temporal status, source,
evidence, confidence, and scope. It has no `epistemicStatus` field. The policy
checks scope, evidence, low-information text, question/roleplay cues, offline
boundaries, and temporal normalization. It does not distinguish subjective
from objective content because that information is absent. `belief` and
`hypothesis` remain valid kinds and are accepted when the ordinary checks pass.

### Canonical commit

Normal Direct Chat production mode passes `result.acceptedClaims` to
`commitMemoryWriteBundle`, which appends canonical `KnowledgeClaim` records.
The V2 shadow decision is not consulted by this legacy write path. The current
Direct Chat hook does not persist `MemoryExtractor.extractedMemories` as an
additional compatibility snapshot; the canonical claims and derived summary
are the relevant destination here.

## 3. Accepted terminology audit

These three states are not equivalent:

| Term | Current meaning |
| --- | --- |
| Intake accepted | V2 `evaluateMemoryCandidate` returns `state=accepted`, or the legacy pipeline produces a valid candidate; this is proposal/admission classification. |
| KnowledgeWrite accepted | `evaluateKnowledgeWrite` returns `{ accepted: true, claim }`; this permits construction of a canonical `KnowledgeClaim`. |
| Truth-authority accepted | There is no separate boolean gate in the current legacy path. Canonical persistence occurs after KnowledgeWrite acceptance, while downstream projection still uses `kind`, `truthStatus`, temporal status, and source. |

The word `accepted` in the Stage 4D-8 legacy diagnostic is therefore **not**
proof of objective durable Truth authority.

## 4. Legacy kind destinations

For a valid Direct Chat extraction, all five legacy kinds can reach canonical
`KnowledgeClaim` storage through `acceptedClaims`:

| Legacy kind | Canonical destination | Downstream semantic treatment |
| --- | --- | --- |
| `fact` | `KnowledgeClaim.kind="fact"`; `confirmedFacts` only when truth status is `confirmed`, otherwise `userAssertions`/cautious handling | Fact-like only when the retained kind/status rules allow it |
| `preference` | `KnowledgeClaim.kind="preference"` | Preferences block; no explicit durability field in the claim schema |
| `plan` | `KnowledgeClaim.kind="plan"`, normally normalized to `temporalStatus="future"` | Future plans block; not silently converted to past fact |
| `belief` | `KnowledgeClaim.kind="belief"` | `openBeliefsAndHypotheses`, explicitly cautioned as non-certain |
| `hypothesis` | `KnowledgeClaim.kind="hypothesis"` | `openBeliefsAndHypotheses`, with conditional text normalized conservatively |

For the reproduced subjective path, the legacy claim retains `kind="belief"`
and `truthStatus="asserted"` for user-authored evidence. It is not placed in
`confirmedFacts`; it is placed in `openBeliefsAndHypotheses`.

## 5. KnowledgeClaim semantics

`KnowledgeClaim` preserves:

- `kind` (`fact`, `preference`, `plan`, `belief`, `hypothesis`);
- `subject`;
- `temporalStatus`;
- `truthStatus` (`asserted`, `confirmed`, `inferred`, etc.);
- source/provenance, confidence, scope, and timestamps.

It does **not** preserve an explicit `epistemicStatus` or independent
authority-level field. `CharacterMemoryRepository.claimRecord` labels every
claim record as canonical/authoritative at the repository adapter level, even
when the claim kind is `belief` or `hypothesis`. That is vocabulary/authority
debt: repository canonicality is being named `authoritative`, while prompt
projection still treats beliefs and hypotheses as non-objective.

## 6. evaluateKnowledgeWrite findings

`evaluateKnowledgeWrite` does not inspect subjective/objective metadata because
`KnowledgeWriteCandidate` has none. It does distinguish temporal cues and
legacy kinds, and it derives `truthStatus` from source authorship and explicit
confirmation. It accepts the reproduced user-authored belief as an asserted
claim; it does not promote it to `confirmed` merely because the Provider asked
for confirmation.

This is an information-model limitation, not an additional V2 admission gate.

## 7. Shadow comparator findings

The comparator currently does the following:

1. matches legacy diagnostics by an opaque source/temporal correlation key;
2. sets `legacyAllowed = legacyDiagnostic.decision === "accepted"`;
3. compares that Boolean with V2 `state`;
4. records kind/temporal/scope/provenance mismatch flags separately;
5. assigns P1 directly for reasons such as
   `subjective_not_objective_truth`, regardless of whether the legacy
   destination was a belief/non-objective bucket.

It does not compare a complete tuple of legacy disposition, destination,
authority, semantic kind, write eligibility, and V2 disposition/destination/
authority. Thus `old_allow_new_reject` can represent either a true authority
regression or a legacy non-objective claim that V2 correctly refuses as Truth.

## 8. Production-path answer

If the reproduced candidate ran through normal production Direct Chat instead
of `observation_only`:

1. `evaluateKnowledgeWrite` would accept it;
2. `acceptedClaims` would be committed to canonical KnowledgeClaim storage;
3. the claim would retain `kind="belief"` and user-authored
   `truthStatus="asserted"`;
4. Truth retrieval would place it in `openBeliefsAndHypotheses`, not
   `confirmedFacts`, and the Prompt would include the caution that it cannot
   be treated as certain fact;
5. no separate V2 rejection would block this legacy write.

Therefore the reproduced path is not evidence that a subjective belief is
silently converted into a confirmed fact. It is evidence that a subjective
V2 proposal can still become a canonical legacy belief claim because the
epistemic metadata was discarded before `evaluateKnowledgeWrite`.

The repository adapter's generic `canonical=true, authority="authoritative"`
labels mean the system still lacks a clean distinction between canonical
storage authority and objective Truth authority. That remains an architecture
debt and a reason not to treat the current path as fully safe.

## 9. Historical compatibility risk

Existing users may already have `belief` and `hypothesis` claims. They are
currently retrieved in a dedicated cautious bucket, so deleting or retyping
them would risk recall changes and user-visible loss of subjective continuity.
No migration is justified by this audit. A future policy change must be
additive, preserve old claims, define how old claims are read, and include a
rollback/replay plan.

## 10. Classification

**CLASS D — MULTIPLE (Class B + Class C), with no proven Class A on the
reproduced belief path.**

- **Class C is real:** V2 `epistemicStatus`/authority metadata is lost when
  the same response is normalized into the legacy extraction payload and then
  into `KnowledgeWriteCandidate`.
- **Class B is real:** Shadow compares a legacy KnowledgeWrite Boolean with a
  V2 objective-authority decision, without comparing destination or authority
  semantics; the resulting P1 can therefore overstate the mismatch.
- **Class A is not proven for this reproduction:** the retained legacy kind is
  `belief`, and downstream Truth projection keeps it in the cautious
  belief/hypothesis bucket. A legacy response that emits `fact` for the same
  subjective content would be a separate safety case and must be tested
  explicitly before any authority claim is made.

## 11. Minimal future fix options (not implemented)

### Option 1 — Route legacy belief/hypothesis to an explicit non-objective destination

Preserve existing claims and add an explicit non-objective/belief destination
at the candidate-to-claim boundary. This best aligns storage and retrieval
semantics, but requires a compatibility design for existing `KnowledgeClaim`
records and may change future recall formatting.

### Option 2 — V2-only conservative handling

For `metadataSource=v2` with `epistemicStatus=subjective|uncertain`, block or
defer objective-authority writes while leaving legacy behavior unchanged. This
has the smallest immediate production scope, but does not remove the legacy
projection information loss and does not resolve the comparator by itself.

### Option 3 — Candidate-to-Claim adapter gate

Introduce a focused adapter that carries V2 epistemic metadata to the write
decision and rejects/defer subjective candidates before canonical write. This
is the strongest safety boundary, but requires an additive in-memory contract,
fixtures for legacy/mixed/V2-only output, and an explicit compatibility policy
for existing belief/hypothesis claims.

### Comparator-only fix

Independently of write policy, change Shadow to compare disposition,
destination, semantic kind, and authority class. A legacy belief accepted as a
non-objective claim should not be reported identically to a legacy fact written
as objective Truth. This should be a separate approved change from any
production write-policy change.

No Prompt change is needed for this audit. No Provider fallback change is
needed.

## 12. Stage decision

Plan/preference real batches remain paused. The next approved stage should
first define the legacy belief/hypothesis authority contract and the comparator
tuple, then add pure tests for:

- legacy fact, preference, plan, belief, and hypothesis destinations;
- V2 subjective belief versus legacy belief projection;
- V2 uncertain candidates;
- canonical claim kind/truthStatus versus prompt projection;
- comparator severity for non-objective legacy acceptance versus objective
  authority mismatch.

No production behavior, authority, storage, Prompt, Provider, or migration was
changed in Stage 4D-9A.
