import type { Character, UserIdentity } from "../../types";
import { DEFAULT_IDENTITY_ID } from "../../domain/relationship/characterRelationship";
import { getRootIdentityId } from "../../domain/relationship/characterRelationship";

/**
 * Characters available to the role-phone unlock picker. Contact-instance
 * copies and group chats are not standalone roles; canonical characters are
 * scoped to the phone owner's primary identity workspace. Same-name roles
 * remain distinct because stable character IDs, never names, define identity.
 */
export function listCharacterPhoneSelectableCharacters(
  characters: readonly Character[],
  ownerIdentityId: string,
  identities: readonly UserIdentity[] = [],
  legacyCharacterIds: readonly string[] = [],
): Character[] {
  const ownerRootId = getRootIdentityId(ownerIdentityId, identities);
  const legacyIds = new Set(legacyCharacterIds);
  const byId = new Map<string, Character>();
  characters.forEach((character) => {
    if (character.isContactInstance || character.isGroupChat) return;
    const characterOwnerRootId = getRootIdentityId(character.ownerIdentityId || DEFAULT_IDENTITY_ID, identities);
    if (characterOwnerRootId !== ownerRootId && !legacyIds.has(character.id)) return;
    if (byId.has(character.id)) return;
    byId.set(character.id, character);
  });
  return [...byId.values()];
}
