import type { MemoryItem, Message, OfflineStory } from "../../types";
import type { CharacterRelationship } from "./characterRelationship";
import { DEFAULT_IDENTITY_ID } from "./characterRelationship";
import { isLegacyDirectOfflineStory } from "./offlineStoryScope";

export interface RelationshipScopedData {
  relationships: readonly CharacterRelationship[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  offlineStories: readonly OfflineStory[];
}

export function removeRelationshipData(data: RelationshipScopedData, relationIds: readonly string[]): RelationshipScopedData {
  const removed = new Set(relationIds);
  const removedRelationships = data.relationships.filter((relation) => removed.has(relation.id));
  const removedCharacterIds = new Set(removedRelationships.map((relation) => relation.characterId));
  const removedLegacyDirectCharacterIds = new Set(
    removedRelationships
      .filter((relation) => relation.userIdentityId === DEFAULT_IDENTITY_ID)
      .map((relation) => relation.characterId),
  );
  const cleanGroupStoryReferences = (story: OfflineStory, characterIds: ReadonlySet<string>): OfflineStory => {
    if (story.relationId || isLegacyDirectOfflineStory(story) || !story.characterIds?.length) return story;
    const nextCharacterIds = story.characterIds.filter((characterId) => !characterIds.has(characterId));
    return nextCharacterIds.length === story.characterIds.length ? story : { ...story, characterIds: nextCharacterIds };
  };
  return {
    relationships: data.relationships.filter((relation) => !removed.has(relation.id)),
    messages: data.messages.filter((message) => !removed.has(message.relationId || "")),
    memories: data.memories.filter((memory) => !removed.has(memory.relationId || "")),
    offlineStories: data.offlineStories
      // Legacy direct records had no relationId. They historically belonged
      // to the primary identity, so only deleting that identity's relation
      // may remove them. Other identities must not lose their legacy data.
      .filter((story) => !removed.has(story.relationId || "")
        && !(isLegacyDirectOfflineStory(story) && removedLegacyDirectCharacterIds.has(story.characterId)))
      // Group stories remain historical containers, but no longer retain a
      // participant reference whose direct relation was deleted.
      .map((story) => cleanGroupStoryReferences(story, removedCharacterIds)),
  };
}

/** Removes every relationship-owned record of a canonical character. Callers
 * may include legacy contact-copy IDs that resolve to the same archive
 * profile. Group records remain untouched. */
export function removeCanonicalCharacterData(
  data: RelationshipScopedData,
  characterId: string,
  legacyCharacterIds: readonly string[] = [],
): RelationshipScopedData {
  const characterIds = new Set([characterId, ...legacyCharacterIds]);
  const relationIds = data.relationships
    .filter((relationship) => characterIds.has(relationship.characterId))
    .map((relationship) => relationship.id);
  const scoped = removeRelationshipData(data, relationIds);
  const cleanGroupStoryReferences = (story: OfflineStory): OfflineStory => {
    if (story.relationId || isLegacyDirectOfflineStory(story) || !story.characterIds?.length) return story;
    const nextCharacterIds = story.characterIds.filter((id) => !characterIds.has(id));
    return nextCharacterIds.length === story.characterIds.length ? story : { ...story, characterIds: nextCharacterIds };
  };
  return {
    relationships: scoped.relationships,
    messages: scoped.messages.filter((message) => !characterIds.has(message.characterId)),
    memories: scoped.memories.filter((memory) => !characterIds.has(memory.characterId)),
    offlineStories: scoped.offlineStories
      .filter((story) => !characterIds.has(story.characterId))
      .map(cleanGroupStoryReferences),
  };
}
