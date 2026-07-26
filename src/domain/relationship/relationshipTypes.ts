/**
 * A relationship is the stable boundary between one user identity and one
 * canonical character. It intentionally owns no chat, memory, or scene data
 * yet; later phases will reference this id from those records.
 */
export interface CharacterRelationship {
  id: string;
  characterId: string;
  userIdentityId: string;
  createdAt: number;
  updatedAt: number;
}

export const LEGACY_PRIMARY_IDENTITY_ID = "identity-1";
