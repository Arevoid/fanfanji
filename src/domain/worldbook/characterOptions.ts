import type { Character } from "../../types";

export interface CharacterOption { id: string; label: string; character: Character; }

/** Matches the archive's definition of an independently managed character. */
export function getWorldBookSelectableCharacters(characters: readonly Character[]): Character[] {
  return characters.filter((character) => !character.isGroupChat && !character.isContactInstance);
}

export function buildUniqueCharacterOptions(characters: readonly Character[]): CharacterOption[] {
  const unique = new Map<string, Character>();
  getWorldBookSelectableCharacters(characters).forEach((character) => {
    if (!unique.has(character.id)) unique.set(character.id, character);
  });
  const names = new Map<string, number>();
  Array.from(unique.values()).forEach((character) => {
    const displayName = character.remark || character.name;
    names.set(displayName, (names.get(displayName) || 0) + 1);
  });
  return Array.from(unique.values()).map((character) => {
    const displayName = character.remark || character.name;
    return { id: character.id, character, label: (names.get(displayName) || 0) > 1 ? `${displayName} · ${character.id.slice(-4)}` : displayName };
  });
}
