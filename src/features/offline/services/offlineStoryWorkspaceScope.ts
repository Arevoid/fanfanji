import type { Character, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId, resolveOfflineStoryCharacterIds } from "../../../domain/character/characterIdentity";

export function isGroupOfflineStory(story: OfflineStory, characters: readonly Character[]): boolean {
  const owner = characters.find((character) => character.id === story.characterId);
  const participantIds = resolveOfflineStoryCharacterIds(story, characters);
  return Boolean(
    owner?.isGroupChat
    || participantIds.length > 1,
  );
}

/**
 * Returns the character buckets in which a story belongs in the directory.
 *
 * A multi-character story may retain a historical `characterId` that was only
 * used as its container key. That key must not make the story appear under an
 * unrelated ordinary character. A real group-chat container remains a valid
 * directory bucket for backwards compatibility; otherwise only participants
 * are buckets.
 */
export function resolveOfflineStoryDirectoryCharacterIds(
  story: OfflineStory,
  characters: readonly Character[],
): string[] {
  const participantIds = resolveOfflineStoryCharacterIds(story, characters);
  if (!isGroupOfflineStory(story, characters)) {
    return [resolveCanonicalCharacterId(story.characterId, characters)];
  }
  const owner = characters.find((character) => character.id === story.characterId);
  const ownerId = owner?.isGroupChat
    ? resolveCanonicalCharacterId(owner.id, characters)
    : undefined;
  return Array.from(new Set([...(ownerId ? [ownerId] : []), ...participantIds]));
}

export function resolveOfflineRelationChoices(
  relationships: readonly CharacterRelationship[],
  selectedCharacterId: string,
  activeIdentityId: string,
): CharacterRelationship[] {
  return Array.from(new Map(
    relationships
      .filter((relation) => relation.characterId === selectedCharacterId && relation.userIdentityId === activeIdentityId)
      .map((relation) => [`${relation.userIdentityId}\u0000${relation.characterId}`, relation]),
  ).values());
}

export function canAccessOfflineStoryFromCurrentRelation({
  story,
  characters,
  selectedRelationId,
  relationChoices,
  activeIdentityId,
}: {
  story: OfflineStory;
  characters: readonly Character[];
  selectedRelationId: string;
  relationChoices: readonly CharacterRelationship[];
  activeIdentityId: string;
}): boolean {
  const storyCharacter = characters.find((character) => character.id === story.characterId);
  const belongsToActiveIdentity = (ownerIdentityId?: string) =>
    (ownerIdentityId || "identity-1") === activeIdentityId;

  // Group stories are owned by a group container or a multi-character story
  // created directly from the character picker. They intentionally have no
  // direct relationship, but still belong to the active identity.
  if (isGroupOfflineStory(story, characters)) {
    return Boolean(storyCharacter && belongsToActiveIdentity(story.ownerIdentityId || storyCharacter.ownerIdentityId));
  }

  // Every direct story must be owned by the selected current relation. A
  // missing relationId is legacy direct data and is not opened cross-identity.
  return Boolean(
    story.relationId
    && (!story.ownerIdentityId || belongsToActiveIdentity(story.ownerIdentityId))
    && story.relationId === selectedRelationId
    && relationChoices.some((relation) => relation.id === story.relationId),
  );
}
