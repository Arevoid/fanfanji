import type { CharacterRelationshipState } from "../relationship/characterRelationship";

export const RELATIONSHIP_STATE_PROJECTION_VERSION = 1;

export type RelationshipTone = "neutral" | "warm" | "strained" | "repairing";

export interface RelationshipOpenLoop {
  id: string;
  kind: "promise";
  description: string;
  createdAt: number;
  sourceEventId: string;
}

/**
 * Read-only current projection of relation-scoped CharacterEvents. It is not
 * persisted in this phase and never replaces CharacterRelationship or Memory.
 */
export interface RelationshipState {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  stage: CharacterRelationshipState;
  tone: RelationshipTone;
  openLoops: readonly RelationshipOpenLoop[];
  boundaries: readonly string[];
  lastMeaningfulEventId?: string;
  lastMeaningfulEventAt?: number;
  updatedAt: number;
  version: typeof RELATIONSHIP_STATE_PROJECTION_VERSION;
}
