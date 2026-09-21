import type { Character, UserIdentity } from "../../types";
import {
  getRootIdentityId,
  type CharacterRelationship,
} from "../../domain/relationship/characterRelationship";
import type { CharacterPhoneRecord } from "../../domain/characterPhone/types";

export interface CharacterPhoneOwnershipRepairInput {
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  phones: readonly Pick<CharacterPhoneRecord, "characterId" | "ownerIdentityId">[];
  identities: readonly UserIdentity[];
}

export interface CharacterPhoneOwnershipRepairResult {
  characters: Character[];
  changed: boolean;
  repairedCharacterIds: string[];
}

/**
 * Restores only unambiguous legacy character ownership. A character that has
 * evidence from more than one identity is intentionally left ownerless: its
 * existing phone scopes remain the source of truth for that identity, and the
 * picker can still expose it through those scopes. This avoids silently
 * moving shared characters between personas.
 */
export function repairLegacyCharacterPhoneOwnership(
  input: CharacterPhoneOwnershipRepairInput,
): CharacterPhoneOwnershipRepairResult {
  const scopesByCharacter = new Map<string, Set<string>>();
  const addEvidence = (characterId: string, ownerIdentityId: string) => {
    if (!characterId || !ownerIdentityId) return;
    const scope = getRootIdentityId(ownerIdentityId, input.identities);
    const scopes = scopesByCharacter.get(characterId) || new Set<string>();
    scopes.add(scope);
    scopesByCharacter.set(characterId, scopes);
  };

  input.relationships.forEach((relationship) => {
    if (relationship.characterId) addEvidence(relationship.characterId, relationship.userIdentityId);
  });
  input.phones.forEach((phone) => addEvidence(phone.characterId, phone.ownerIdentityId));

  const repairedCharacterIds: string[] = [];
  const characters = input.characters.map((character) => {
    if (character.ownerIdentityId || character.isContactInstance || character.isGroupChat) return character;
    const scopes = scopesByCharacter.get(character.id);
    if (!scopes || scopes.size !== 1) return character;
    const [ownerIdentityId] = [...scopes];
    repairedCharacterIds.push(character.id);
    return { ...character, ownerIdentityId };
  });

  return {
    characters,
    changed: repairedCharacterIds.length > 0,
    repairedCharacterIds,
  };
}
