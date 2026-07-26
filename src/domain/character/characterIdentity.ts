import type { Character } from "../../types";

/**
 * Resolves legacy contact copies back to their original archive profile.
 * It never mutates or deletes old records, so existing conversations remain
 * recoverable while all new relationships use the canonical Character ID.
 */
export function resolveCanonicalCharacterIds(
  characterIds: readonly string[],
  characters: readonly Character[],
): Set<string> {
  return new Set(characterIds.map((characterId) => resolveCanonicalCharacterId(characterId, characters)));
}

/** Resolves a legacy contact relation to its archive profile without merging same-name records. */
export function resolveCanonicalCharacterId(characterId: string, characters: readonly Character[]): string {
  return characters.find((character) => character.id === characterId)?.profileSourceId || characterId;
}

/**
 * A usable character must be an actual archive/group entity, never a legacy
 * contact copy. Historical contact copies remain readable but cannot open new
 * chats or be selected for new offline stories.
 */
export function getAvailableCanonicalCharacterIds(characters: readonly Character[]): Set<string> {
  return new Set(characters
    .filter((character) => !character.isContactInstance)
    .map((character) => character.id));
}

export function isAvailableCanonicalCharacterId(characterId: string, characters: readonly Character[]): boolean {
  return getAvailableCanonicalCharacterIds(characters).has(
    resolveCanonicalCharacterId(characterId, characters),
  );
}

/** Removes only stale relationship references; it never deletes historical records. */
export function pruneUnavailableCharacterRelations(
  characterIds: readonly string[],
  characters: readonly Character[],
): string[] {
  const availableCharacterIds = getAvailableCanonicalCharacterIds(characters);
  return characterIds.filter((characterId) =>
    availableCharacterIds.has(resolveCanonicalCharacterId(characterId, characters)),
  );
}
