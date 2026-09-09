# Stage 4D-2 — Real Runtime Memory Admission V2 Shadow Evidence

Status: implemented as dev-only metadata observation; Admission V2 is not a production authority.

Starting refactor HEAD: `2d74a0dc0aad9c0623003bf8b553b2b3fb221ed2`

Original repository HEAD: `f515f7408cfe19da145f15a8ddffceae06e608d`

## 1. Runtime seam and authority invariants

When the developer-only evidence switch is enabled, normal automatic one-to-one Direct Chat now follows this additive path:

```text
one existing extraction request
  -> existing parser and runtime source binding
  -> legacy per-candidate diagnostics
  -> legacy acceptedClaims (unchanged canonical authority)
  -> in-memory shadow candidate projection
  -> Admission V2 classification
  -> metadata-only sanitizer
  -> bounded in-memory evidence buffer
  -> explicit local JSON export
```

The production path remains:

```text
provider extraction -> parser -> evaluateKnowledgeWrite -> acceptedClaims
  -> commitMemoryWriteBundle -> appendKnowledgeClaims
```

Admission decisions never alter `acceptedClaims`, canonical writes, `ConversationSummary`, `ProjectionJob`, cursor advancement, delivered replies, retry/fallback, or user data. No dual canonical write exists.

The shadow candidate projection is derived from the already parsed legacy payload when no structured V2 response is present. It does not enable the V2 Prompt and does not make a second Provider request. If a response already contains validated `structuredCandidatesV2`, that additive metadata remains available to the existing adapter.

## 2. Per-candidate legacy diagnostics and correlation

`MemoryExtractor` now fills the existing classification-only diagnostic channel with:

- `decision`: `accepted`, `rejected`, or `incomparable`;
- `stage`: parser or knowledge gate;
- controlled reason code;
- candidate kind and source count when known;
- temporal status when known;
- an opaque in-process correlation key derived only from sorted source references and temporal status.

Parser failures and candidates without safe source identity are `incomparable`; no rejection reason is invented. The adapter never pairs old and new candidates by array position, statement text, or role/name. A duplicate correlation key is also `incomparable`. This means an old rejected candidate can be compared with V2 only when the source identity is unique and safe.

The current Direct Chat shadow result reports both decisions, reason codes, target, mismatch category, scope/provenance/temporal flags, duplicate status and severity. Internal candidate IDs and idempotency keys remain diagnostic-only and are never exported.

## 3. Metadata-only evidence schema

Each exported observation contains:

```text
reportId
observedAt
evidenceOrigin: real_runtime | synthetic
sessionScopeHash
producerVersion
candidateKind
legacyDecision / legacyReasonCode
v2State / v2ReasonCode / v2TargetKind
scopeExact / provenancePresent / evidenceTraceable
temporalStatus / duplicateDetected
sourceCount / sourceFingerprint / lineagePresent
kindMismatch / temporalMismatch / scopeMismatch / provenanceMismatch
severity: P0 | P1 | P2 | P3 | P4
mismatch
```

The exported schema contains no statement, quote, chat message body, character reply, Prompt, system instruction, raw extraction response, raw source/message IDs, diary content, API key, Authorization header, Provider payload, exception text, stack trace, candidate ID or idempotency key.

`sessionScopeHash` and `sourceFingerprint` are salted with a session-only opaque token. The session token is regenerated on reload and never exported, so these values cannot be used as permanent cross-session user fingerprints. The raw scope and source IDs stay inside the runtime observation boundary.

## 4. Buffer, export and failure behavior

- Default: disabled.
- Storage: memory only; no localStorage, IndexedDB, backend or network upload.
- Capacity: at most 100 observations per session; oldest observations are deterministically evicted.
- Reload: buffer disappears.
- Clear: explicit clear removes observations and failure count.
- Export: explicit `download()` creates a local JSON file after sanitization; `exportJson()` returns the same sanitized JSON for local analysis.
- Failure: shadow and telemetry failures are fail-open; the legacy write, cursor and delivered reply continue. Only the safe `shadow_observation_failed` category/count is retained; exception text is discarded.

The aggregation helper reports total, comparable, incomparable, both accepted, both rejected, legacy-accepted/V2-rejected, legacy-rejected/V2-accepted, kind/scope/provenance/temporal/duplicate mismatches, failed-open count, and P0–P4 counts. A single agreement percentage is intentionally not used as an authority gate.

## 5. Severity contract

| Severity | Evidence meaning |
| --- | --- |
| P0 | wrong scope, provenance, privacy or authority boundary |
| P1 | likely durable semantic corruption, scene/reflection to Truth, temporal corruption, or legacy reject/V2 accept |
| P2 | important valid-memory loss or unresolved accepted-kind mapping |
| P3 | taxonomy or diagnostic mismatch without a write effect |
| P4 | benign normalization/metadata difference |

Severity is evidence metadata only. It never changes production persistence.

## 6. Candidate mapping status

The shadow projection makes these current mappings explicit, without granting write authority:

| Legacy/V2 meaning | Shadow mapping | Cutover status |
| --- | --- | --- |
| fact | `fact` → Truth target | Requires the existing canonical write policy |
| event | `event` → Event target | Temporal validation remains required |
| plan | `plan` → Truth candidate only | Future/OpenLoop mapping not implemented |
| belief | `belief` → Belief target | Subject semantics remain explicit |
| episodic | `episodic` → Episodic target | No direct `KnowledgeKind` mapping yet |
| preference | `fact + preference` | Stable/temporary durability mapping remains unresolved |
| relationship signal | `needs_review` | No RelationshipState mutation |
| scene-only | rejected | Never durable Truth |
| subjective reflection | rejected as Truth | Diary/subjective route remains separate |
| unknown | rejected/incomparable | No guessed canonical kind |

## 7. Isolation and invariance tests

The Stage 4D-2 tests cover runtime-owned character/relation/user/conversation scope, same-source ambiguity, source correlation, temporal status, scene rejection, subjective rejection, relationship review, privacy sanitization, buffer eviction/clear, real/synthetic separation, failed-open accounting, and the no-Prompt/no-extra-request observation path. Existing Admission, provenance, source-reference, canonical-write, cursor, projection and feature-boundary suites remain required.

Direct Chat future authority requires all four exact scope IDs. A missing conversation is recorded as a shadow scope mismatch in this stage; it does not change legacy production behavior. Character names, avatars and persona similarity never participate in scope identity.

Manual, Group, Offline, Diary, Reading, Moments, Forum, Character Phone, proactive, voice and image-generation paths are not enabled by this seam. The hook explicitly gates the observation flag to automatic Direct Chat. Stage 4C Summary/ProjectionJob behavior and `MemoryItem` compatibility remain unchanged.

## 8. Developer operation without Codex CUA

The normal developer build exposes a small DevTools-only API; it is not a user-facing feature and is not installed in production builds.

1. Start the normal local development app (`npm run dev`).
2. Open the browser DevTools console for that local app.
3. Enable observation with:

   ```js
   globalThis.__fanfanjiMemoryAdmissionShadow.enable()
   ```

4. Use normal one-to-one Direct Chat. Send several messages that cover a stable fact/preference, a past event, a future plan, a belief, a scene-only context, and a subjective/relationship signal. Do not paste secrets or sensitive test data; only metadata is exported, but ordinary local privacy practice still applies.
5. Check the in-memory count:

   ```js
   globalThis.__fanfanjiMemoryAdmissionShadow.count()
   ```

6. Download the sanitized local report:

   ```js
   globalThis.__fanfanjiMemoryAdmissionShadow.download()
   ```

   Or inspect/copy the JSON string with `exportJson()`.

7. Disable and clear the session buffer:

   ```js
   globalThis.__fanfanjiMemoryAdmissionShadow.disable()
   globalThis.__fanfanjiMemoryAdmissionShadow.clear()
   ```

8. Provide the downloaded JSON to Codex for analysis. Codex should verify `evidenceOrigin`, aggregate metrics, P0/P1/P2 samples, incomparable counts, scope/provenance/temporal mismatches, and the absence of forbidden fields. Synthetic replay output must be supplied separately and never combined with real-runtime metrics.

If the current browser/CUA environment is unavailable, this local DevTools path remains the evidence collection mechanism. Browser smoke is tracked separately as `DIRECT_CHAT_BROWSER_SMOKE` and is not a prerequisite for collecting metadata-only reports.

## 9. Remaining gates

Stage 4D-2 does not establish production readiness. Outstanding blockers include real report collection and analysis, mapping for episodic/preference/plan temporal semantics, durable duplicate and contradiction policy, explicit candidate-to-claim conversion, exact conversation fail-closed authority behavior, canary rollback proof, and review of all P0/P1/P2 findings.

The next step is to collect and analyze real `real_runtime` reports. Production cutover is not recommended directly after this stage and is not performed here.
