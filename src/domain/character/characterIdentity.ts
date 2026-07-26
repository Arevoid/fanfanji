import type { Character, MemoryItem, Moment, OfflineStory } from "../../types";

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

export interface CharacterIdentityMigration {
  idMap: ReadonlyMap<string, string>;
  duplicateLogs: readonly string[];
  migratedMemoryCount: number;
  migratedMomentCount: number;
  referencedOfflineStoryCount: number;
  memories: MemoryItem[];
  moments: Moment[];
}

/**
 * Builds mappings only for verifiable legacy contact copies. Matching names or
 * avatars alone never merge two independently-created archive characters.
 */
export function migrateLegacyCharacterIdentityData(input: {
  characters: readonly Character[];
  memories: readonly MemoryItem[];
  moments: readonly Moment[];
  offlineStories: readonly OfflineStory[];
}): CharacterIdentityMigration {
  const idMap = new Map<string, string>();
  const duplicateLogs: string[] = [];

  for (const contact of input.characters) {
    if (!contact.isContactInstance || !contact.profileSourceId) continue;
    const canonical = input.characters.find((character) =>
      character.id === contact.profileSourceId && !character.isContactInstance,
    );
    if (!canonical) continue;
    if (contact.name !== canonical.name || contact.avatar !== canonical.avatar) continue;

    idMap.set(contact.id, canonical.id);
    duplicateLogs.push(`发现重复角色：${contact.id}（${contact.name}）→ 合并到：${canonical.id}`);
  }

  const resolve = (characterId: string | undefined) => characterId ? (idMap.get(characterId) || characterId) : characterId;
  let migratedMemoryCount = 0;
  const memories = input.memories.map((memory) => {
    const characterId = resolve(memory.characterId)!;
    if (characterId === memory.characterId) return memory;
    migratedMemoryCount += 1;
    return { ...memory, characterId };
  });

  let migratedMomentCount = 0;
  const moments = input.moments.map((moment) => {
    const characterId = resolve(moment.characterId);
    if (characterId === moment.characterId) return moment;
    migratedMomentCount += 1;
    return { ...moment, characterId };
  });

  const referencedOfflineStoryCount = input.offlineStories.filter((story) =>
    resolve(story.characterId) !== story.characterId
      || story.characterIds?.some((characterId) => resolve(characterId) !== characterId)
      || resolve(story.sourceChatId) !== story.sourceChatId,
  ).length;

  return {
    idMap,
    duplicateLogs,
    migratedMemoryCount,
    migratedMomentCount,
    referencedOfflineStoryCount,
    memories,
    moments,
  };
}

export function resolveOfflineStoryCharacterId(story: OfflineStory, characters: readonly Character[]): string {
  return resolveCanonicalCharacterId(story.characterId, characters);
}

export function resolveOfflineStoryCharacterIds(story: OfflineStory, characters: readonly Character[]): string[] {
  return Array.from(new Set((story.characterIds || [story.characterId]).map((characterId) =>
    resolveCanonicalCharacterId(characterId, characters),
  )));
}
