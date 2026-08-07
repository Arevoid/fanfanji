import type {
  MomentPublicBehaviorConstraintCandidate,
  MomentPublicCommentCandidate,
  MomentPublicEventCandidate,
  MomentPublicFactCandidate,
  MomentPublicHistoryCandidate,
  MomentPublicVisibility,
} from "./momentPublicCognitiveTypes";
import type { CharacterEvent } from "../characterLife/characterEventTypes";
import {
  evaluatePublicShareAuthorization,
  type PublicShareAuthorization,
  type PublicShareAuthorizationTarget,
} from "../publicCognitive/publicShareAuthorization";

export interface MomentPublicVisibilityCandidate {
  visibility?: MomentPublicVisibility;
  /** @deprecated Boolean opt-in is ignored; use authorization.status=authorized. */
  explicitlyAuthorized?: boolean;
  isRelationshipScoped?: boolean;
  authorization?: PublicShareAuthorization;
  shareAuthorization?: PublicShareAuthorization;
}

const resolveAuthorization = (
  candidate: MomentPublicVisibilityCandidate,
): PublicShareAuthorization | undefined => candidate.authorization || candidate.shareAuthorization;

const isAuthorizedRelationshipShare = (
  candidate: MomentPublicVisibilityCandidate,
  target: PublicShareAuthorizationTarget | undefined,
): boolean => {
  if (!candidate.isRelationshipScoped) return true;
  if (!target) return false;
  return evaluatePublicShareAuthorization(resolveAuthorization(candidate), target).allowed;
};

/** Unknown, relationship-scoped, and private sources are denied by default. */
export function canExposeToMomentPublicContext(
  candidate: MomentPublicVisibilityCandidate | undefined,
  target?: PublicShareAuthorizationTarget,
): boolean {
  if (candidate?.visibility !== "public") return false;
  return isAuthorizedRelationshipShare(candidate, target);
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
    .filter((fact) => fact.characterId === characterId && canExposeToMomentPublicContext(fact, fact.isRelationshipScoped
      ? {
        sourceEventId: fact.sourceEventId || "",
        relationId: fact.authorization?.relationId || fact.shareAuthorization?.relationId || "",
        characterId: fact.characterId,
        userIdentityId: fact.authorization?.userIdentityId || fact.shareAuthorization?.userIdentityId || "",
        scope: "moment",
      }
      : undefined))
    .map(({ content }) => ({ content }));
}

export function selectPublicMomentEvents(
  events: readonly MomentPublicEventCandidate[],
  characterId: string,
) {
  return events
    .filter(({ event, ...candidate }) => event.characterId === characterId && canExposeToMomentPublicContext(candidate, {
      sourceEventId: event.id,
      relationId: event.relationId,
      characterId: event.characterId,
      userIdentityId: event.userIdentityId,
      scope: "moment",
    }))
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
    .filter((candidate) => canExposeToMomentPublicContext(candidate))
    .map(({ description }) => ({ description }));
}
