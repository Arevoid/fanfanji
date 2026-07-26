import type { Character, MemoryItem, Message, OfflineStory } from "../../types";
import { getAvailableCanonicalCharacterIds, resolveCanonicalCharacterId } from "../character/characterIdentity";
import { createRelationship, DEFAULT_IDENTITY_ID, getConversationId, getDefaultRelationId, type CharacterRelationship } from "./characterRelationship";

export interface RelationshipMigrationInput {
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  legacyFriendIds: readonly string[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  offlineStories: readonly OfflineStory[];
  defaultIdentityId?: string;
  now: number;
}

export interface RelationshipMigrationResult {
  relationships: CharacterRelationship[];
  messages: Message[];
  memories: MemoryItem[];
  offlineStories: OfflineStory[];
  createdRelationshipCount: number;
  repairedRelationshipCount: number;
  migratedMessageCount: number;
  migratedMemoryCount: number;
  migratedStoryCount: number;
}

/**
 * Adds only deterministic default relations. It is intentionally pure and
 * idempotent so app startup can safely call it more than once.
 */
export function migrateLegacyRelationshipData(input: RelationshipMigrationInput): RelationshipMigrationResult {
  // Historical records existed before identity selection. They must always
  // migrate to the primary legacy identity, not the identity active at launch.
  const defaultIdentityId = DEFAULT_IDENTITY_ID;
  const available = getAvailableCanonicalCharacterIds(input.characters);
  const canonical = (characterId: string) => resolveCanonicalCharacterId(characterId, input.characters);
  const directIds = new Set<string>();
  // Include existing deterministic legacy relations so a previously
  // mis-owned relation_default_* can be repaired even after old friend IDs
  // and unscoped records have already been migrated away.
  input.relationships
    .filter((relation) => relation.id === getDefaultRelationId(relation.characterId))
    .forEach((relation) => directIds.add(canonical(relation.characterId)));
  input.legacyFriendIds.forEach((id) => directIds.add(canonical(id)));
  input.messages.filter((message) => !message.relationId && !input.characters.find((character) => character.id === message.characterId)?.isGroupChat)
    .forEach((message) => directIds.add(canonical(message.characterId)));
  input.memories.filter((memory) => !memory.relationId).forEach((memory) => directIds.add(canonical(memory.characterId)));
  input.offlineStories.filter((story) => !story.relationId && !input.characters.find((character) => character.id === story.characterId)?.isGroupChat)
    .forEach((story) => directIds.add(canonical(story.characterId)));

  const relationships = [...input.relationships];
  let createdRelationshipCount = 0;
  let repairedRelationshipCount = 0;
  for (const characterId of directIds) {
    if (!available.has(characterId)) continue;
    const defaultRelationId = getDefaultRelationId(characterId);
    const defaultRelationIndex = relationships.findIndex((relation) => relation.id === defaultRelationId);
    // A prior build could have created relation_default_* while another
    // identity was active. Its deterministic ID means it is unquestionably
    // legacy data, so repair its owner without touching any normal rel-* data.
    if (defaultRelationIndex >= 0 && relationships[defaultRelationIndex].userIdentityId !== defaultIdentityId) {
      relationships[defaultRelationIndex] = {
        ...relationships[defaultRelationIndex],
        userIdentityId: defaultIdentityId,
        updatedAt: input.now,
      };
      repairedRelationshipCount += 1;
    }
    if (relationships.some((relation) => relation.userIdentityId === defaultIdentityId && relation.characterId === characterId)) continue;
    relationships.push(createRelationship({ id: defaultRelationId, characterId, userIdentityId: defaultIdentityId, now: input.now }));
    createdRelationshipCount += 1;
  }
  const defaultRelationFor = (characterId: string) => relationships.find((relation) => relation.userIdentityId === defaultIdentityId && relation.characterId === canonical(characterId));
  let migratedMessageCount = 0;
  const messages = input.messages.map((message) => {
    if (message.relationId || input.characters.find((character) => character.id === message.characterId)?.isGroupChat) return message;
    const relation = defaultRelationFor(message.characterId);
    if (!relation) return message;
    migratedMessageCount += 1;
    return { ...message, characterId: relation.characterId, relationId: relation.id, conversationId: relation.conversationId || getConversationId(relation.id) };
  });
  let migratedMemoryCount = 0;
  const memories = input.memories.map((memory) => {
    if (memory.relationId) return memory;
    const relation = defaultRelationFor(memory.characterId);
    if (!relation) return memory;
    migratedMemoryCount += 1;
    return { ...memory, characterId: relation.characterId, relationId: relation.id };
  });
  let migratedStoryCount = 0;
  const offlineStories = input.offlineStories.map((story) => {
    if (story.relationId || input.characters.find((character) => character.id === story.characterId)?.isGroupChat) return story;
    const relation = defaultRelationFor(story.characterId);
    if (!relation) return story;
    migratedStoryCount += 1;
    return {
      ...story,
      characterId: relation.characterId,
      relationId: relation.id,
      conversationId: relation.conversationId,
      sourceChatId: story.sourceChatId ? relation.characterId : story.sourceChatId,
      messages: story.messages.map((message) => message.relationId ? message : ({ ...message, characterId: relation.characterId, relationId: relation.id, conversationId: relation.conversationId })),
    };
  });
  return { relationships, messages, memories, offlineStories, createdRelationshipCount, repairedRelationshipCount, migratedMessageCount, migratedMemoryCount, migratedStoryCount };
}
