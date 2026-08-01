import type { CharacterEvent } from "./characterEventTypes";
import {
  RELATIONSHIP_STATE_PROJECTION_VERSION,
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

    default:
      return state;
  }
};
