# Stage 4D-11O-R3 — Dedicated Long-Evidence Fixture Design

Date: 2026-09-11  
Starting refactor HEAD: `f5bbd1e3a6702c8d12af4612cc574ad7e492865e`  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`  
Campaign: `campaign-memory-admission-v2-2026-09-10`

Readiness: `DEDICATED_EVIDENCE_FIXTURE_DESIGN_READY`

This stage is a design-only checkpoint. It does not create fixture data, add a
Window or raw token, enable a collector/shadow/Canary, send a message, call a
Provider, call `extractNow()`, run automatic extraction, seed an archive marker,
override a threshold, inject a repository record, or change production code,
Prompt, Provider, Memory authority, storage schema, Campaign state, or user
data. The only intended repository change is this document.

## 1. Problem and unchanged production contract

The previous audit (`docs/78-memory-admission-v2-automatic-trigger-eligibility-audit.md`)
found no safe persisted conversation whose next ordinary Direct Chat turn could
reach the automatic archive gate. The existing `Stage4D3 临时样本` is real and
isolated, but its last recoverable count was at most three messages after a
present archive marker; it is at least 97 messages short of the default gate.

The production trigger remains exactly:

```text
configuredRounds = activeCharacter.summaryTriggerRound
rounds = clamp(round(configuredRounds), 10, 100), or 50 if absent/non-finite
triggerCount = rounds * 2
eligibleMessages = currentChatMessages + current user message + delivered replies
eligibleMessages = messages after relation.lastImmediateSummaryMsgId when found
automatic extraction when eligibleMessages.length >= triggerCount
```

The entry is `createChatSideEffectController().afterReplySuccess()`. It is
reached only after a normal direct reply has delivered at least one assistant
message. The extraction task is delayed by 200 ms and is not awaited by the
visible reply. A relation marker is a processed-input cursor, not an evidence
record. A successful pass (including a zero-candidate pass) or a safe Cheap
Filter skip advances the existing cursor; a failed background pass leaves it in
place and applies the existing five-minute in-memory cooldown. `historyMemoryLimit`
still controls extraction batch splitting independently of the trigger round.

The exact runtime scope must be the existing production boundary:

```text
characterId + relationId + userIdentityId + conversationId
```

Group, offline, manual, diary, Moments, phone, forum, migration and unrelated
background paths are not part of this fixture design.

## 2. Decision summary

The recommended future fixture is a **single dedicated synthetic local profile
in a separate browser storage partition**, containing one normal canonical
Character, one normal canonical UserIdentity, one normal CharacterRelationship,
and its derived direct Conversation ID. A private dev-only manifest may record
only lifecycle and privacy-safe ID fingerprints. The production runtime reads
the ordinary repositories in that isolated profile; it does not import or query
the manifest.

This combines the useful part of Option C (a clean, durable local profile) with
Option A (dedicated character/relation/conversation) and the required identity
boundary from Option B. It gives a real Direct Chat path without risking the
user's existing settings, characters, relationships, messages, memories or
backups. It requires no production schema change. It is intentionally not a
second Memory implementation or a test-only extraction path.

The evidence policy is two-layered:

1. `summaryTriggerRound=10` is allowed only as a clearly labelled local
   mechanism/readiness characterization. It is a valid product setting, but its
   results are not default-behavior promotion evidence.
2. `summaryTriggerRound=50` is the default-behavior characterization and the
   recommended setting for authoritative long-evidence windows.

This is the safest way to keep the first run bounded without presenting a
minimum-threshold fixture as representative of the default product.

## 3. Identity and fixture model

The future manifest should describe one fixture without duplicating domain
semantics:

```text
DedicatedEvidenceFixtureManifest
  fixtureId                 opaque dev-tool label
  fixturePurpose            long_evidence_direct_chat
  dataClassification        developer-local / synthetic / non-production
  characterIdFingerprint    privacy-safe fingerprint of canonical ID
  relationIdFingerprint     privacy-safe fingerprint of canonical ID
  userIdentityIdFingerprint privacy-safe fingerprint of canonical ID
  conversationIdFingerprint privacy-safe fingerprint of canonical ID
  triggerRound              10 or 50, recorded as configuration
  lifecycleState             planned | ready | accumulating | trigger_ready |
                              evidence_window_active | archived_once |
                              continuing | retired | invalid
  createdAt
  messageCount              metadata count only
  archiveCursorPresent      boolean only; never the raw cursor value
  lastInspectedDistance     integer metadata only
  lastInspectionAt
```

These are references to existing canonical records, not replacement entities.
`relation.conversationId` remains the existing `direct:${relation.id}` contract;
the bootstrap must not invent a second conversation table. IDs must be created
through the project's governed `createId`/normal domain creation patterns. The
future helper must not use names, avatars, filenames or content to infer
identity or relation ownership.

The dedicated Character is required because `summaryTriggerRound` is a
per-character production setting and the fixture must not change a user's
character. Its persona should be short, stable and ordinary. It must not
contain instructions that force a candidate, cancellation, suppression, or any
specific extractor output.

A dedicated Relation is required because automatic Direct Chat eligibility and
the archive cursor are relation-scoped. Reusing a user's relation would mix
history, marker state, ownership and Campaign scope.

A dedicated UserIdentity is required for a durable exact ownership boundary.
The identity is synthetic and local to the isolated profile, not a copy of a
real user's identity. It must be created through the normal identity settings
path, with no name/avatar matching or alias inference. It is not added to the
user's real profile or backup.

A dedicated Conversation is required in the domain sense, but it is the
existing derived `direct:${relationId}` value rather than a new repository.

## 4. Isolation options

| Option | Real production runtime | UI/data isolation | Schema change | Reset/reload | Assessment |
|---|---|---|---|---|---|
| A. Dedicated Character + Relation + Conversation in current profile | yes | weak; synthetic records can appear beside user data | no | easy but risky | not sufficient alone |
| B. Dedicated identity namespace in current settings | yes | weak unless every UI path learns a new hidden flag | no initially, but broad filtering pressure | durable | useful boundary, unsafe without profile isolation |
| C. Separate dev browser profile/storage partition | yes; same Vite app and repositories | strong; no user localStorage/IndexedDB is mounted | no | easy to discard/recreate; survives reload/server restart | **recommended base** |
| D. Existing dev fixture registry extension | only if it delegates to production repositories | metadata can be isolated, but registry alone does not isolate messages | no if metadata-only | depends on storage | use only as a label/inspector layer, not as data isolation |

Option C means a separate Edge/CDP or in-app dev profile whose localStorage and
IndexedDB are empty or dedicated. It is an environment boundary, not an
application feature and not a database migration. The same runtime code,
repository adapters, direct scope resolver, message projection, controller,
Prompt and Provider path are used. The production app has no conditional read
of the fixture manifest.

An app-level fixture profile/database would be a future alternative only if the
existing storage adapter grows an explicit profile boundary. That is outside
this stage and must not be approximated by changing storage keys ad hoc.

## 5. Future bootstrap path (Stage 4D-11O-R4)

Bootstrap must create exactly one fixture, and must stop before accumulation.
The proposed sequence is:

1. Assert a dev build and an explicitly selected dedicated browser storage
   profile. Refuse to proceed if existing user data or a non-empty production
   profile is detected.
2. Create one synthetic UserIdentity through the normal settings/domain update
   path. Persist it with the existing settings repository. Do not copy a real
   identity's text or avatar.
3. Create one ordinary Character with the minimal stable persona, explicit
   `ownerIdentityId`, no group flag, no album/phone/diary data, and the chosen
   legal `summaryTriggerRound`. Persist through the existing character save
   path.
4. Create one ordinary relationship with `createRelationship`, a governed
   relation ID, the synthetic identity ID, the character ID, and the normal
   derived conversation ID. Persist through the relationship repository/use
   case.
5. Open the resulting direct conversation through the normal UI/controller
   route, then verify `resolveDirectInteractionScope` returns the exact four
   IDs.
6. Confirm initial Memory and knowledge stores are empty (or only records
   produced by the normal character/relationship creation flow), with no
   pre-seeded claims, summaries, projections, archive cursor, or transcript.
7. Write only the privacy-safe manifest metadata. Mark the fixture `ready` and
   run the read-only inspector. Do not send a message in the bootstrap stage.

The helper may orchestrate existing repositories and use cases, but it may not
call `saveMessages` with handcrafted transcript rows, mutate a relation marker,
write raw JSON, import a backup, or invoke `extractNow()`.

## 6. Threshold strategy

| Strategy | Trigger setting | Nominal eligible messages | Nominal one-reply turns | Cost/order of magnitude | Evidence meaning |
|---|---:|---:|---:|---|---|
| 1. Default characterization | 50 | 100 | 50 | about 50 chat requests + 1 extraction per cycle | representative of default product behavior |
| 2. Minimum legal setting | 10 | 20 | 10 | about 10 chat requests + 1 extraction per cycle | mechanism/readiness only; not default representative |
| 3. Two-layer policy | 10, then 50 | 20, then 100 | 10, then 50 | bounded readiness run followed by the default run | **recommended** |

The counts are nominal. A multi-bubble assistant reply can add more than one
message, and retry/fallback can add physical Provider attempts without changing
the logical turn count. The Ledger must be used to report actual counts. A
single trigger can also split into multiple extraction requests when
`historyMemoryLimit` is configured below the eligible message count.

`10` is a legitimate production configuration because the existing UI and
controller clamp the persisted per-character setting to 10..100. Using it on a
synthetic character is therefore not a threshold override. It does, however,
shorten the observed history and raises the chance that a small semantic sample
is over-interpreted. It must be labelled `mechanism_characterization`, excluded
from default promotion claims, and followed by a `50` run before any claim about
default behavior.

The first trigger should nominally occur after 20 eligible messages/10 simple
turns at `10`, or 100 eligible messages/50 simple turns at `50`. “Simple” means
one user message and one delivered assistant message; the inspector, not a
hardcoded turn counter, is authoritative.

## 7. Bounded accumulation protocol

Accumulation is ordinary Direct Chat only. It is not evidence and does not
enable a collector, shadow, Canary or Window. The recommended per-stage cap is:

```text
maximum normal turns per accumulation stage: 3
nominal new messages: at most 6 (actual projection is authoritative)
maximum logical chat requests: 3
maximum intended extraction requests: 0
```

Provider retries/fallbacks are not to be induced; if they occur naturally, the
Ledger reports their physical attempts. A turn that yields multiple assistant
bubbles ends the stage early and triggers a fresh inspection. No batch sender,
looped clicker or giant transcript is allowed.

The operating loop is:

```text
inspect
→ at most three normal turns
→ inspect again
→ stop if distance <= 2 messages
→ otherwise continue in a separately recorded stage
```

When `distanceToTrigger <= 2`, accumulation stops. The next normal
user+assistant turn is reserved for a separately approved Window. No Window is
opened merely because a fixture is getting close; it is created only after the
Campaign and Window governance checks succeed.

If the team prefers five-turn sessions for operator convenience, five is an
upper scheduling convenience only; it must still stop immediately on a
distance of two or less and must not exceed five logical chat requests. The
default recommendation remains three for auditability and cost control.

## 8. Read-only trigger-distance inspector

The future dev-only `inspectDedicatedEvidenceFixture()` should read the active
exact scope and return metadata only:

```text
fixtureId / lifecycleState
exactScopeHealth: yes/no
eligibleMessageCount
triggerCount
distanceToTrigger = max(0, triggerCount - eligibleMessageCount)
archiveMarkerPresent: yes/no
archiveMarkerFoundInLoadedScope: yes/no
inFlight: yes/no
cooldownActive: yes/no
isGroup: yes/no
isOffline: yes/no
nextTurnTriggers: yes/no
```

It must not return raw message IDs, message body, Prompt, memory candidate,
Provider response, API key, marker value, or user profile text. It must not
write storage, advance a cursor, schedule extraction, enqueue a request, or
change React state. `nextTurnTriggers` is true only when the exact scope is
healthy, no in-flight/cooldown guard is active, and the remaining distance is
no more than the conservative two-message normal turn.

If the marker is absent from the loaded scope, the inspector reports that fact
and marks the fixture `invalid` for evidence planning rather than pretending
the entire loaded list is an exact pending range. The existing extraction hook
may conservatively reprocess the loaded list, but the inspector must not turn
that ambiguity into an evidence Window.

If this inspector is implemented later, its tests must cover empty, below
threshold, one-turn-away, exact threshold, marker exclusion, marker-not-found,
cooldown, in-flight, group, offline and mutation-free cases. Tests must use
in-memory values and must never create fixture data or Provider requests.

## 9. Lifecycle and unexpected extraction

The proposed state machine is:

```text
planned
  → ready
  → accumulating
  → trigger_ready
  → evidence_window_active
  → archived_once
  → continuing
  → accumulating ...

any unsafe scope/storage/identity condition → invalid
retired fixture or explicit end of campaign → retired
```

`planned` means only a manifest plan exists. `ready` means bootstrap and exact
scope checks passed with no transcript. `accumulating` means bounded ordinary
turns are in progress. `trigger_ready` means the inspector has proven a
one-turn gate without starting a Window. `evidence_window_active` is owned by
the existing Campaign governance, not by the fixture registry. `archived_once`
means a real automatic pass completed and the normal relation marker advanced.
`continuing` permits a later cycle after readback and closure checks. `invalid`
is sticky for the current accumulation cycle when identity, marker or scope
assumptions cannot be proven.

If an automatic extraction happens unexpectedly during accumulation, it is not
silently counted as evidence and does not retroactively open a Window. The
operator must:

1. record the fixture state and safe Ledger metadata;
2. check exact scope, marker presence and marker readback;
3. determine whether the pass completed, failed, or only scheduled;
4. mark the current accumulation cycle `invalid` if the pre-trigger distance
   was not proven;
5. exclude the pass from the Campaign and close any accidental observer state;
6. start a fresh controlled cycle only after a new reviewer decision.

The fixture itself may continue after a verified normal archive, but only with
the new post-marker distance. A marker that is missing, outside the loaded
scope, or inconsistent with the observed result requires retirement/reset of
the fixture cycle, never a guessed marker edit.

## 10. Campaign integration

Accumulation turns are explicitly outside the Campaign:

```text
long-lived fixture accumulation
  ≠ evidence Window
  ≠ formal session
  ≠ batch/control/suppression artifact
```

Only the one normal turn that may cross the already-satisfied gate belongs in a
future governed Window. The existing protocol remains:

```text
inspect distance <= one normal turn
→ create and privately hold raw token
→ create/approve Window through Campaign governance
→ enable existing observers only after approval
→ send exactly one evidence-driving normal turn
→ automatic extraction / persist-first readback
→ close Window, clear token, Level-1, then Level-2
```

No Campaign counter, promotion scope, formal session, suppression count or
evidence day changes during fixture accumulation. Multiple future scopes are
achieved by bootstrapping one isolated fixture per scope in separate profiles
or clearly separated profile partitions, then explicitly mapping each exact
scope to a Campaign promotion scope. This stage creates none of them; the next
bootstrap stage creates exactly one.

## 11. Reload, registry and privacy

Messages, relationships, characters and settings already have durable
localStorage/IndexedDB repository paths. In the recommended isolated browser
profile they survive page reload and dev-server restart. The manifest is only a
dev-tool index and must be recoverable independently; it stores labels,
privacy-safe fingerprints, timestamps, trigger configuration, lifecycle and
counts, never message content or raw IDs. A lost manifest does not authorize a
new fixture to claim continuity: the inspector must re-discover canonical
records and require an explicit operator decision.

The registry is useful and recommended, but it is not a product dependency.
Production chat must not import it, filter ordinary UI based on it, alter
thresholds based on it, or use it to select a Provider. If no safe metadata
store is available, a private dev-side manifest outside the repository is
preferable to adding a product-facing storage schema. Raw Campaign tokens,
Prompt, chat history, API keys, Authorization headers and Provider bodies are
never registry fields.

The manifest's fingerprints are for correlation only. They are not reversible
identity material and must not be used to infer a relation or identity from
similar names, avatars or content.

## 12. Suppression and semantic coverage

The fixture persona must remain neutral and predictable. It must not say “always
output cancelled plan”, inject extractor instructions, or otherwise hack the
Prompt. Future suppression coverage should arise from ordinary, separately
approved turns with natural semantic variety: an active plan later cancelled,
a stable fact, a preference, a changed plan, and an ambiguous/uncertain claim.

The operator records the user-authored scenario label outside the Prompt, while
the Provider response and parser remain authoritative. No candidate is
hardcoded or inserted for the purpose of producing a suppression. A single
fixture can continue across cycles, but semantic scenario order must be
bounded and documented so that one long transcript is not treated as ten
independent scopes.

## 13. Cost and failure controls

At the default setting, reaching the first trigger is roughly 50 normal logical
chat requests plus one extraction logical request. At the minimum setting it is
roughly 10 plus one. Physical attempts can be higher because the existing
retry/fallback policy is unchanged. The fixture should never deliberately
exercise retries to reach the threshold, and the Ledger must distinguish one
logical request from its provider attempts.

Three-turn stages bound accidental spend and give an operator a stop point. A
campaign Window has its own stricter one-turn request budget; accumulation must
not borrow that budget or be counted as a formal batch. Provider failure,
quota, safety or persistence errors stop the current cycle and do not justify a
threshold change, bulk replay or marker override.

## 14. Reset, retirement and post-archive continuation

Reset is allowed only for a fixture-local corruption or safety condition:

* identity/scope mismatch;
* marker missing or inconsistent;
* accidental non-production data contamination;
* unrecoverable manifest/profile loss;
* evidence cycle corruption detected before authoritative closure.

Reset means retire or discard the isolated browser profile and create a fresh
fixture in a new profile after review. It must not delete authoritative Campaign
artifacts, rewrite a closed Window, remove user data, or repair history by
editing raw repository JSON. The current `Stage4D3 临时样本` remains untouched.

After a verified automatic archive, the fixture may continue with the same
canonical objects: the marker advances through the normal writer, the inspector
recomputes the new distance, and the next cycle returns to `continuing` then
`accumulating`. A new Window is required for every evidence-driving turn.

The unrelated `BACKGROUND_PROVIDER_ROUTING_DEBT` for Moments is unchanged and
is not solved by this fixture design.

## 15. Implementation recommendation for the next stage

Stage 4D-11O-R4 should implement only one dev-only bootstrap and the smallest
read-only inspector/manifest seam needed to validate it. It should:

* use the existing identity, character, relationship and message domain paths;
* create one fixture in a dedicated local browser profile;
* leave transcript, Memory and archive marker empty at bootstrap;
* validate persistence and exact scope after reload;
* expose only privacy-safe inspector metadata;
* stop before any accumulation turn.

It should not add a new database, storage profile schema, Provider adapter,
Prompt path, extraction path, threshold override, UI redesign, bulk sender,
repository injection or Campaign Window. If a safe profile boundary cannot be
proved, the stage is blocked with
`DEDICATED_EVIDENCE_FIXTURE_DESIGN_BLOCKED` rather than falling back to the
current user profile.

## 16. Explicit answers and stop state

1. **Recommended isolation:** separate dev browser storage profile/partition,
   plus one canonical synthetic identity, character, relation and derived
   conversation.
2. **Why:** same production runtime and repositories, but no user storage is
   mounted or mixed.
3. **Dedicated character:** yes; it owns the legal per-character trigger
   setting and prevents changing a user's character.
4. **Dedicated relation:** yes; marker and exact scope are relation-owned.
5. **Dedicated user identity:** yes; it is the durable ownership boundary in the
   isolated local profile.
6. **Dedicated conversation:** yes in domain terms; use the existing derived
   `direct:${relationId}`, not a new table.
7. **Production schema changes:** none.
8. **Fixture registry:** recommended as a metadata-only dev manifest, not as a
   production data store.
9. **Registry production dependency:** none; production chat must not import or
   consult it.
10. **Bootstrap path:** normal settings/identity, character, relationship and
    exact-scope routes/repositories; no raw JSON or transcript injection.
11. **Direct repository injection:** no.
12. **Initial Memory seeded:** no; empty or only records produced naturally by
    normal creation.
13. **Initial archive marker seeded:** no.
14. **Trigger-round policy:** record a legal per-character value; use two-layer
    `10` readiness then `50` default characterization.
15. **50 or 10:** both for different claims; `50` for authoritative default
    evidence, `10` only for mechanism characterization.
16. **Is 10 legal:** yes, the existing production range is 10..100.
17. **Does 10 weaken evidence:** yes for default-behavior claims; it is a
    shorter semantic sample.
18. **Mitigation:** label it non-promotion mechanism evidence and follow with a
    50-round run.
19. **Messages to first trigger:** nominally 20 at 10, 100 at 50, measured by
    the inspector after the relation marker.
20. **Normal turns:** nominally 10 or 50 with one assistant message per turn;
    multi-bubble turns can reach it earlier.
21. **Maximum accumulation per stage:** recommend three normal turns (five is a
    hard convenience ceiling only with inspection after each stage).
22. **Campaign evidence:** no; accumulation is excluded.
23. **Window during accumulation:** no; only after one-turn readiness and
    governance approval.
24. **Inspector:** metadata-only exact-scope count, trigger, distance, marker
    presence/foundness, in-flight/cooldown and next-turn decision.
25. **Inspector mutation:** none.
26. **Next-turn criterion:** healthy exact scope, no guard active, and distance
    <= two messages.
27. **Unexpected extraction:** exclude from evidence, inspect marker/readback,
    invalidate the cycle when pre-trigger proof is absent, and require a fresh
    reviewer decision.
28. **Reload persistence:** normal repositories in the isolated profile survive
    reload/server restart; manifest loss requires rediscovery, not guessed
    continuity.
29. **Lifecycle:** planned, ready, accumulating, trigger_ready,
    evidence_window_active, archived_once, continuing, retired, invalid.
30. **Multiple scopes:** supported by repeating the same design in separate
    isolated profiles; none are created now.
31. **Future three scopes:** bootstrap one fixture per profile, verify exact
    scope, then explicitly map each to a Campaign promotion scope.
32. **Suppression coverage:** natural bounded semantic scenarios across later
    ordinary turns; never hardcoded candidates.
33. **Prompt hacks:** none.
34. **Provider cost:** roughly 50+1 or 10+1 logical requests to first trigger;
    physical retry/fallback attempts are reported, not induced.
35. **Reset:** retire/discard only the isolated fixture profile after a safety or
    integrity failure; never alter authoritative Campaign evidence or user data.
36. **Continue after archive:** yes, after marker/readback verification and a
    new governed Window for the next trigger.
37. **Background Moments routing debt:** unchanged.
38. **Production code changed:** no in this design stage.
39. **Dev-only code added:** no; a future manifest/inspector is only proposed.
40. **Tests added:** none in this design-only stage.
41. **Provider requests:** 0.
42. **Messages sent:** 0.
43. **Memory extraction:** 0.
44. **Campaign changed:** no; current campaign remains paused and authoritative
    artifacts are untouched.
45. **`docs/79`:** this design document only.
46. **Readiness:** `DEDICATED_EVIDENCE_FIXTURE_DESIGN_READY`.
47. **Next recommendation:** separately approve Stage 4D-11O-R4 for exactly one
    bootstrap, then stop before accumulation.
48. **Starting HEAD:** `f5bbd1e3a6702c8d12af4612cc574ad7e492865e`.
49. **Final HEAD:** the single documentation commit recorded by the stage
    report; the stable original remains `f515f7408cfe19da145f15a8ddffceae06e608d`.
50. **Commits:** one single-purpose documentation commit; no code or test
    commit.
51. **Worktree:** must be clean after that documentation commit; original
    repository remains clean and unchanged.

## 17. Verification boundary

Because this stage adds documentation only, it performs no Provider or browser
runtime action and does not claim new test evidence. The last verified refactor
baseline remains `588/588` tests passed, lint passed, build passed, and the
dependency gate reported 105 allowlisted boundary edges and 3 baseline cycles.
Those checks are cited as the inherited baseline, not as evidence that a
fixture has been bootstrapped.

