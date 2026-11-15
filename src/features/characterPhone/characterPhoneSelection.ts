import type { Character, UserIdentity } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { getRootIdentityId } from "../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../domain/character/characterIdentity";

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
 * Returns canonical character IDs that are explicitly connected to the
 * current identity workspace. A relationship is an intentional sharing
 * decision: it can make a character selectable even when the archive profile
 * was originally created under a different primary identity.
 */
export function listIdentityWorkspaceCharacterIds(
  characters: readonly Character[],
  ownerIdentityId: string,
  identities: readonly UserIdentity[] = [],
  relationships: readonly CharacterRelationship[] = [],
): Set<string> {
  const ownerRootId = getRootIdentityId(ownerIdentityId, identities);
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const relatedIds = new Set<string>();
  relationships.forEach((relationship) => {
    if (getRootIdentityId(relationship.userIdentityId, identities) !== ownerRootId) return;
    const canonicalId = resolveCanonicalCharacterId(relationship.characterId, characters);
    const character = characterById.get(canonicalId);
    if (!character || character.isContactInstance || character.isGroupChat || isRelationshipNetworkCharacter(character)) return;
    relatedIds.add(canonicalId);
  });
  return relatedIds;
}

/**
 * Lists archive characters visible to one identity workspace. Explicit
 * relationships are the allow-list for shared characters; ownership still
 * admits profiles created directly in this workspace.
 */
export function listIdentityWorkspaceCharacters(
  characters: readonly Character[],
  ownerIdentityId: string,
  identities: readonly UserIdentity[] = [],
  relationships: readonly CharacterRelationship[] = [],
): Character[] {
  const ownerRootId = getRootIdentityId(ownerIdentityId, identities);
  const relatedIds = listIdentityWorkspaceCharacterIds(characters, ownerIdentityId, identities, relationships);
  return characters.filter((character) => {
    if (character.isContactInstance || character.isGroupChat || isRelationshipNetworkCharacter(character)) return false;
    const canonicalId = resolveCanonicalCharacterId(character.id, characters);
    if (relatedIds.has(canonicalId)) return true;
    if (!character.ownerIdentityId) return false;
    return getRootIdentityId(character.ownerIdentityId, identities) === ownerRootId;
  });
}

/**
 * Characters available to the role-phone unlock picker. Contact-instance
 * copies and group chats are not standalone roles. A character explicitly
 * added to the current identity's address book is also selectable, even when
 * its archive profile was originally created under another primary identity.
 * Same-name roles remain distinct because stable character IDs, never names,
 * define identity.
 * Legacy phone scopes are only a compatibility signal for ownerless records;
 * an explicitly owned character can cross an identity-root boundary only when
 * the current workspace has an explicit relationship to it.
 */
export function listCharacterPhoneSelectableCharacters(
  characters: readonly Character[],
  ownerIdentityId: string,
  identities: readonly UserIdentity[] = [],
  legacyCharacterIds: readonly string[] = [],
  legacyCharacterScopes: ReadonlyMap<string, readonly string[]> = new Map(),
  relatedCharacterIds: readonly string[] = [],
): Character[] {
  const ownerRootId = getRootIdentityId(ownerIdentityId, identities);
  const legacyIds = new Set(legacyCharacterIds);
  const relatedIds = new Set(relatedCharacterIds);
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
      if (characterOwnerRootId !== ownerRootId && !relatedIds.has(character.id)) return;
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
