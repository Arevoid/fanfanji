import type { Character, UserIdentity } from "../../types";
import { getRootIdentityId } from "../../domain/relationship/characterRelationship";

function isRelationshipNetworkCharacter(character: Character): boolean {
  if (character.relationshipNetworkNpcId) return true;
  // Older relationship-network links were persisted as ordinary Character
  // rows before the stable NPC marker was added. Keep those legacy rows out
  // of the role-phone unlock picker as well.
  if (character.remark?.trim() === "来自关系网的 NPC") return true;
  if (character.backstory.trimStart().startsWith("【关系网 NPC 档案】")) return true;
  return character.personality.includes("从关系网档案创建的角色");
}

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
  legacyCharacterScopes: ReadonlyMap<string, readonly string[]> = new Map(),
): Character[] {
  const ownerRootId = getRootIdentityId(ownerIdentityId, identities);
  const legacyIds = new Set(legacyCharacterIds);
  const scopedLegacyIds = new Set(
    [...legacyCharacterScopes.entries()]
      .filter(([, scopes]) => {
        const uniqueScopes = new Set(scopes.map((scope) => getRootIdentityId(scope, identities)));
        return uniqueScopes.size === 1 && uniqueScopes.has(ownerRootId);
      })
      .map(([characterId]) => characterId),
  );
  const byId = new Map<string, Character>();
  characters.forEach((character) => {
    if (character.isContactInstance || character.isGroupChat || isRelationshipNetworkCharacter(character)) return;
    if (character.ownerIdentityId) {
      const characterOwnerRootId = getRootIdentityId(character.ownerIdentityId, identities);
      if (characterOwnerRootId !== ownerRootId) return;
    } else if (!scopedLegacyIds.has(character.id) && !legacyIds.has(character.id)) {
      // Ownerless records are legacy data. They are only admitted when a
      // phone/relationship record in this workspace still proves their scope.
      // New callers should pass legacyCharacterScopes so an ambiguous record
      // shared by multiple independent identities is hidden from all pickers.
      return;
    }
    if (byId.has(character.id)) return;
    byId.set(character.id, character);
  });
  return [...byId.values()];
}
