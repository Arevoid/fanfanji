import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { projectRelationshipState } from "../../../domain/characterLife/relationshipProjection";
import { buildRelationshipTimeline } from "../../../domain/characterLife/relationshipTimelineQuery";
import type { RelationshipState } from "../../../domain/characterLife/relationshipStateTypes";
import type { RelationshipTimeline } from "../../../domain/characterLife/relationshipTimelineTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { loadCharacterEvents } from "../../../core/storage/repositories/characterEventRepository";

export interface RelationshipCognitiveProjection {
  state?: RelationshipState;
  timeline: RelationshipTimeline;
}

const scopeMatches = (event: CharacterEvent, relation: CharacterRelationship): boolean =>
  event.relationId === relation.id
  && event.characterId === relation.characterId
  && event.userIdentityId === relation.userIdentityId;

const chronological = (left: CharacterEvent, right: CharacterEvent): number =>
  left.occurredAt - right.occurredAt
  || left.recordedAt - right.recordedAt
  || left.id.localeCompare(right.id);

/**
 * Application-level bridge from the event repository to the read-only
 * RelationshipState/Timeline projection. Events remain the source of truth;
 * this snapshot is rebuilt per request and can never join another relation.
 */
export function buildRelationshipCognitiveProjection(input: {
  relation: CharacterRelationship;
  events?: readonly CharacterEvent[];
  now?: number;
  limit?: number;
}): RelationshipCognitiveProjection {
  const events = (input.events || loadCharacterEvents().value)
    .filter((event) => scopeMatches(event, input.relation))
    .sort(chronological);
  let state: RelationshipState | undefined;
  for (const event of events) {
    state = projectRelationshipState(state, event) || state;
  }
  return {
    ...(state ? { state } : {}),
    timeline: buildRelationshipTimeline({
      relationId: input.relation.id,
      characterId: input.relation.characterId,
      userIdentityId: input.relation.userIdentityId,
      events,
      state,
      limit: input.limit,
      generatedAt: input.now ?? Date.now(),
    }),
  };
}
