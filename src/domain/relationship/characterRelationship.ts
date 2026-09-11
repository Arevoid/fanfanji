import type { Character, UserIdentity } from "../../types";
import { resolveCanonicalCharacterId } from "../character/characterIdentity";

export type CharacterRelationshipState = "unknown" | "friend" | "close_friend" | "ambiguous" | "partner";
export type IdentityRecognitionState = "unknown" | "suspected" | "recognized" | "confirmed";

/** A direct, user-identity-to-canonical-character relationship. */
export interface CharacterRelationship {
  id: string;
  /** Optional dev-only synthetic fixture namespace; production records omit it. */
  syntheticFixtureId?: string;
  characterId: string;
  userIdentityId: string;
  /** Stable owner space used to aggregate a primary identity and its aliases. */
  rootIdentityId?: string;
  conversationId: string;
  relationship: CharacterRelationshipState;
  /** How confidently the character has connected this identity to another one. */
  identityRecognitionState?: IdentityRecognitionState;
  identityRecognitionUpdatedAt?: number;
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

/**
 * Resolves the persistent owner space for an identity. Missing legacy
 * ownership is intentionally treated as self-owned; no relationship is
 * reassigned based on names, avatars, or profile text.
 */
export function getRootIdentityId(identityId: string, identities: readonly UserIdentity[] = []): string {
  const identityById = new Map(identities.map((identity) => [identity.id, identity]));
  const resolve = (candidateId: string, seen: Set<string>): string => {
    if (seen.has(candidateId)) return candidateId;
    seen.add(candidateId);
    const identity = identityById.get(candidateId);
    if (!identity || identity.kind !== "alias") return candidateId;
    const parentId = identity.parentIdentityId && identityById.has(identity.parentIdentityId)
      ? identity.parentIdentityId
      : candidateId;
    return parentId === candidateId ? candidateId : resolve(parentId, seen);
  };
  return resolve(identityId, new Set<string>());
}

/** Returns the primary persona that owns an identity, if one is available. */
export function findPrimaryIdentityForIdentity(
  identityId: string,
  identities: readonly UserIdentity[] = [],
): UserIdentity | undefined {
  const rootIdentityId = getRootIdentityId(identityId, identities);
  return identities.find((identity) =>
    !identity.archived
    && identity.kind === "primary"
    && getRootIdentityId(identity.id, identities) === rootIdentityId,
  );
}

/** Adds missing relationship owner scopes while preserving every relation ID. */
export function normalizeRelationshipIdentityScopes(
  relationships: readonly CharacterRelationship[],
  identities: readonly UserIdentity[] = [],
): { relationships: CharacterRelationship[]; changed: boolean } {
  let changed = false;
  const normalized = relationships.map((relationship) => {
    const rootIdentityId = getRootIdentityId(relationship.userIdentityId, identities);
    if (relationship.rootIdentityId === rootIdentityId) return relationship;
    changed = true;
    return { ...relationship, rootIdentityId };
  });
  return { relationships: normalized, changed };
}

/** Returns every relation in the active主人设空间, including its aliases. */
export function listRelationshipsForIdentityWorkspace(
  relationships: readonly CharacterRelationship[],
  activeIdentityId: string,
  identities: readonly UserIdentity[] = [],
): CharacterRelationship[] {
  const rootIdentityId = getRootIdentityId(activeIdentityId, identities);
  return relationships.filter((relationship) =>
    getRootIdentityId(relationship.userIdentityId, identities) === rootIdentityId,
  );
}

/** Stable display order for identity managers. Archived records are retained
 * in storage, while callers decide whether to include them in active pickers. */
export function sortIdentitiesForDisplay(identities: readonly UserIdentity[]): UserIdentity[] {
  return [...identities].sort((left, right) => {
    const orderDelta = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
    if (orderDelta !== 0) return orderDelta;
    const kindDelta = (left.kind === "primary" ? 0 : 1) - (right.kind === "primary" ? 0 : 1);
    if (kindDelta !== 0) return kindDelta;
    return left.id.localeCompare(right.id);
  });
}

/** Returns identities belonging to one主人设 root without mutating persisted data. */
export function listIdentitiesForRoot(
  identities: readonly UserIdentity[],
  rootIdentityId: string,
  options: { includeArchived?: boolean } = {},
): UserIdentity[] {
  const includeArchived = options.includeArchived === true;
  return sortIdentitiesForDisplay(identities).filter((identity) =>
    (includeArchived || !identity.archived)
    && getRootIdentityId(identity.id, identities) === rootIdentityId,
  );
}

/** Returns one representative primary identity for each root, preserving order. */
export function listIdentityRoots(
  identities: readonly UserIdentity[],
  options: { includeArchived?: boolean } = {},
): UserIdentity[] {
  const roots = new Map<string, UserIdentity>();
  for (const identity of sortIdentitiesForDisplay(identities)) {
    if (!options.includeArchived && identity.archived) continue;
    const rootId = getRootIdentityId(identity.id, identities);
    const current = roots.get(rootId);
    if (!current || (identity.kind === "primary" && current.kind !== "primary")) roots.set(rootId, identity);
  }
  return [...roots.values()];
}

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
  syntheticFixtureId?: string;
  characterId: string;
  userIdentityId: string;
  rootIdentityId?: string;
  now: number;
  relationship?: CharacterRelationshipState;
}): CharacterRelationship {
  return {
    id: input.id,
    ...(input.syntheticFixtureId ? { syntheticFixtureId: input.syntheticFixtureId } : {}),
    characterId: input.characterId,
    userIdentityId: input.userIdentityId,
    ...(input.rootIdentityId ? { rootIdentityId: input.rootIdentityId } : {}),
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
