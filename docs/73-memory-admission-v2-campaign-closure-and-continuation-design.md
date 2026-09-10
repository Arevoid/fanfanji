# Memory Admission V2 — Campaign Closure and Continuation Design

Stage 4D-11P is a design/audit checkpoint. It does not create a campaign,
window, token, manifest, or runtime implementation.

## 1. Problem and current facts

The current collector binds one runtime window to a raw developer-held token.
Window window-8817672802574c9a lost its original tab and token. Its one
persisted, reviewed artifact remains authoritative; only future continuity is
lost. The interrupted runtime is permanently non-authoritative and excluded.

Retained baseline: one artifact, one formal session, one exact scope, one
batch, one valid control, zero suppressions, one logical action, two physical
attempts, and one UTC evidence day (2026-09-10). No production persistence,
replacement window, or replacement token is authorized.

## 2. Terminology and boundaries

Window is one raw-token-backed runtime collection boundary. Token, session,
observer, and collector state are runtime-local.

Campaign is a governed Memory Admission V2 development-evidence period. It is
not a product or user-data concept and may contain multiple explicitly
approved sequential windows.

Recovery boundary excludes unavailable historical full exports and resets
authoritative counting. Window closure boundary freezes one window when
runtime/token continuity is lost or it is intentionally ended. Closure never
invalidates an already-authoritative artifact.

Promotion authority remains a full sanitized artifact that was persisted,
read back, privacy-checked, and passed the Window Reviewer. Closure and
campaign manifests are governance metadata, not evidence.

## 3. Recommended Window/Campaign model

    Campaign C
      ├── Window A (approved, closed)
      │    ├── artifact 1
      │    └── artifact 2
      ├── Window B (approved, closed/active)
      │    └── artifact 3
      └── Window C (approved, future)
           └── artifact 4

Each window has an independent raw token/fingerprint. A lost window may be
closed as closed_unrecoverable; a later window may join the same campaign only
after explicit governance approval and with a new token. It must never silently
resume or recreate the lost window.

A new campaign is required when policy, feature scope, authority model, privacy
boundary, or evidence semantics materially change, or when a prior campaign
has a sticky safety/privacy/accounting failure without defect resolution and
revalidation.

## 4. Reviewer levels

combineLongEvidenceExports remains the strict Level-1 Window Reviewer. It
continues to require one windowFingerprint, enforce privacy/schema checks,
deduplicate records, and reject mixed-window input.

A future Level-2 Campaign Reviewer consumes only artifacts that each pass Level
1, plus approved lifecycle and membership metadata. Mixed windows remain
invalid at Level 1 but are an explicit Level-2 input after membership proof.

## 5. Continuation options

### Option A — Invalidate old evidence

New campaigns start at zero and old artifacts become history only. This is
simple and anti-farming, but contradicts persist-first authority and wastes
valid long-duration evidence. Not recommended.

### Option B — Retain evidence, reset promotion counters

Old artifacts remain authoritative but a new campaign starts at zero. This is
the safest default for a deliberately new campaign, at the cost of repeated
work.

### Option C — Campaign-level cumulative promotion ledger

Approved windows accumulate under one immutable campaign. This preserves valid
work and real multi-day semantics, but requires membership, stable identity,
deduplication, closure validation, and sticky-failure controls.

### Recommendation — bounded C, B across campaigns

Use Option C only inside one explicitly approved campaign. A new campaign uses
Option B even though old artifacts remain valid for audit. The current artifact
may enter a future campaign only through an explicit campaign manifest; no
automatic import is performed here.

## 6. Cross-window accumulation matrix

| Metric | Campaign/promotion treatment | Must not cross |
| --- | --- | --- |
| authoritative artifacts | cumulative after both reviewers | unrelated campaigns |
| formal sessions | cumulative distinct reviewed session fingerprints | replay/unapproved sessions |
| exact scopes | cumulative only after stable promotion-scope identity | raw window-token hashes |
| extraction batches | cumulative after batch deduplication | copied/replayed batches |
| controls | cumulative only from zero-incident reviewed records | failed/unreviewed windows |
| suppressions | cumulative only with exact scope, review, and zero incidents | unsafe/cross-scope records |
| logical actions | cumulative after stable action deduplication | repeated exports/actions |
| physical attempts | cumulative accounting detail, never a logical-action substitute | unknown/conflicting groups |
| evidence days | cumulative set of authoritative UTC dates | token duration/unapproved campaigns |
| first/last evidence day | min/max of campaign-authoritative UTC dates | summaries or guessed dates |
| fallback batches | cumulative by deduped logical action | unknown-lineage fallback rows |
| safety incidents | campaign-sticky failure; never clears readiness | window replacement |
| privacy violations | campaign-sticky failure and review rejection | redaction or copied artifacts |
| accounting conflicts | campaign-sticky failure; conflicting groups excluded | restart/window replacement |

Per-window views remain available for audit. Promotion uses only the gated
campaign aggregate. Unrelated campaigns do not share counters by default.

## 7. Evidence-day semantics

An evidence day is the UTC calendar date represented by an authoritative full
artifact, not raw-token duration. Window A on 2026-09-10, B on 2026-09-11,
and C on 2026-09-13 represent three days; missing dates do not count. The
greater-than-or-equal-to-seven real evidence days threshold remains unchanged.

## 8. Stable promotion scope identity

The current scopeFingerprint is salted with the active window token, so it is
stable within one window but not across windows. It must not be used for
campaign-level scope deduplication.

Future review needs a campaign-scoped, developer-controlled hashing namespace
over the canonical scope tuple. Only a non-secret campaign fingerprint is
retained; character, relation, identity, conversation IDs and raw tokens are
never exposed. This is design-only and not implemented here.

## 9. Session and suppression anti-farming

Count a session only when it comes from an explicit enable/resume cycle, has a
complete persisted artifact, and has a distinct reviewed session fingerprint.
Repeated exports, copied records, empty sessions, conflicting accounting, and
unapproved window membership are rejected or quarantined. Refreshes cannot
manufacture credit.

Count a suppression only after both reviewers pass, exact scope is correct,
the artifact is authoritative, no safety/privacy/accounting incident exists,
and logical/batch identity is not a replay. Changing windows cannot launder an
unsafe or cross-scope candidate.

## 10. Sticky failures

Wrong/cross-scope suppression, unauthorized or V2-only writes, privacy
violations, accounting conflicts, cursor loops, and replay loops are
campaign-sticky failures. Later windows cannot restore healthy readiness.
Recovery requires a separately approved defect-resolution and revalidation
protocol; this design supplies no bypass.

## 11. Closure manifest design

A future sanitized window-closure.json may contain:

    schemaVersion
    windowFingerprint
    campaignFingerprint
    status = closed | closed_unrecoverable
    closureReason
    closedAtUtc
    authoritativeArtifactCount
    lastAuthoritativeEvidenceDay
    interruptedRuntimeExcluded
    rawTokenPersisted = false
    safetyIncidentCount
    privacyViolationCount
    accountingConflictCount
    authoritativeEvidence = false  # the manifest itself is not evidence

The current window's designed disposition is:

    closureReason = raw_token_continuity_lost
    windowStatus = closed_unrecoverable
    authoritativeArtifactsRetained = true
    interruptedRuntimeExcluded = true
    promotionEvidenceRetained = true

No closure manifest is created in Stage 4D-11P.

## 12. Campaign manifest design

A future sanitized campaign.json may contain schemaVersion,
campaignFingerprint, campaignStatus, approvedWindows, closedWindows,
promotionPolicyVersion, cumulativeAuthoritativeCounts, zeroErrorState,
firstEvidenceDay, lastEvidenceDay, and thresholdProgress. It must not contain
raw tokens, user/character/conversation IDs, prompts, responses, API keys, or
provider bodies. The manifest records membership and policy only.

## 13. Campaign reviewer design

Future reviewMemoryAdmissionCampaignEvidence should: (1) run the existing
Window Reviewer for every window; (2) validate lifecycle and campaign
membership; (3) reject unreviewed or invalid closures; (4) deduplicate window,
evidence, logical-action, and batch fingerprints; (5) derive stable promotion
scope identities; (6) aggregate sessions, scopes, batches, controls,
suppressions, attempts, and UTC days; (7) apply sticky safety/privacy/
accounting failures; and (8) evaluate unchanged thresholds. Its output is
sanitized campaign review metadata, separate from evidence artifacts.

## 14. Raw-token durability strategies

Strategy 1 — Fully volatile: strongest product privacy and simplest contract,
but runtime loss closes the window.

Strategy 2 — Developer-controlled ephemeral external holder: keep the raw token
only in private automation/session secret state outside product storage,
repository, artifacts, logs, and user data. This balances continuity and
privacy and is recommended for controlled future evidence runs.

Strategy 3 — Encrypted local developer-only persistence: adds key, compromise,
backup, and storage-contamination risks without sufficient benefit; not
recommended.

Never store the raw token in localStorage, IndexedDB, application DB, artifact,
docs, logs, or Ledger.

## 15. Migration and current-window recommendation

1. Keep the Level-1 single-window reviewer strict and unchanged.
2. Close the current lost window as closed_unrecoverable while retaining its
   artifact and historical window counts.
3. Define and review closure/campaign manifests before implementation.
4. Add a Level-2 reviewer and stable promotion-scope/action namespaces.
5. Add developer-side continuity checks without product persistence.
6. Require explicit approval for every future window and preserve all current
   thresholds.

For window-8817672802574c9a, retain its one authoritative artifact, exclude the
interrupted runtime permanently, never resume or recreate the fingerprint with
a guessed token, and allow future same-campaign continuation only after Stage
4D-11Q governance implementation and approval. A deliberately new campaign
starts promotion counters at zero.

## 16. Readiness

This design checkpoint is ready for review:

LONG_EVIDENCE_CAMPAIGN_DESIGN_READY

No production code, runtime state, user data, token, window, or evidence was
modified. The proposed next stage is Stage 4D-11Q — Campaign Governance
Implementation / Closure Preparation. It must not open a new evidence window
automatically.

## 17. Implementation checkpoint

Stage 4D-11Q implements this design in dev/evidence governance tooling only.
The current campaign is explicitly identified as
campaign-memory-admission-v2-2026-09-10, with the existing window as its sole
approved and closed member. The closure and campaign manifests are sanitized
governance metadata; the full evidence artifact remains the authority. No
runtime token, observer state, or product storage was changed.


