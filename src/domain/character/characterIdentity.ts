import type { Character } from "../../types";

/**
 * Contact instances may point at a source profile. Feature data must use the
 * source profile id so the same person is not split between contact copies.
 */
export function resolveCanonicalCharacterId(character: Pick<Character, "id" | "profileSourceId">): string {
  return character.profileSourceId?.trim() || character.id;
}
