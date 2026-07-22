import type { Character } from "../../types";

export interface CharacterOption { id: string; label: string; character: Character; }

export function buildUniqueCharacterOptions(characters: readonly Character[]): CharacterOption[] {
  const unique = new Map<string, Character>();
  characters.forEach((character) => {
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
