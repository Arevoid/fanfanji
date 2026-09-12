# Early Daily-Use Baseline

Status: **REAL USER BACKUP ACCEPTED — EARLY BASELINE READY FOR DAILY USE**  
Recorded: 2026-09-12  
Scope: documentation-only freeze; no product-behavior change.

## Frozen metadata

```text
EARLY_DAILY_USE_BASELINE_HEAD = a7e919e2778ae419faca8a1be088be5d1ca174d1
REAL_USER_BACKUP_ACCEPTED = true
EARLY_BASELINE_READY_FOR_DAILY_USE = true
FIRST_USABLE_BASELINE_REACHED = false
ADMISSION_V2_PROMOTED = false
```

The frozen daily-use anchor is `a7e919e2778ae419faca8a1be088be5d1ca174d1`.
The original stable insurance anchor remains
`f515f7408cfe19da145f15a8ddffceae06e608d`.

## Environment and backup boundary

- Runtime acceptance used Edge headless with a CDP fallback on an isolated restored profile.
- The original user backup was left unchanged and the original repository was not modified.
- Backup format: `fanfanji-system-backup` v3; 70 localStorage keys and 7 IndexedDB modules.
- Restored inventory: 19 Characters, 18 Relations, 17 Conversations, 49 Memory records,
  78 Knowledge records, 6 Summary records, and 6 Character Phone records.
- No private message, diary, memory, API key, authorization header, or other secret content is
  reproduced in this document.

## Accepted runtime surface

Real Direct Chat completed successfully on the isolated profile:

- logical requests: 1
- physical provider requests: 1
- persistence across reload: PASS
- cross-character scope/isolation: PASS
- Memory scope: PASS
- Summary scope: PASS
- Relation scope: PASS
- Character Phone ownership: PASS

Application smoke results:

| Surface | Result |
| --- | --- |
| Offline | PASS |
| Diary | PASS |
| Moments (through the existing Forum/Phone surfaces) | PASS |
| Character Phone | PASS |
| Reading | PASS |
| Forum | PASS |
| Settings | PASS |
| Browser | N/A — phone remained locked; no password was entered |

Normal UI re-export also passed. The re-export retained the restored inventory; unexplained
loss = 0, unexplained duplicate = 0, and cross-character leakage = 0.

## Provider limitation record

- Restored preferred model: `【仿生玫瑰】gemini-2.5-pro`.
- Current accepted working model: `【仿生玫瑰】gemini-2.5-flash`.
- The Pro model returned an upstream 504/timeout during acceptance.
- Classification: **KNOWN EXTERNAL NON-BLOCKING LIMITATION**.
- This baseline does not alter the original backup or hardcode Flash. The model can be switched
  back in the existing Settings UI when the upstream service is healthy.

## Memory and Admission state

Current production Memory remains on the existing legacy-compatible path with canonical
Truth/Knowledge retrieval, exact scope, Summary projection, and cursor/replay protection.
Admission V2 remains paused, shadow/dev-gated, and **not promoted**; it is not collecting real
daily chats.

The independent Admission campaign currently records:

```text
sessions = 4
scopes = 3
automatic batches = 4
valid suppressions = 0
evidence days = 3
promotionEligible = false
```

The FIRST baseline requirements remain sessions >= 5, scopes >= 3, automatic batches >= 20,
valid suppressions >= 10, and evidence on >= 7 real calendar days. No real daily-use chats are
to be added to that campaign.

`FIRST_USABLE_BASELINE_REACHED` therefore remains `false`.

## Preservation rules for future work

Future changes must use `EARLY_DAILY_USE_BASELINE_HEAD` as the non-breaking baseline and preserve
restore behavior, Direct Chat persistence, identity, Memory scope, Summary, Relation, Phone
ownership, no duplicate requests, and no unexplained loss. Do not promote Admission or change
Memory semantics, Prompt, Provider routing, AppChat structure, Offline, Emotion, Topic,
Character Life, Relationship Growth, Cross-App Life, God Component, or dead-code policy as part
of this freeze.

Never commit the real backup, real chats, Diary/Memory contents, or synthetic evidence. Do not
send real data to a Provider. Convert any real-data defect into a minimal synthetic fixture.
The real backup acceptance need not be repeated for every ordinary commit; repeat it for a
migration, replacement, or other operation that could alter the restored data boundary.

## Rollback anchors

- Daily-use refactor anchor: `a7e919e2778ae419faca8a1be088be5d1ca174d1`.
- Recent compatibility fix: `a7e919e` — `fix: restore browser lz-string runtime compatibility`.
- Original stable insurance: `f515f7408cfe19da145f15a8ddffceae06e608d`.

The documentation freeze can be reverted with `git revert <freeze-commit>`, returning the
refactor worktree to the `a7e919e` code baseline. The original repository remains the separate
stable insurance copy.

## Validation record

This freeze changes documentation only. `git diff --check` passed before commit. The current
code baseline had already passed:

- `npm run lint`
- `npm test`: 604/604 passed
- `npm run build`
- dependency gate: 105 allowlisted boundary edges / 3 cycle baselines

No code gate was rerun for this documentation-only change. The freeze is one logical commit;
the worktree must remain clean after commit.
