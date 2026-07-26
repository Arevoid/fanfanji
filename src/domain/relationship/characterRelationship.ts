import type { Character } from "../../types";
import { resolveCanonicalCharacterId } from "../character/characterIdentity";

export type CharacterRelationshipState = "unknown" | "friend" | "close_friend" | "ambiguous" | "partner";

/** A direct, user-identity-to-canonical-character relationship. */
export interface CharacterRelationship {
  id: string;
  characterId: string;
  userIdentityId: string;
  conversationId: string;
  relationship: CharacterRelationshipState;
  createdAt: number;
  updatedAt: number;
  lastActiveTime?: number;
  scheduledProactiveTime?: number;
  lastImmediateSummaryMsgId?: string;
  compressedMemory?: string;
}

export const DEFAULT_IDENTITY_ID = "identity-1";

export const getDefaultRelationId = (characterId: string) => `relation_default_${characterId}`;
export const getConversationId = (relationId: string) => `direct:${relationId}`;
export const getOfflineModeStorageKey = (relationId: string) => `offline_mode_active_${relationId}`;
export const getOfflineStoryStorageKey = (relationId: string) => `offline_story_id_${relationId}`;

export function findRelationship(
  relationships: readonly CharacterRelationship[],
  userIdentityId: string,
  characterId: string,
): CharacterRelationship | undefined {
  return relationships.find((relation) => relation.userIdentityId === userIdentityId && relation.characterId === characterId);
}

export function createRelationship(input: {
  id: string;
  characterId: string;
  userIdentityId: string;
  now: number;
  relationship?: CharacterRelationshipState;
}): CharacterRelationship {
  return {
    id: input.id,
    characterId: input.characterId,
    userIdentityId: input.userIdentityId,
    conversationId: getConversationId(input.id),
    relationship: input.relationship || "friend",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Resolves a persisted reference without altering canonical identity behavior. */
export function resolveRelationshipCharacterId(characterId: string, characters: readonly Character[]): string {
  return resolveCanonicalCharacterId(characterId, characters);
}
