# Memory Admission V2 — Campaign Governance Implementation

Stage 4D-11Q implements the approved governance design without opening a
new evidence window or changing product runtime behavior.

## 1. Implementation scope

The new dev/evidence-only module is:

scripts/memoryAdmissionCampaignGovernance.ts

It defines and validates window closure manifests, campaign manifests, explicit
window membership, campaign-scoped promotion-scope mappings, Level-2 aggregation,
deduplication, sticky failures, threshold progress, and the developer-side
token continuity contract. It imports the existing Level-1 combiner but does
not modify it.

## 2. Level-1 preservation

combineLongEvidenceExports remains unchanged and continues to reject mixed
window input. Campaign review invokes it independently for every approved
window. A mixed-window input is invalid at Level 1 and cannot be smuggled into
campaign aggregation.

## 3. Current closure manifest

The current lost window has a real sanitized closure manifest at:

docs/evidence/memory-admission-v2/window-8817672802574c9a/window-closure.json

Its governed values are:

- windowStatus: closed_unrecoverable
- closureReason: raw_token_continuity_lost
- authoritativeArtifactCount: 1
- lastAuthoritativeEvidenceDay: 2026-09-10
- interruptedRuntimeExcluded: true
- rawTokenPersisted: false
- authoritativeEvidence: false
- safety/privacy/accounting counts: zero

The counts were derived from the existing disk artifact through the Level-1
reviewer. The closure manifest is governance metadata, never evidence.

## 4. Current campaign manifest

The current campaign is explicitly identified as:

campaign-memory-admission-v2-2026-09-10

Its manifest is:

docs/evidence/memory-admission-v2/campaign-memory-admission-v2-2026-09-10/campaign.json

The campaign is paused, has exactly one explicitly approved and closed window,
and contains no raw token, user/character/conversation ID, prompt, response,
API key, or provider body. Its cumulative counts and threshold progress are
reviewer-derived snapshots, not authority.

## 5. Level-2 Campaign Reviewer

reviewMemoryAdmissionCampaignEvidence performs:

1. manifest/schema validation;
2. explicit approved-window and closure membership checks;
3. duplicate and unapproved-window rejection;
4. one strict Level-1 review per window;
5. closure snapshot validation;
6. evidence/session/logical-action/batch deduplication;
7. campaign promotion-scope mapping validation;
8. controls, suppressions, sessions, batches, attempts, and UTC-day aggregation;
9. sticky safety/privacy/accounting failure evaluation; and
10. unchanged threshold evaluation.

The reviewer never scans arbitrary historical windows and never trusts the
manifest's cumulative counts over the artifacts. A tampered count snapshot
cannot create promotion evidence.

## 6. Stable promotion identity and mapping

The existing window-local scopeFingerprint remains unchanged. Because it is
salted by the window token, it is not used as a cross-window identity.

Level 2 accepts explicit mappings:

windowFingerprint + localScopeFingerprint
  -> promotionScopeFingerprint

The current artifact's scope-bbb51957 is explicitly mapped to
promotion-scope-001. A local scope cannot map to two promotion scopes; missing
or conflicting mappings block review. The same promotion scope may receive
multiple approved-window local scopes and counts once.

A helper also supports future campaign-scoped deterministic promotion
fingerprints over canonical scope tuples without exporting those tuples.

## 7. Deduplication and anti-farming

The reviewer deduplicates artifact bytes, evidence record fingerprints,
session fingerprints, logical-action fingerprints, and batch fingerprints.
Cross-window copies are quarantined/blocked and never double counted.

Sessions require explicit lifecycle participation, a complete persisted artifact,
and a distinct reviewed fingerprint. Repeated checkpoint exports, empty
sessions, copied records, and unapproved membership cannot increase promotion
counts. Suppressions require exact scope, both reviewers, no safety/privacy/
accounting incident, and non-replayed logical/batch identity.

## 8. Sticky failures

Safety incidents, wrong or cross-scope suppression, unauthorized/V2-only write,
privacy violation, accounting conflict, cursor loop, and replay loop produce a
campaign-level sticky failure. A later healthy window cannot clear it.
Defect-resolution/revalidation is intentionally only a future placeholder.

## 9. Current real campaign review

The Level-2 reviewer was run against the one explicit real artifact and closure
manifest. Result:

    status = ok
    approved windows = 1
    closed windows = 1
    authoritative artifacts = 1
    sessions = 1
    scopes = 1
    batches = 1
    controls = 1
    suppressions = 0
    logical actions = 1
    physical attempts = 2
    firstEvidenceDay = 2026-09-10
    lastEvidenceDay = 2026-09-10
    distinctEvidenceDays = 1
    stickyFailure = false
    allMinimumsSatisfied = false
    promotionEligible = false

The closure timestamp and campaign createdAt are governance timestamps only and
do not add evidence days.

## 10. Developer-side token continuity protocol

For a future approved window:

1. developer generates a raw token;
2. token enters a private external holder;
3. holder roundtrip is verified without output;
4. collector startWindow(token) is called;
5. only windowFingerprint is recorded;
6. after runtime loss, the holder is checked first; and
7. if the holder is unavailable, the window is closed rather than replaced.

The holder may be Codex/private automation secret state or another explicitly
private dev-only mechanism. It must not be Git, repository files, docs,
artifacts, console logs, localStorage, IndexedDB, application DB, Ledger, or
chat output. No future token was generated or stored in Stage 4D-11Q.

## 11. Tests and boundaries

scripts/memoryAdmissionCampaignGovernance.test.ts covers closure validation,
manifest-not-evidence, raw-token rejection, strict mixed-window Level 1,
membership, duplicate/unapproved/wrong-campaign windows, cross-window
accumulation, UTC-day deduplication, stable scope mapping, mapping conflicts,
missing mappings, copied artifacts, repeated exports, sticky failures,
thresholds, manifest count tampering, privacy, and the current real artifact.

No Provider, chat, Memory extraction, extractNow, observer toggle, user data,
production writer, storage schema, or UI path was changed.

## 12. Readiness

The governance implementation and real baseline review are complete:

LONG_EVIDENCE_CAMPAIGN_GOVERNANCE_REAL_BASELINE_VALIDATED

The next proposed stage is Stage 4D-11R — Controlled New Window Start. It
requires separate approval and must run only one minimal bounded extraction
with persist-first artifact handling and both reviewers.

