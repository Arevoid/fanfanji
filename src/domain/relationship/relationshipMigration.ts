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
  deduplicatedRelationshipCount: number;
  relationIdRemaps: Record<string, string>;
  migratedMessageCount: number;
  migratedMemoryCount: number;
  migratedStoryCount: number;
}

/**
 * Adds only deterministic default relations. It is intentionally pure and
 * idempotent so app startup can safely call it more than once.
 */
export function migrateLegacyRelationshipData(input: RelationshipMigrationInput): RelationshipMigrationResult {
  // Truly unscoped historical records predate identity selection and belong
  // to the primary legacy identity. Existing relationships keep their stored
  // owner; a relation_default_* ID alone is not evidence that it belongs to a
  // different identity.
  const defaultIdentityId = DEFAULT_IDENTITY_ID;
  const available = getAvailableCanonicalCharacterIds(input.characters);
  const canonical = (characterId: string) => resolveCanonicalCharacterId(characterId, input.characters);
  const directIds = new Set<string>();
  input.legacyFriendIds.forEach((id) => directIds.add(canonical(id)));
  input.messages.filter((message) => !message.relationId && !input.characters.find((character) => character.id === message.characterId)?.isGroupChat)
    .forEach((message) => directIds.add(canonical(message.characterId)));
  input.memories.filter((memory) => !memory.relationId).forEach((memory) => directIds.add(canonical(memory.characterId)));
  input.offlineStories.filter((story) => !story.relationId && !input.characters.find((character) => character.id === story.characterId)?.isGroupChat)
    .forEach((story) => directIds.add(canonical(story.characterId)));

  const relationships = [...input.relationships];
  let createdRelationshipCount = 0;
  for (const characterId of directIds) {
    if (!available.has(characterId)) continue;
    if (relationships.some((relation) => relation.userIdentityId === defaultIdentityId && relation.characterId === characterId)) continue;
    const baseDefaultRelationId = getDefaultRelationId(characterId);
    const defaultRelationId = relationships.some((relation) => relation.id === baseDefaultRelationId)
      ? `${baseDefaultRelationId}__${defaultIdentityId}`
      : baseDefaultRelationId;
    relationships.push(createRelationship({ id: defaultRelationId, characterId, userIdentityId: defaultIdentityId, now: input.now }));
    createdRelationshipCount += 1;
  }

  // The relationship invariant is exactly one relation for a user identity
  // and canonical character. Older builds could create duplicates during
  // startup migration. Merge them without dropping any scoped data.
  const relationIdRemaps: Record<string, string> = {};
  const relationshipGroups = new Map<string, CharacterRelationship[]>();
  relationships.forEach((relation) => {
    const canonicalCharacterId = canonical(relation.characterId);
    const normalized = canonicalCharacterId === relation.characterId ? relation : { ...relation, characterId: canonicalCharacterId };
    const key = `${normalized.userIdentityId}\u0000${normalized.characterId}`;
    relationshipGroups.set(key, [...(relationshipGroups.get(key) || []), normalized]);
  });
  const normalizedRelationships: CharacterRelationship[] = [];
  let deduplicatedRelationshipCount = 0;
  relationshipGroups.forEach((group) => {
    const ordered = [...group].sort((left, right) => {
      const leftIsDefault = left.id === getDefaultRelationId(left.characterId) ? 0 : 1;
      const rightIsDefault = right.id === getDefaultRelationId(right.characterId) ? 0 : 1;
      return leftIsDefault - rightIsDefault || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
    });
    const primary = ordered[0];
    const merged = ordered.slice(1).reduce<CharacterRelationship>((current, duplicate) => ({
      ...current,
      compressedMemory: current.compressedMemory || duplicate.compressedMemory,
      lastActiveTime: Math.max(current.lastActiveTime || 0, duplicate.lastActiveTime || 0) || undefined,
      scheduledProactiveTime: Math.max(current.scheduledProactiveTime || 0, duplicate.scheduledProactiveTime || 0) || undefined,
      lastImmediateSummaryMsgId: current.lastImmediateSummaryMsgId || duplicate.lastImmediateSummaryMsgId,
      updatedAt: Math.max(current.updatedAt, duplicate.updatedAt),
    }), primary);
    normalizedRelationships.push(merged);
    ordered.slice(1).forEach((duplicate) => {
      relationIdRemaps[duplicate.id] = primary.id;
      deduplicatedRelationshipCount += 1;
    });
  });
  const relationshipById = new Map(normalizedRelationships.map((relation) => [relation.id, relation]));
  const relationForId = (relationId: string | undefined) => relationId ? relationshipById.get(relationIdRemaps[relationId] || relationId) : undefined;
  const defaultRelationFor = (characterId: string) => normalizedRelationships.find((relation) => relation.userIdentityId === defaultIdentityId && relation.characterId === canonical(characterId));
  let migratedMessageCount = 0;
  const messages = input.messages.map((message) => {
    const scopedRelation = relationForId(message.relationId);
    if (scopedRelation) {
      const relationId = scopedRelation.id;
      const conversationId = scopedRelation.conversationId || getConversationId(relationId);
      return message.relationId === relationId && message.conversationId === conversationId && message.characterId === scopedRelation.characterId
        ? message
        : { ...message, characterId: scopedRelation.characterId, relationId, conversationId };
    }
    if (message.relationId || input.characters.find((character) => character.id === message.characterId)?.isGroupChat) return message;
    const relation = defaultRelationFor(message.characterId);
    if (!relation) return message;
    migratedMessageCount += 1;
    return { ...message, characterId: relation.characterId, relationId: relation.id, conversationId: relation.conversationId || getConversationId(relation.id) };
  });
  let migratedMemoryCount = 0;
  const memories = input.memories.map((memory) => {
    const scopedRelation = relationForId(memory.relationId);
    if (scopedRelation) {
      return memory.relationId === scopedRelation.id && memory.characterId === scopedRelation.characterId
        ? memory
        : { ...memory, characterId: scopedRelation.characterId, relationId: scopedRelation.id };
    }
    if (memory.relationId) return memory;
    const relation = defaultRelationFor(memory.characterId);
    if (!relation) return memory;
    migratedMemoryCount += 1;
    return { ...memory, characterId: relation.characterId, relationId: relation.id };
  });
  let migratedStoryCount = 0;
  const offlineStories = input.offlineStories.map((story) => {
    const scopedRelation = relationForId(story.relationId);
    if (scopedRelation) {
      const relationId = scopedRelation.id;
      const conversationId = scopedRelation.conversationId || getConversationId(relationId);
      return {
        ...story,
        characterId: scopedRelation.characterId,
        relationId,
        conversationId,
        messages: story.messages.map((message) => {
          const messageRelation = relationForId(message.relationId) || scopedRelation;
          return {
            ...message,
            characterId: messageRelation.characterId,
            relationId: messageRelation.id,
            conversationId: messageRelation.conversationId || getConversationId(messageRelation.id),
          };
        }),
      };
    }
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
  return { relationships: normalizedRelationships, messages, memories, offlineStories, createdRelationshipCount, deduplicatedRelationshipCount, relationIdRemaps, migratedMessageCount, migratedMemoryCount, migratedStoryCount };
}
