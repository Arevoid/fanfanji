import type { Character, OfflineStory } from "../../types";
import { resolveCanonicalCharacterId, resolveOfflineStoryCharacterIds } from "../character/characterIdentity";
import { DEFAULT_IDENTITY_ID, type CharacterRelationship } from "./characterRelationship";

/**
 * Legacy direct stories predate relationId. They are only recoverable through
 * the historical primary identity; group containers remain relation-less.
 */
export function resolveOfflineStoryRelationId(
  story: OfflineStory,
  relationships: readonly CharacterRelationship[],
  characters: readonly Character[],
  legacyIdentityId = DEFAULT_IDENTITY_ID,
): string | undefined {
  if (story.relationId) return story.relationId;
  if (characters.find((character) => character.id === story.characterId)?.isGroupChat) return undefined;

  const canonicalCharacterId = resolveCanonicalCharacterId(story.characterId, characters);
  return relationships.find((relation) =>
    relation.userIdentityId === legacyIdentityId
    && resolveCanonicalCharacterId(relation.characterId, characters) === canonicalCharacterId,
  )?.id;
}

/**
 * A relation-less story with one character reference is the legacy direct
 * shape. Group and future multi-participant stories must not be treated as
 * direct legacy records during cleanup.
 */
export function isLegacyDirectOfflineStory(story: OfflineStory): boolean {
  if (story.relationId) return false;
  if (!story.characterIds || story.characterIds.length === 0) return true;
  return story.characterIds.length === 1 && story.characterIds[0] === story.characterId;
}

export function countOfflineStoriesForRelation(input: {
  stories: readonly OfflineStory[];
  relationId: string;
  characterId: string;
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  legacyIdentityId?: string;
}): number {
  return input.stories.filter((story) => {
    const storyRelationId = resolveOfflineStoryRelationId(
      story,
      input.relationships,
      input.characters,
      input.legacyIdentityId,
    );
    if (storyRelationId !== input.relationId) return false;
    return resolveOfflineStoryCharacterIds(story, input.characters).includes(input.characterId);
  }).length;
}
