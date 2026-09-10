# Stage 4D-10D — Real Runtime Bridge Shadow Evidence

Status: BLOCKED after the first real extraction batch. No Safety-veto Canary
design or production authority change was started.

Starting refactor HEAD: b31c104798783929258ec4c5e58799027ec9dcc9

Original repository baseline: f515f7408cfe19da145f15a8ddffceae06e608d

## 1. Test setup and safety boundary

- Runtime: refactor development server at localhost.
- Browser: an isolated Edge headless/CDP profile outside both worktrees. The
  Codex CUA kernel was unavailable, so this isolated profile was used instead
  of the user's existing browser profile.
- Scope: one synthetic temporary Direct Chat relation and one synthetic test
  character. No user profile, backup, or long-term conversation was opened.
- Persistence mode: observation_only.
- Evidence path: one existing extraction request -> existing parser/source
  binding -> legacy diagnostics and accepted claims -> bridge shadow adapter ->
  metadata-only in-memory export.
- Provider: the configured custom OpenAI-compatible endpoint; no key or
  Authorization value is recorded here or in the export.
- Synthetic transcript: 18 messages total (9 user-authored and 9 character
  context messages). No new message was sent while extraction was running.
- Shadow was empty before extraction and held five ordinary shadow observations
  after extraction. The exported origin was real_runtime.

The first batch already met the stop condition (exact correlation below 60%).
No second plan, preference, or authority batch was run.

## 2. Batch and Provider results

| Item | Result |
| --- | ---: |
| Real batches | 1 |
| Plan batches | 1 (combined with the same extraction) |
| Preference batches | 1 (combined with the same extraction) |
| Authority batches | 1 (combined with the same extraction) |
| extractNow calls | 1 |
| logical memory_extract operations | 2 |
| Provider attempts | 2 |
| primary failures | 1 |
| fallback successes | 1 |
| Provider request delta from bridge | 0 |

The default extraction model attempt failed with the existing
MEMORY_EXTRACTION_DEFAULT_MODEL_FALLBACK/provider-unavailable condition. The
existing active-model fallback succeeded. This stage did not change fallback
or retry behavior. Each logical Ledger record had one provider attempt; the
two records are the existing primary/fallback logical-request behavior.

## 3. Model-native metadata coverage

The five V2 observations were model-native (metadataSource=v2). Six legacy
projections were policy-derived for bridge comparison; zero observations had an
unknown source classification.

| Metadata | Present / distribution |
| --- | --- |
| V2 observations | 5 |
| Legacy-derived observations | 6 |
| Unknown metadata observations | 0 |
| Epistemic status | 5/5 present: objective 4, subjective 0, uncertain 1 |
| planLifecycle | 2/2 plan candidates: active 1, cancelled 1, completed 0, uncertain 0, unknown 0 |
| durability | 0 model-native values; one preference candidate remained unknown/missing |

The model emitted event, hypothesis, two plan candidates and one preference
candidate. It did not emit a subjective candidate, a completed/uncertain plan,
or a stable/temporary durability value. Therefore the plan contract is
partially effective, while the preference durability contract is not proven.

## 4. Bridge correlation and decisions

The bridge export contained 11 observations:

| Metric | Count |
| --- | ---: |
| Total bridge observations | 11 |
| Exact | 0 |
| Exact rate | 0% (0/11) |
| Ambiguous | 0 |
| Unmatched legacy | 6 |
| Unmatched V2 | 5 |
| Legacy-only decision bucket | 0 |
| V2-only decision bucket | 0 |
| Duplicate | 0 |
| Conflict | 0 |
| wouldWriteProposal | 0 |
| wouldSafetyVeto | 0 |
| wouldPassthrough | 6 |
| wouldReview | 5 |
| wouldReject | 0 |
| wouldRoute | 0 |

The unmatched reason is a missing unique shared source correlation/source-window
pairing between the legacy and V2 candidate sets. The sanitized export
intentionally has no raw source IDs, statements, or candidate IDs, so it cannot
support a more specific pairing explanation. No statement was exported.

Because no pair was exact, no write proposal or safety-veto decision can be
treated as validated bridge behavior. The ordinary shadow also reported one
legacy-accepted/V2-rejected cancelled-plan P1. With correlation at zero this is
an unresolved authority/correlation blocker, not a confirmed expected safety
veto and not a confirmed matcher-independent authority conflict.

## 5. Safety and proposal checks

- Confirmed expected safety vetoes: 0.
- Confirmed unexpected authority-binding conflicts: 0; one P1 remains
  unresolved because its legacy/V2 pair was not correlated.
- Authority-conflict, temporary-preference, cancelled-plan, completed-plan,
  scene-only, relationship, and conflicting-duplicate veto counts: 0
  confirmed.
- Write proposals: none, so proposal-validator conditions were not exercised.
- Subjective/uncertain objective proposals: none observed.
- Temporary preference durable proposal: none observed.
- Cancelled/completed plan active proposal: none observed.
- V2-only write and old-reject/new-accept write: none observed.
- Ambiguous reason: not applicable (zero ambiguous records).
- Unmatched reason: no unique shared source correlation; requires matcher
  revision before semantic rates can be interpreted.

The correct readiness classification is MATCHER_REVISION_REQUIRED. The exact
rate is below the blocked threshold and the existing P1 cannot be classified
until the pairings are repaired. No matcher, Prompt, or bridge policy was
modified during evidence collection.

## 6. Storage, authority, and privacy invariants

Before extraction the isolated seed contained one relationship and 18
synthetic messages; after extraction those counts remained one and 18. The
following canonical stores were unchanged:

- KnowledgeClaim: absent/0;
- cursor/relationship last-summary marker: unchanged;
- ConversationSummary: absent/0;
- ProjectionJob: absent/0;
- MemoryItem: present but empty;
- Event: absent/0;
- RelationshipState: unchanged;
- acceptedClaims: unchanged by observation_only.

Only the diagnostic AI Ledger and in-memory shadow evidence were produced in
the isolated profile. No production user data was used or modified.

The export privacy scan found no forbidden keys. It contained no message body,
statement, evidence quote, Prompt, raw Provider response, API key,
Authorization, raw source reference, candidate ID, idempotency key, scope ID,
exception body, or stack trace.

Prompt text, token budget, Provider behavior and request count were unchanged
by the bridge; bridge Provider/token/request deltas were all zero. Storage
schema and production authority were unchanged.

## 7. Readiness and next stage

Readiness: MATCHER_REVISION_REQUIRED.

This evidence is not sufficient for Safety-veto Canary design. The next
approved step should be a separately reviewed matcher revision that preserves
privacy and exact source/scope/provenance checks, followed by a fresh bounded
real batch. Do not reuse this zero-correlation sample as canary evidence, and
do not enter Canary implementation automatically.

## 8. Verification and change boundary

- Production code changed: no.
- Prompt/provider/retry/fallback/authority behavior changed: no.
- Production cutover or Canary: no.
- New persistent user data: no.
- New file: this evidence document only.

The final commit records this document; the original repository remains at its
stable baseline and the refactor worktree remains otherwise clean.
