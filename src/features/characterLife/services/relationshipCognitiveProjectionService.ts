import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { projectRelationshipState } from "../../../domain/characterLife/relationshipProjection";
import { buildRelationshipTimeline } from "../../../domain/characterLife/relationshipTimelineQuery";
import type { RelationshipState } from "../../../domain/characterLife/relationshipStateTypes";
import type { RelationshipTimeline } from "../../../domain/characterLife/relationshipTimelineTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { loadCharacterEvents } from "../../../core/storage/repositories/characterEventRepository";
import { loadCharacterContinuity } from "../../../core/storage/repositories/characterContinuityRepository";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { reconcileImpressions, projectCharacterContinuityReadFrame } from "../../../domain/memory/characterContinuity";
import { projectKnowledgeReadFrame } from "../../../domain/characterKnowledge/knowledgeReadFrame";
import { projectImpressionGrowth } from "../../../domain/memory/impressionGrowth";
import { isExactTruthScope } from "../../../domain/characterKnowledge/knowledgeConflictPolicy";

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
    .filter((event) => scopeMatches(event, input.relation) && event.recordedAt <= (input.now ?? Date.now()))
    .sort(chronological);
  let state: RelationshipState | undefined;
  for (const event of events) {
    state = projectRelationshipState(state, event) || state;
  }
  const continuity = loadCharacterContinuity();
  const scope = { characterId: input.relation.characterId, relationId: input.relation.id, userIdentityId: input.relation.userIdentityId, conversationId: input.relation.conversationId };
  const now = input.now ?? Date.now();
  const impressions = continuity.valid ? reconcileImpressions(projectCharacterContinuityReadFrame(continuity.value, now).impressions,
    projectKnowledgeReadFrame(loadKnowledgeClaims().value, now), now)
    .filter((record) => record.recordedAt <= now && isExactTruthScope(record.scope, scope) && record.status === "active" && !record.paused && Boolean(record.growth) && !record.intervention) : [];
  if (impressions.length) {
    state = { ...(state || { ...scope, stage: input.relation.relationship, tone: "neutral", openLoops: [], boundaries: [], updatedAt: input.now ?? Date.now(), version: 1 }),
      dimensions: projectImpressionGrowth(state?.dimensions, impressions) };
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
