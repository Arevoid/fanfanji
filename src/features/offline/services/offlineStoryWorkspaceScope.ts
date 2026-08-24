import type { Character, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";

export function isGroupOfflineStory(story: OfflineStory, characters: readonly Character[]): boolean {
  const owner = characters.find((character) => character.id === story.characterId);
  return Boolean(
    owner?.isGroupChat
    || (!story.relationId && (story.characterIds?.length || 0) > 1),
  );
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
    return Boolean(storyCharacter && belongsToActiveIdentity(storyCharacter.ownerIdentityId));
  }

  // Every direct story must be owned by the selected current relation. A
  // missing relationId is legacy direct data and is not opened cross-identity.
  return Boolean(
    story.relationId
    && story.relationId === selectedRelationId
    && relationChoices.some((relation) => relation.id === story.relationId),
  );
}
