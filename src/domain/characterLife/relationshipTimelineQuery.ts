import type { CharacterEvent } from "./characterEventTypes";
import {
  RELATIONSHIP_TIMELINE_PROJECTION_VERSION,
  type BuildRelationshipTimelineInput,
  type RelationshipTimeline,
} from "./relationshipTimelineTypes";
import type { RelationshipState } from "./relationshipStateTypes";

const DEFAULT_RECENT_EVENT_LIMIT = 20;

const isSameScope = (
  value: Pick<CharacterEvent, "relationId" | "characterId" | "userIdentityId"> | RelationshipState,
  input: Pick<BuildRelationshipTimelineInput, "relationId" | "characterId" | "userIdentityId">,
): boolean => value.relationId === input.relationId
  && value.characterId === input.characterId
  && value.userIdentityId === input.userIdentityId;

const newestFirst = (left: CharacterEvent, right: CharacterEvent): number =>
  right.occurredAt - left.occurredAt
  || right.recordedAt - left.recordedAt
  || left.id.localeCompare(right.id);

const normalizeLimit = (limit: number | undefined): number => {
  if (limit === undefined) return DEFAULT_RECENT_EVENT_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_RECENT_EVENT_LIMIT;
  return Math.max(0, Math.floor(limit));
};

/**
 * Builds a current read projection from caller-supplied events and state.
 * It neither reads nor writes storage and cannot join data across a relation.
 */
export const buildRelationshipTimeline = (
  input: BuildRelationshipTimelineInput,
): RelationshipTimeline => {
  const scopedEvents = input.events.filter((event) => isSameScope(event, input)).sort(newestFirst);
  const state = input.state && isSameScope(input.state, input) ? input.state : undefined;
  const recentEvents = scopedEvents.slice(0, normalizeLimit(input.limit));

  return {
    relationId: input.relationId,
    characterId: input.characterId,
    userIdentityId: input.userIdentityId,
    state,
    recentEvents,
    lastEventAt: scopedEvents[0]?.occurredAt,
    eventCount: scopedEvents.length,
    projectionVersion: RELATIONSHIP_TIMELINE_PROJECTION_VERSION,
    generatedAt: input.generatedAt ?? Date.now(),
  };
};
