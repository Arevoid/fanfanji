import type { MemoryItem, Message, OfflineStory } from "../../types";
import type { CharacterRelationship } from "./characterRelationship";

export interface RelationshipScopedData {
  relationships: readonly CharacterRelationship[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  offlineStories: readonly OfflineStory[];
}

export function removeRelationshipData(data: RelationshipScopedData, relationIds: readonly string[]): RelationshipScopedData {
  const removed = new Set(relationIds);
  return {
    relationships: data.relationships.filter((relation) => !removed.has(relation.id)),
    messages: data.messages.filter((message) => !removed.has(message.relationId || "")),
    memories: data.memories.filter((memory) => !removed.has(memory.relationId || "")),
    offlineStories: data.offlineStories.filter((story) => !removed.has(story.relationId || "")),
  };
}

/** Removes every relationship-owned record of a canonical character. Legacy
 * character-keyed records are removed too, while groups remain untouched. */
export function removeCanonicalCharacterData(data: RelationshipScopedData, characterId: string): RelationshipScopedData {
  const relationIds = data.relationships
    .filter((relationship) => relationship.characterId === characterId)
    .map((relationship) => relationship.id);
  const scoped = removeRelationshipData(data, relationIds);
  return {
    relationships: scoped.relationships,
    messages: scoped.messages.filter((message) => message.characterId !== characterId),
    memories: scoped.memories.filter((memory) => memory.characterId !== characterId),
    offlineStories: scoped.offlineStories.filter((story) => story.characterId !== characterId),
  };
}
