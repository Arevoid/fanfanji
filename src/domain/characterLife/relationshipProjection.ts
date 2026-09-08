import type { CharacterEvent } from "./characterEventTypes";
import {
  RELATIONSHIP_STATE_PROJECTION_VERSION,
  type RelationshipHabitSummary,
  type RelationshipMeaningfulEvent,
  type RelationshipMilestone,
  type RelationshipOpenLoop,
  type RelationshipState,
} from "./relationshipStateTypes";

const isSameRelationshipScope = (state: RelationshipState, event: CharacterEvent): boolean =>
  state.relationId === event.relationId
  && state.characterId === event.characterId
  && state.userIdentityId === event.userIdentityId;

const isTrustedExplicitEvent = (event: CharacterEvent): boolean =>
  event.status === "active"
  && event.confidence === 1
  && event.source !== "inferred";

const createInitialState = (event: CharacterEvent): RelationshipState => ({
  relationId: event.relationId,
  characterId: event.characterId,
  userIdentityId: event.userIdentityId,
  // This mirrors the existing direct-relationship creation default. It is not
  // an inferred relationship upgrade.
  stage: event.kind === "relationship_created" ? "friend" : "unknown",
  tone: "neutral",
  openLoops: [],
  boundaries: [],
  habitSummaries: [],
  meaningfulEvents: [],
  milestones: [],
  updatedAt: event.recordedAt,
  version: RELATIONSHIP_STATE_PROJECTION_VERSION,
});

const getPromiseReference = (event: CharacterEvent): string | undefined => {
  const sourceMatch = /^promise:([^:\s]+)$/.exec(event.source);
  if (sourceMatch) return sourceMatch[1];
  const summaryMatch = /\[promise:([^\]\s]+)\]/.exec(event.summary);
  return summaryMatch?.[1];
};

const getPromiseLoopId = (event: CharacterEvent): string => getPromiseReference(event) || event.id;

const updateMeaningfulEvent = (state: RelationshipState, event: CharacterEvent): RelationshipState => ({
  ...state,
  lastMeaningfulEventId: event.id,
  lastMeaningfulEventAt: event.occurredAt,
  updatedAt: Math.max(state.updatedAt, event.recordedAt),
});

const appendUniqueBySourceEvent = <T extends { sourceEventId: string }>(
  records: readonly T[] | undefined,
  record: T,
): T[] => {
  const current = records ?? [];
  return current.some((item) => item.sourceEventId === record.sourceEventId)
    ? [...current]
    : [...current, record];
};

const projectHabitFormed = (state: RelationshipState, event: CharacterEvent): RelationshipState => {
  const habit: RelationshipHabitSummary = {
    id: event.id,
    summary: event.summary,
    formedAt: event.occurredAt,
    sourceEventId: event.id,
  };
  return updateMeaningfulEvent({
    ...state,
    habitSummaries: appendUniqueBySourceEvent(state.habitSummaries, habit),
  }, event);
};

const projectMeaningfulShare = (state: RelationshipState, event: CharacterEvent): RelationshipState => {
  const meaningfulEvent: RelationshipMeaningfulEvent = {
    id: event.id,
    kind: "meaningful_share",
    summary: event.summary,
    occurredAt: event.occurredAt,
    sourceEventId: event.id,
  };
  return updateMeaningfulEvent({
    ...state,
    meaningfulEvents: appendUniqueBySourceEvent(state.meaningfulEvents, meaningfulEvent),
  }, event);
};

const projectCareShown = (state: RelationshipState, event: CharacterEvent): RelationshipState => {
  // Care can warm a neutral relationship, but it cannot erase strain,
  // complete repair, or advance the relationship stage.
  const tone = state.tone === "neutral" ? "warm" : state.tone;
  return updateMeaningfulEvent({ ...state, tone }, event);
};

const projectMilestoneReached = (state: RelationshipState, event: CharacterEvent): RelationshipState => {
  const milestone: RelationshipMilestone = {
    id: event.id,
    summary: event.summary,
    reachedAt: event.occurredAt,
    sourceEventId: event.id,
  };
  return updateMeaningfulEvent({
    ...state,
    milestones: appendUniqueBySourceEvent(state.milestones, milestone),
  }, event);
};

/**
 * Applies one explicit relation-scoped CharacterEvent without side effects.
 * Unknown or inferred events never change relationship stage, tone, loops, or
 * boundaries. A mismatched relation is ignored rather than merged.
 */
export const projectRelationshipState = (
  previousState: RelationshipState | undefined,
  event: CharacterEvent,
): RelationshipState | undefined => {
  if (previousState && !isSameRelationshipScope(previousState, event)) return previousState;
  if (!previousState && !isTrustedExplicitEvent(event)) return undefined;

  let state = previousState || createInitialState(event);
  if (!isTrustedExplicitEvent(event)) return state;

  switch (event.kind) {
    case "relationship_created":
    case "offline_story_completed":
      return updateMeaningfulEvent(state, event);

    case "promise_made": {
      const loopId = getPromiseLoopId(event);
      const loop: RelationshipOpenLoop = {
        id: loopId,
        kind: "promise",
        description: event.summary,
        createdAt: event.occurredAt,
        sourceEventId: event.id,
      };
      const openLoops = state.openLoops.some((item) => item.id === loopId)
        ? state.openLoops
        : [...state.openLoops, loop];
      return updateMeaningfulEvent({ ...state, openLoops }, event);
    }

    case "promise_kept": {
      const reference = getPromiseReference(event);
      // No reference means no safe way to decide which promise was kept.
      const openLoops = reference
        ? state.openLoops.filter((item) => item.id !== reference)
        : state.openLoops;
      return updateMeaningfulEvent({ ...state, openLoops }, event);
    }

    case "conflict":
      return updateMeaningfulEvent({ ...state, tone: "strained" }, event);

    case "repair":
      return updateMeaningfulEvent({ ...state, tone: state.tone === "strained" ? "repairing" : "warm" }, event);

    case "boundary_set": {
      const boundaries = state.boundaries.includes(event.summary)
        ? state.boundaries
        : [...state.boundaries, event.summary];
      return updateMeaningfulEvent({ ...state, boundaries }, event);
    }

    case "habit_formed":
      return projectHabitFormed(state, event);

    case "meaningful_share":
      return projectMeaningfulShare(state, event);

    case "care_shown":
      return projectCareShown(state, event);

    case "milestone_reached":
      return projectMilestoneReached(state, event);

    default:
      return state;
  }
};
