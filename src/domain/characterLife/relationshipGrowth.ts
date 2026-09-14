import type { CharacterEvent } from "./characterEventTypes";

export const RELATIONSHIP_DIMENSIONS = [
  "familiarity",
  "trust",
  "attachment",
  "comfort",
  "conflict",
  "intimacy",
  "respect",
  "security",
] as const;

export type RelationshipDimension = typeof RELATIONSHIP_DIMENSIONS[number];
export type RelationshipDimensions = Record<RelationshipDimension, number>;

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function createRelationshipDimensions(): RelationshipDimensions {
  return {
    familiarity: 0.1,
    trust: 0.1,
    attachment: 0,
    comfort: 0.1,
    conflict: 0,
    intimacy: 0,
    respect: 0.1,
    security: 0.1,
  };
}

const applyDeltas = (current: RelationshipDimensions, deltas: Partial<RelationshipDimensions>): RelationshipDimensions => {
  const next = { ...current };
  RELATIONSHIP_DIMENSIONS.forEach((dimension) => {
    const delta = deltas[dimension];
    if (delta !== undefined) next[dimension] = clamp(current[dimension] + delta);
  });
  return next;
};

/**
 * Projects bounded, explainable internal growth from explicit events only.
 * This intentionally never changes the macro relationship label.
 */
export function applyRelationshipGrowthEvent(
  current: RelationshipDimensions | undefined,
  event: Pick<CharacterEvent, "kind" | "status" | "confidence">,
): RelationshipDimensions {
  const dimensions = current || createRelationshipDimensions();
  if (event.status !== "active" || event.confidence !== 1) return dimensions;
  switch (event.kind) {
    case "meaningful_share":
      return applyDeltas(dimensions, { familiarity: 0.04, trust: 0.05, comfort: 0.02, respect: 0.02 });
    case "care_shown":
      return applyDeltas(dimensions, { trust: 0.03, attachment: 0.02, security: 0.02 });
    case "promise_made":
      return applyDeltas(dimensions, { trust: 0.01, security: 0.01 });
    case "promise_kept":
      return applyDeltas(dimensions, { trust: 0.06, security: 0.04, respect: 0.02 });
    case "habit_formed":
      return applyDeltas(dimensions, { familiarity: 0.04, comfort: 0.03 });
    case "milestone_reached":
      return applyDeltas(dimensions, { familiarity: 0.03, attachment: 0.04, respect: 0.03 });
    case "conflict":
      return applyDeltas(dimensions, { conflict: 0.15, security: -0.08, comfort: -0.04 });
    case "repair":
      return applyDeltas(dimensions, { conflict: -0.08, security: 0.06, comfort: 0.04, trust: 0.02 });
    case "boundary_set":
      return applyDeltas(dimensions, { respect: 0.03, security: 0.02 });
    default:
      return dimensions;
  }
}
