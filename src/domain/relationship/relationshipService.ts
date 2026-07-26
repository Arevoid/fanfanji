import type { Character } from "../../types";
import {
  loadCharacterRelationships,
  saveCharacterRelationships,
} from "../../core/storage/repositories/relationshipRepository";
import type { StorageWriteResult } from "../../core/storage/storageTypes";
import { resolveCanonicalCharacterId } from "../character/characterIdentity";
import {
  LEGACY_PRIMARY_IDENTITY_ID,
  type CharacterRelationship,
} from "./relationshipTypes";

export type RelationshipCharacterRef = Pick<Character, "id" | "profileSourceId" | "ownerIdentityId" | "isGroupChat">;

function normalizeId(value: string, fallback: string): string {
  return value.trim() || fallback;
}

/** A deterministic id makes repeated legacy resolution idempotent. */
export function createStableRelationId(characterId: string, userIdentityId: string): string {
  return `relation:${encodeURIComponent(characterId)}:${encodeURIComponent(userIdentityId)}`;
}

/** Pure counterpart to resolveRelationId for render-time and list filtering. */
export function deriveRelationId(
  character: RelationshipCharacterRef,
  userIdentityId: string = character.ownerIdentityId || LEGACY_PRIMARY_IDENTITY_ID,
): string {
  return createStableRelationId(
    resolveCanonicalCharacterId(character),
    normalizeId(userIdentityId, LEGACY_PRIMARY_IDENTITY_ID),
  );
}

export function getOrCreateRelationship(
  characterId: string,
  userIdentityId: string,
  now: number = Date.now(),
): CharacterRelationship {
  const canonicalCharacterId = normalizeId(characterId, "unknown-character");
  const identityId = normalizeId(userIdentityId, LEGACY_PRIMARY_IDENTITY_ID);
  const existing = loadCharacterRelationships().value.find(
    (relationship) =>
      relationship.characterId === canonicalCharacterId &&
      relationship.userIdentityId === identityId,
  );

  if (existing) return existing;

  const relationship: CharacterRelationship = {
    id: createStableRelationId(canonicalCharacterId, identityId),
    characterId: canonicalCharacterId,
    userIdentityId: identityId,
    createdAt: now,
    updatedAt: now,
  };

  const relationships = loadCharacterRelationships().value;
  // A persisted deterministic id may predate a malformed duplicate record.
  const byId = relationships.find((item) => item.id === relationship.id);
  if (byId) return byId;

  saveCharacterRelationships([...relationships, relationship]);
  return relationship;
}

/**
 * Returns the stable relationship id for an archive profile or a legacy
 * contact instance. `profileSourceId` keeps the canonical character identity
 * intact while `ownerIdentityId` supplies the user-side relationship boundary.
 */
export function resolveRelationId(
  character: RelationshipCharacterRef,
  userIdentityId: string = character.ownerIdentityId || LEGACY_PRIMARY_IDENTITY_ID,
): string {
  return getOrCreateRelationship(resolveCanonicalCharacterId(character), userIdentityId).id;
}

export function listRelationshipsByCharacter(characterId: string): CharacterRelationship[] {
  const canonicalCharacterId = normalizeId(characterId, "unknown-character");
  return loadCharacterRelationships()
    .value
    .filter((relationship) => relationship.characterId === canonicalCharacterId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function deleteRelationshipsByCharacter(characterId: string): StorageWriteResult {
  const canonicalCharacterId = normalizeId(characterId, "unknown-character");
  const relationships = loadCharacterRelationships().value;
  return saveCharacterRelationships(
    relationships.filter((relationship) => relationship.characterId !== canonicalCharacterId),
  );
}

/** Removes exactly one identity-to-character relationship. */
export function deleteRelationshipById(relationId: string): StorageWriteResult {
  const relationships = loadCharacterRelationships().value;
  return saveCharacterRelationships(relationships.filter((relationship) => relationship.id !== relationId));
}

export interface RelationshipDataScope {
  characterIds: readonly string[];
  relationIds: readonly string[];
}

/** Shared deletion predicate for records that retain legacy characterId fields. */
export function isRelationshipScopedRecord(
  record: { characterId?: string; relationId?: string; characterIds?: readonly string[] },
  scope: RelationshipDataScope,
): boolean {
  const characterIds = new Set(scope.characterIds);
  const relationIds = new Set(scope.relationIds);
  return Boolean(
    (record.characterId && characterIds.has(record.characterId))
    || (record.relationId && relationIds.has(record.relationId))
    || record.characterIds?.some((characterId) => characterIds.has(characterId)),
  );
}

/**
 * Compatibility helper for a future migration pass. It does not mutate
 * characters and safely ignores groups; callers may pass the current archive
 * and contact list to materialize relationship records once.
 */
export function materializeLegacyContactRelationships(
  characters: readonly RelationshipCharacterRef[],
  now: number = Date.now(),
): CharacterRelationship[] {
  const results = new Map<string, CharacterRelationship>();
  for (const character of characters) {
    if (character.isGroupChat) continue;
    const canonicalCharacterId = resolveCanonicalCharacterId(character);
    const userIdentityId = character.ownerIdentityId || LEGACY_PRIMARY_IDENTITY_ID;
    const relationship = getOrCreateRelationship(canonicalCharacterId, userIdentityId, now);
    results.set(relationship.id, relationship);
  }
  return [...results.values()];
}
