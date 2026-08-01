import type {
  MomentPublicBehaviorConstraintCandidate,
  MomentPublicCommentCandidate,
  MomentPublicEventCandidate,
  MomentPublicFactCandidate,
  MomentPublicHistoryCandidate,
  MomentPublicVisibility,
} from "./momentPublicCognitiveTypes";

export interface MomentPublicVisibilityCandidate {
  visibility?: MomentPublicVisibility;
  explicitlyAuthorized?: boolean;
  isRelationshipScoped?: boolean;
}

/** Unknown, relationship-scoped, and private sources are denied by default. */
export function canExposeToMomentPublicContext(
  candidate: MomentPublicVisibilityCandidate | undefined,
): boolean {
  if (candidate?.visibility !== "public") return false;
  if (candidate.isRelationshipScoped && candidate.explicitlyAuthorized !== true) return false;
  return true;
}

export function selectPublicMomentHistory(
  history: readonly MomentPublicHistoryCandidate[],
  characterId: string,
) {
  return history
    .filter((item) => item.characterId === characterId && canExposeToMomentPublicContext(item))
    .map(({ authorName, content, timestamp, imageDescription }) => ({
      authorName,
      content,
      timestamp,
      ...(imageDescription ? { imageDescription } : {}),
    }));
}

export function selectPublicMomentComments(
  comments: readonly MomentPublicCommentCandidate[],
  characterId: string,
) {
  return comments
    .filter((item) => item.characterId === characterId && canExposeToMomentPublicContext(item))
    .map(({ authorName, content, timestamp }) => ({ authorName, content, timestamp }));
}

export function selectAuthorizedPublicFacts(
  facts: readonly MomentPublicFactCandidate[],
  characterId: string,
) {
  return facts
    .filter((fact) => fact.characterId === characterId && canExposeToMomentPublicContext(fact))
    .map(({ content }) => ({ content }));
}

export function selectPublicMomentEvents(
  events: readonly MomentPublicEventCandidate[],
  characterId: string,
) {
  return events
    .filter(({ event, ...candidate }) => event.characterId === characterId && canExposeToMomentPublicContext(candidate))
    .map(({ event }) => ({
      kind: event.kind,
      summary: event.summary,
      occurredAt: event.occurredAt,
      confidence: event.confidence,
    }));
}

export function selectPublicBehaviorConstraints(
  constraints: readonly MomentPublicBehaviorConstraintCandidate[],
) {
  return constraints
    .filter(canExposeToMomentPublicContext)
    .map(({ description }) => ({ description }));
}
