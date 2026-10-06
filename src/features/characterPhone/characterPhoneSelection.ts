import type { Character, UserIdentity } from "../../types";
import { getRootIdentityId } from "../../domain/relationship/characterRelationship";

/**
 * Characters available to the role-phone unlock picker. Contact-instance
 * copies and group chats are not standalone roles; canonical characters are
 * scoped to the phone owner's primary identity workspace. Same-name roles
 * remain distinct because stable character IDs, never names, define identity.
 * Legacy phone scopes are only a compatibility signal for ownerless records;
 * an explicitly owned character can never cross an identity-root boundary.
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
    if (character.isContactInstance || character.isGroupChat || character.relationshipNetworkNpcId) return;
    if (character.ownerIdentityId) {
      const characterOwnerRootId = getRootIdentityId(character.ownerIdentityId, identities);
      if (characterOwnerRootId !== ownerRootId) return;
    } else if (!legacyIds.has(character.id)) {
      // Ownerless records are legacy data. They are only admitted when a
      // phone record in this exact workspace still proves their scope.
      return;
    }
    if (byId.has(character.id)) return;
    byId.set(character.id, character);
  });
  return [...byId.values()];
}
