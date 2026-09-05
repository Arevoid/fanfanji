import type { Character, OfflineStory } from "../../types";
import {
  getConversationId,
  type CharacterRelationship,
} from "./characterRelationship";
import { resolveCanonicalCharacterId } from "../character/characterIdentity";

export interface OfflineChatNavigationTarget {
  characterId: string;
  relationId?: string;
  conversationId?: string;
  kind: "direct" | "group" | "legacy";
}

export function resolveOfflineChatNavigationTarget(input: {
  story: OfflineStory;
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  ownerIdentityId: string;
}): OfflineChatNavigationTarget | null {
  const { story, relationships, characters, ownerIdentityId } = input;
  const sourceCharacterId = story.sourceChatId || story.characterId;
  const canonicalCharacterId = resolveCanonicalCharacterId(sourceCharacterId, characters);
  const sourceCharacter = characters.find((character) => character.id === canonicalCharacterId);

  if (sourceCharacter?.isGroupChat) {
    return {
      characterId: sourceCharacter.id,
      conversationId: story.conversationId || `group:${sourceCharacter.id}`,
      kind: "group",
    };
  }

  if (story.relationId) {
    const relationship = relationships.find((candidate) =>
      candidate.id === story.relationId
      && candidate.userIdentityId === ownerIdentityId
      && resolveCanonicalCharacterId(candidate.characterId, characters) === canonicalCharacterId,
    );
    if (!relationship) return null;
    return {
      characterId: relationship.characterId,
      relationId: relationship.id,
      conversationId: relationship.conversationId || getConversationId(relationship.id),
      kind: "direct",
    };
  }

  const legacyRelationship = relationships.find((candidate) =>
    candidate.userIdentityId === ownerIdentityId
    && resolveCanonicalCharacterId(candidate.characterId, characters) === canonicalCharacterId
    && (!story.conversationId || candidate.conversationId === story.conversationId),
  ) || relationships.find((candidate) =>
    candidate.userIdentityId === ownerIdentityId
    && resolveCanonicalCharacterId(candidate.characterId, characters) === canonicalCharacterId,
  );

  if (legacyRelationship) {
    return {
      characterId: legacyRelationship.characterId,
      relationId: legacyRelationship.id,
      conversationId: legacyRelationship.conversationId || getConversationId(legacyRelationship.id),
      kind: "legacy",
    };
  }

  return canonicalCharacterId
    ? {
        characterId: canonicalCharacterId,
        conversationId: story.conversationId,
        kind: "legacy",
      }
    : null;
}
