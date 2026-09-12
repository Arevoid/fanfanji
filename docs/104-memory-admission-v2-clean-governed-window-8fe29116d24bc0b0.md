# Memory Admission V2 — Clean Governed Runtime Window

Stage: Fast-Track R3D retry (dedicated synthetic Direct Chat)
Date: 2026-09-12

Fast-Track starting refactor HEAD: `75138799f0e8acf4489e03760b2b2117dc38e62f`  
Runtime evidence was executed on the repaired code at `a4335696359fe228541fdc8e6de308549227b7bc`.  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`

## Scope and safety boundary

The run used the existing isolated synthetic `stage4d11o-dedicated-direct`
profile and its already-created exact Character/Relation/Conversation scope.
No identity, Character, Relation, Conversation, marker, cursor, Memory record,
or real-user profile was reset or recreated. No user backup was read. The
previous incident window `window-24005504519b5e62` and the earlier collector-gap
window remain unchanged and non-authoritative.

Only the active synthetic identity in the isolated browser profile was selected
so the existing dedicated conversation could be opened. No credential value,
Authorization header, Prompt, message body, or Provider response body was
captured or persisted in the evidence.

## Governed runtime sequence

The fresh developer-held Window was `window-8fe29116d24bc0b0` with session
`session-1f228e454b4670af`. The raw Window token stayed in page memory and was
not exported. The fixture began with an exact-scope health check and 0 pending
eligible messages. Nine ordinary low-risk synthetic turns accumulated the
unchanged production threshold to `eligibleMessageCount=18` and
`distanceToTrigger=2`; the tenth ordinary turn was the only trigger turn.

Every Direct Reply delivered one assistant bubble, returned the composer to
idle, and durably read back the new messages. No duplicate user/assistant
message, retry, fallback, stuck state, or unrelated Provider activity was
observed.

The automatic extraction path then completed one logical extraction action with
one physical Provider attempt. The formal Collector recorded five candidate
observations from one batch. All five were `VALID_CONTROL` with:

```text
correlationClass = shared_unique
lineageStatus = shared
pairUnique = true
exactScope = true
provenanceTrusted = true
metadataSource = v2_model_native
legacyAccepted = true
legacyWriteEligible = true
candidateSuppressed = false
v2OnlyWrite = false
failOpen = false
privacyStatus = metadata_only
```

The batch advanced the existing cursor and produced five expected canonical
writes. No V2-only write, cursor loop, replay loop, accounting conflict, or
privacy violation occurred. Safety-veto Canary authority remained disabled;
the Safety-veto Shadow was observation-only.

## Evidence and reviewer result

The sanitized artifact is:

`docs/evidence/memory-admission-v2/window-8fe29116d24bc0b0/2026-09-12__session-1f228e454b4670af.json`

Its closure manifest is:

`docs/evidence/memory-admission-v2/window-8fe29116d24bc0b0/window-closure.json`

The Level-1 reviewer returned `status=ok` with:

```text
rawRecordCount = 5
formalSessionCount = 1
distinctExactScopeCount = 1
extractionBatchCount = 1
validControlCount = 5
validSuppressionCount = 0
safetyIncidentCount = 0
privacyViolationCount = 0
accountingConflictCount = 0
logicalActionTotal = 1
physicalAttemptTotal = 1
authoritativeArtifactCount = 1
```

The Window was closed intentionally after export. Its evidence is suitable for
review of the repaired bridge/runtime path, but it has not been added to the
paused Campaign manifest. Campaign promotion counters therefore remain
unchanged and this run does not claim multi-scope, suppression, or promotion
readiness.

## Readiness and remaining blockers

The repaired single-scope runtime path now satisfies the clean R3D chain:

```text
Direct Chat → durable persistence → automatic extraction → accounting
→ shadow/observer → Collector → sanitized artifact → reviewer → closure
```

The campaign-level readiness target is not reached. Existing authoritative
campaign evidence still has 2 formal sessions, 1 promotion scope, 2 batches,
0 suppressions, and 2 distinct UTC evidence days. The remaining requirements
(at least 3 scopes, 5 sessions, 20 batches, 10 valid suppressions, and 7 real
calendar days) must be accumulated only through separately governed, naturally
occurring synthetic runtime evidence. No calendar dates or candidate outcomes
were fabricated here, and `FIRST USABLE BASELINE` has not been reached.
