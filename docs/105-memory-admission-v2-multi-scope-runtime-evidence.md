# Memory Admission V2 — Multi-scope Runtime Evidence (2026-09-12)

This document records the first bounded multi-scope run after the clean R3D
window. It contains only reviewer-safe metadata; chat text, prompts, model
responses, credentials, and raw provider bodies are deliberately absent.

## Runtime boundary

- Starting refactor baseline for this run: `7cdc24749d6fe6b24170a575e60987bd7c6c3552`.
- The isolated Vite app ran at `http://127.0.0.2:3000` with the user-provided
  Provider configured in that isolated profile. No original profile or backup
  was opened.
- The dev-only multi-scope bootstrap created three independent synthetic
  identities, canonical characters, relations, and conversations. It delegates
  persistence to the existing ownership/relation seams; it does not insert
  messages or memory records directly.
- Scope fingerprints were stable and distinct: `scope-e24bf8ec` (A),
  `scope-73b00a12` (B), and `scope-9675ed17` (C). Character/relation/
  conversation IDs were also distinct in the bootstrap readback.
- Reviewer-safe bootstrap fingerprints were: A = identity
  `1470191a57ab78b0`, character `364ea0dedd5c0404`, relation
  `5feb0aaf32f71a04`, conversation `792b46dc41ef46f1`; B = identity
  `51b9c309685699f6`, character `8bef89ed0d1f6e3e`, relation
  `d82914f2b199df25`, conversation `5c5a1703ee3d256f`; C = identity
  `c56d9679d29b6e86`, character `5085a81c199757a8`, relation
  `a54fb92aabbf9b54`, conversation `ffdd0a0fcd80ad5e`.
- The pre-inspector for A/B/C reported `exactScope=true`, `triggerCount=20`,
  `eligibleMessageCount=0`, `distanceToTrigger=20`, and no archive marker.

## Formal windows and artifacts

| Window | Fixture | Direct turns in the window | Result | Artifact |
| --- | --- | ---: | --- | --- |
| `window-a61899010f0bd27f` | A | 10 | 1 `ZERO_CANDIDATE_BATCH` | `docs/evidence/memory-admission-v2/window-a61899010f0bd27f/2026-09-12__session-0bb6d746b5656d60.json` |
| `window-b35d2518e274284a` | B | 10 | 2 `INVALID_SAMPLE` records | `docs/evidence/memory-admission-v2/window-b35d2518e274284a/2026-09-12__session-ed440b6afce514f8.json` |
| `window-70e757c23c675e44` | C | 10 | 1 `ZERO_CANDIDATE_BATCH` | `docs/evidence/memory-admission-v2/window-70e757c23c675e44/2026-09-12__session-1b48d1a3e1332271.json` |

All three artifacts pass the long-evidence parser. A and C are valid formal
zero-candidate observations with `providerLogicalRequestCount=1`,
`providerPhysicalAttemptCount=1`, `privacyStatus=metadata_only`, and zero
canonical writes. B is retained as a failed observation: one record has
`provenanceTrusted=false` and `correlationClass=shared_non_unique`; the second
has `exactScope=false`, missing lineage, and `pairUnique=false`. B therefore
contributes no authoritative session, scope, batch, control, or suppression
count. Its closure is preserved and it has no promotion mapping.

No `extractNow()`, manual extraction, raw insertion, threshold change,
Shadow/Canary manipulation, or campaign-token reuse occurred. A/C zero
candidate records are expected automatic outcomes, not controls or
suppression evidence.

## Isolation conclusion

The bootstrap readback proves independent identity, canonical character,
relation, and conversation fingerprints. The A/C formal records each carry a
different exact scope and no canonical write; B's invalid records are not
used to infer isolation. No cross-scope retrieval or marker/cursor mutation was
observed in this bounded run. The pre-existing clean R3D window
`window-8fe29116d24bc0b0` and the historical accident window
`window-24005504519b5e62` remain untouched.

## Campaign recompute

The campaign manifest now explicitly approves and closes the three new windows,
maps only A and C to new promotion scopes, and remains paused. The reviewer
reports:

```text
authoritative artifacts = 5
formal sessions         = 4
distinct exact scopes   = 3
automatic batches       = 4
valid controls          = 2
valid suppressions      = 0
zero-candidate batches  = 2
evidence days           = 3 (2026-09-10..2026-09-12)
safety/privacy/accounting= 0/0/0
promotionEligible       = false
```

The remaining numeric requirements are sessions (1), batches (16), and valid
suppressions (10); four additional real calendar days are also required. No
date was synthesized. The campaign is not a First Usable Baseline and no
production admission cutover is enabled.
