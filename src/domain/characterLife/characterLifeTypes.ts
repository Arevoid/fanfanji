/** The mandatory ownership boundary for every character-life record. */
export interface CharacterLifeScope {
  relationId: string;
  characterId: string;
  userIdentityId: string;
}

export interface CharacterLifeEventKey {
  relationId: string;
  source: string;
  kind: string;
}

export const isNonEmptyCharacterLifeId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const createCharacterLifeEventKey = (input: CharacterLifeEventKey): string =>
  [input.relationId, input.source, input.kind].map((value) => value.trim()).join("\u0000");
