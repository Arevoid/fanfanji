import type { CharacterEvent } from "./characterEventTypes";
import type { RelationshipState } from "./relationshipStateTypes";

export const RELATIONSHIP_TIMELINE_PROJECTION_VERSION = 1;

/** Read-only relation-scoped composition; it is never persisted as a copy. */
export interface RelationshipTimeline {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  state?: RelationshipState;
  recentEvents: readonly CharacterEvent[];
  lastEventAt?: number;
  eventCount: number;
  projectionVersion: typeof RELATIONSHIP_TIMELINE_PROJECTION_VERSION;
  generatedAt: number;
}

export interface BuildRelationshipTimelineInput {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  events: readonly CharacterEvent[];
  state?: RelationshipState;
  limit?: number;
  /** Injectable timestamp keeps the query deterministic for callers and tests. */
  generatedAt?: number;
}
