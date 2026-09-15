# fanfanji V2 Production Release Record

Release date: 2026-09-15 (Asia/Shanghai)

## Release identity

- Product source anchor: `ffa4b472e4c36a75bffcb961950bef95767db4e8`
- Source branch: `refactor/v2-architecture`
- Release branch: `release/v2-final`
- Release tag: `fanfanji-v2-2026-09-15` (points to the product source anchor)
- Release record is documentation-only and does not change product source behavior.
- Main was not merged, reset, or deployed from the dirty user worktree.

## Preflight and test evidence

- Full test suite: 626/626 passed.
- Lint, install check, production build, release check, and smoke check: passed.
- Dependency-direction gate: 105 allowlisted boundary edges, 3 cycles, no increase.
- Security governance checks: passed.
- `npm audit --omit=dev --audit-level=high` reports known pre-existing debt (1 high, 3 moderate); no dependency upgrade was made in this release.
- Release bundle privacy scan: no API-key literals, bearer tokens, or secret-bearing files.
- Product source was clean at the release anchor before the generated build output step.

## Admission state

The authoritative governed state at the release anchor is:

```text
policy = memory-admission-v2-promotion-2
artifacts = 17
sessions = 16
scopes = 4
automatic batches = 20
controls = 14
valid suppressions = 10
evidence days = 5
incidents = 0/0/0
promotionEligible = true
promoted = true
safetyVetoEnabled = true
rollbackAvailable = true
manifestSnapshotMatchesDerived = true
thresholdProgressMatchesDerived = true
```

Temporary Preference remains shadow-only. No Provider request was made during release verification.

## Production deployment

- URL: `https://fanfanji.3067396832.workers.dev`
- Cloudflare deployment: passed.
- Active Cloudflare Version ID: `0b3aa1c3-f4ff-4d86-a9ca-4849a76bf37f`
- Deployment timestamp: `2026-09-15T11:31:55.145Z`
- Previous rollback anchor: `71d43cf2-6d74-463d-bd63-c14da3dff8ef`
- Production release manifest reports source commit `ffa4b47`, mapped to the full source anchor above.
- Root, release manifest, and Service Worker all returned HTTP 200.
- All eight root asset references returned HTTP 200.
- Served Service Worker cache name matches the production release manifest.
- Normal reload and cache-cleared hard reload restored the application shell.

## Post-deploy UI and data-safety checks

- Synthetic-only production browser state was used; no real backup, chat, diary, memory, or user profile data was loaded.
- Settings, Provider Settings form, Chat, Contacts, Archive, Offline story list, Offline story creation, and Character Phone entry were reachable in the isolated browser.
- A synthetic character/contact/story was created only in the temporary acceptance profile; no message or Provider request was sent.
- Offline source/runtime regression coverage passed for resume/new-story identity and non-blocking exit. The production story editor/list was directly exercised; no pending story was entered, so the in-chat resume-choice modal was not forced.
- Browser scope, IndexedDB persistence, friendly blocked-HTML handling, same-name isolation, memory scope isolation, and backup compatibility regression tests passed. The Browser sub-app itself was not opened through the Character Phone passcode gate; no passcode was bypassed.
- `OFFLINE_EXIT_BLOCKED_BY_HEAVY_MEMORY = false`.

## User worktree protection

- The original user worktree's four unrelated API/settings changes were not staged, copied, reset, cleaned, or included in this release.
- No credential, Authorization header, raw Provider payload, private prompt, or user data was read, persisted, logged, or included in this record.
- No source refactor, dependency upgrade, migration, merge, or deploy outside this release was performed.

## Rollback and follow-up

- Existing governed rollback path remains available through `rollbackMemoryAdmissionV2` and the previous Cloudflare Version ID above.
- Release branch and tag are the only pushed release refs; `main` was not updated.
- Continue normal governed post-promotion observation for the remaining evidence calendar; this record does not fabricate evidence days or alter counters.
