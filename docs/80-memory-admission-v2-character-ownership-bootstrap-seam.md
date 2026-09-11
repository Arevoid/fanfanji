# Stage 4D-11O-R4A — Character Ownership Bootstrap Seam

Date: 2026-09-11  
Starting refactor HEAD: `1591f63576590bfc950ef28448f9d53a252cacd4`  
Stable original repository: `f515f7408cfe19da145f15a8ddffceae06e608d`  
Campaign: `campaign-memory-admission-v2-2026-09-10`

Readiness: `CHARACTER_OWNERSHIP_SEAM_IMPLEMENTED_LOCAL_VALIDATED`

This stage fixes only the missing general Character-creation ownership seam.
It does not bootstrap the dedicated fixture, create a Character/Relation,
send a message, call a Provider, run extraction, open a Window, or change the
Campaign. The previously created synthetic UserIdentity remains untouched in
its isolated browser partition.

## 1. Blocker and domain semantics

The R4 bootstrap audit found that the ordinary Archive creation form built a
valid `Character` but did not expose a way for a caller to supply the existing
optional `ownerIdentityId`. The Relationship Network path already supplied it,
but that path also creates an NPC link and a Relationship, so it is not a safe
Character-only bootstrap seam.

`Character.ownerIdentityId` is already part of the domain type and is documented
as the identity that owns the contact or group. It is not a relation id, not a
creator audit field, and not a request for the current UI tab. It remains
optional for legacy records; an unset value keeps the existing “legacy primary
identity” compatibility behavior. The new seam treats the value as an opaque,
canonical `UserIdentity.id` supplied explicitly by the caller. It never derives
ownership from an identity name, avatar, display name, relation name, tab or
persona. The seam cannot prove that an opaque id exists in a settings registry;
that exact identity check remains the responsibility of the caller/context.

## 2. Current flow audit

The audited production flow is:

```text
Archive form (AppArchives)
  → createCharacterFromInput (pure creation seam)
  → onSaveCharacter / App.handleSaveCharacter
  → saveCharacters + flushCharacters
  → IndexedDB character-archive-v4 (localStorage fallback before IDB)
  → load/initialize repository readback
```

`handleSaveCharacter(char: Character)` already accepts a complete Character,
merges an existing record without dropping fields, and passes it to the
repository. No separate owner parameter was needed to preserve the existing
callback contract: the explicit owner travels as a normal Character field.

The repository clones and persists the complete object. IndexedDB hydration and
the localStorage fallback use generic array readers; no Character sanitizer,
normalizer or migration currently strips `ownerIdentityId`.

## 3. Chosen seam and compatibility policy

`src/domain/character/characterCreation.ts` adds:

* `CharacterCreationInput`, which is the existing Character shape plus an
  optional `ownerIdentityId?: unknown` input;
* `normalizeCharacterOwnerIdentityId`, which trims a non-empty string and
  treats blank/non-string values as absent;
* `validateCharacterOwnershipInput`, a small pure validator returning
  `invalid_owner_identity_id` for malformed explicit input;
* `createCharacterFromInput`, a side-effect-free record builder.

The Archive form now constructs its record through this builder. This is
**Strategy A**: ordinary UI creation still omits ownership exactly as before,
because the product has not approved changing every legacy Character to the
currently active identity. A future dev bootstrap wrapper can explicitly pass
its canonical identity id through the same builder and the existing
`handleSaveCharacter` callback.

When an existing Character is edited, the current spread behavior is retained;
an existing explicit owner is carried forward. A newly created Character with
no owner has no owner field and remains backward-compatible. No old Character
is backfilled and no schema/migration is introduced.

## 4. Caller audit

| Category | Current callers and result |
| --- | --- |
| A — explicit owner | Relationship Network Character creation and AppChat group Character creation already pass a canonical `ownerIdentityId`; unchanged. |
| B — safe to pass later | The new pure creation seam and existing full-object `handleSaveCharacter` support an explicit owner without adding side effects. |
| C — legacy/no context | Ordinary Archive form creation intentionally remains ownerless under Strategy A. |
| D — special flow | Relationship Network creation remains its existing NPC + link + relation workflow; it was not refactored. |
| E — import/migration | Persona imports rebuild a portable profile and intentionally omit relation/ownership/runtime fields; no import or migration behavior changed. |

The normal “add friend” flow links an existing canonical Character and does not
create a second Character. Relationship Network hydration preserves its
explicit owner and remains unchanged.

## 5. Round-trip and side-effect proof

`scripts/characterOwnershipBootstrap.test.ts` covers:

1. explicit canonical owner input is accepted and preserved exactly;
2. editing preserves the explicit owner;
3. blank and non-string ownership is rejected by the validator and omitted by
   the builder;
4. omitted ownership remains a valid legacy-compatible Character;
5. `saveCharacters → flushCharacters → readingAssetDb.loadMetadataValue`
   round-trips the exact `ownerIdentityId`;
6. the pure seam does not write relationship, message, Memory, NPC or
   Relationship Network stores;
7. the ordinary Archive source uses the seam and does not infer an owner from
   active identity/UI data.

The test runs with `fake-indexeddb` and in-memory storage only. It creates no
fixture data, no relation, no conversation, no message and no Memory item.

## 6. Production and data impact

Production behavior is unchanged for ordinary new Archive records: no active
identity is silently inserted. The only new behavior is safe handling of an
explicit ownership input supplied by a future caller, plus trimming/rejecting
malformed values. Existing persisted Characters remain readable and are not
rewritten by this stage. Prompt, Provider, retry/fallback, Memory, relationship
semantics, storage keys/schema, UI layout and user data are untouched.

There is no fixture-specific flag, dev identity constant, repository injection,
or dependency from production Character code to dev tooling. The new module is
pure domain code and introduces no UI→storage or domain→feature dependency.

## 7. Verification and state

Targeted ownership, Archive import/export and Relationship Network tests passed.
The full suite passed with **589/589** test files. `npm run lint` passed and the
dependency gate remains **105 allowlisted boundary edges / 3 baseline cycles**.
The Campaign remains unchanged at `approved/closed=2/2`, `artifacts=2`,
`sessions=2`, `scopes=1`, `batches=2`, `controls=2`, `suppressions=0`,
`days=2`, `stickyFailure=false`, `promotionEligible=false`.

This stage performed no browser runtime action, Provider request, message send,
automatic extraction or Window operation. The dedicated fixture readiness is
now `CHARACTER_OWNERSHIP_SEAM_IMPLEMENTED_LOCAL_VALIDATED`; the next approved
step may retry the single normal bootstrap, and must still stop before any
accumulation, Provider request or Memory evidence collection.

## 8. Rollback

Revert the single implementation/test commit for this stage. The stable
original repository remains at `f515f7408cfe19da145f15a8ddffceae06e608d`, and
the isolated synthetic identity/profile is not modified by this stage.
