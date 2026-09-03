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
  /** Whether this relationship may naturally propose an offline meeting. Defaults to false. */
  enableProactiveOffline?: boolean;
  /** Persisted per relationship so reopening the app cannot reset call throttling. */
  lastProactiveCallAt?: number;
  proactiveCallDayKey?: string;
  proactiveCallCount?: number;
  proactiveCallBackoffUntil?: number;
  /** Whether one delayed retry is allowed after an emotionally charged hang-up. */
  proactiveCallRetryAvailable?: boolean;
  lastImmediateSummaryMsgId?: string;
  compressedMemory?: string;
}

export const DEFAULT_IDENTITY_ID = "identity-1";

export const getDefaultRelationId = (characterId: string) => `relation_default_${characterId}`;
export const getConversationId = (relationId: string) => `direct:${relationId}`;
export const getOfflineModeStorageKey = (relationId: string) => `offline_mode_active_${relationId}`;
export const getOfflineStoryStorageKey = (relationId: string) => `offline_story_id_${relationId}`;
export const getOfflineGroupModeStorageKey = (groupId: string) => `offline_group_mode_active_${groupId}`;
export const getOfflineGroupStoryStorageKey = (groupId: string) => `offline_group_story_id_${groupId}`;

export function findRelationship(
  relationships: readonly CharacterRelationship[],
  userIdentityId: string,
  characterId: string,
): CharacterRelationship | undefined {
  return relationships.find((relation) => relation.userIdentityId === userIdentityId && relation.characterId === characterId);
}

/**
 * Recovers a relationship that was persisted against an old contact-copy ID.
 * Identity remains the isolation boundary; canonicalization only reconciles
 * the character reference left behind by an earlier bad merge.
 */
export function findRelationshipForCanonicalCharacter(
  relationships: readonly CharacterRelationship[],
  userIdentityId: string,
  characterId: string,
  characters: readonly Character[],
): CharacterRelationship | undefined {
  const canonicalCharacterId = resolveCanonicalCharacterId(characterId, characters);
  return relationships.find((relation) =>
    relation.userIdentityId === userIdentityId
    && resolveCanonicalCharacterId(relation.characterId, characters) === canonicalCharacterId,
  );
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
