import type { Character } from "../../types";

/**
 * Character ownership is an opaque canonical UserIdentity id.  The creation
 * seam deliberately accepts it as an input but never derives it from a name,
 * avatar, tab, relation or persona field.
 */
export type CharacterCreationInput = Omit<Character, "ownerIdentityId"> & {
  ownerIdentityId?: string;
};

export interface CharacterOwnershipValidation {
  valid: boolean;
  ownerIdentityId?: string;
  reason?: "invalid_owner_identity_id";
}

/**
 * Normalizes only the representation that the existing optional field allows.
 * Empty or non-string values are treated as an absent legacy-compatible owner.
 */
export function normalizeCharacterOwnerIdentityId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

/** Validates the opaque id representation without guessing an identity from UI data. */
export function validateCharacterOwnershipInput(value: unknown): CharacterOwnershipValidation {
  if (value === undefined) return { valid: true };
  const normalized = normalizeCharacterOwnerIdentityId(value);
  return normalized
    ? { valid: true, ownerIdentityId: normalized }
    : { valid: false, reason: "invalid_owner_identity_id" };
}

/**
 * Creates a Character record without creating any relationship, conversation,
 * message, Memory or other side effect.  Callers must provide the canonical
 * owner id explicitly when ownership is known; omitted ownership remains
 * backward-compatible with legacy records.
 */
export function createCharacterFromInput(input: CharacterCreationInput): Character {
  const { ownerIdentityId, ...character } = input;
  const validation = validateCharacterOwnershipInput(ownerIdentityId);
  return validation.valid && validation.ownerIdentityId
    ? { ...character, ownerIdentityId: validation.ownerIdentityId }
    : character;
}
