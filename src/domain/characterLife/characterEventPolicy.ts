import type { CharacterEvent } from "./characterEventTypes";
import type { CharacterLifeScope } from "./characterLifeTypes";

export interface CharacterEventTrustDecision {
  allowed: boolean;
  reason: string;
}

const ACCEPTED_STATUSES = new Set(["active", "confirmed"]);
const REJECTED_SOURCE_MARKERS = [
  "ai",
  "assistant",
  "generated",
  "guess",
  "inferred",
  "inference",
  "llm",
  "model",
  "speculative",
  "speculation",
];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const normalizeSource = (source: string): string => source.trim().toLowerCase();

const sourceHasRejectedMarker = (source: string): boolean => {
  const normalized = normalizeSource(source);
  return REJECTED_SOURCE_MARKERS.some((marker) =>
    new RegExp(`(^|[:_-])${marker}($|[:_-])`).test(normalized));
};

const hasCompleteScope = (event: CharacterEvent): boolean =>
  isNonEmptyString(event.relationId)
  && isNonEmptyString(event.characterId)
  && isNonEmptyString(event.userIdentityId);

const isSameScope = (event: CharacterEvent, scope: CharacterLifeScope): boolean =>
  event.relationId === scope.relationId
  && event.characterId === scope.characterId
  && event.userIdentityId === scope.userIdentityId;

/**
 * Evaluates whether a relation-scoped CharacterEvent is safe for cognitive
 * projection. This is deliberately pure: callers provide an optional target
 * scope when they need to guard against a cross-relation event.
 */
export const evaluateCharacterEventTrust = (
  event: CharacterEvent,
  expectedScope?: CharacterLifeScope,
): CharacterEventTrustDecision => {
  if (!event || !hasCompleteScope(event)) {
    return { allowed: false, reason: "missing_relation_scope" };
  }

  if (expectedScope && !isSameScope(event, expectedScope)) {
    return { allowed: false, reason: "relation_scope_mismatch" };
  }

  if (!isNonEmptyString(event.source)) {
    return { allowed: false, reason: "missing_source" };
  }

  if (sourceHasRejectedMarker(event.source)) {
    return { allowed: false, reason: "ai_or_inferred_source" };
  }

  if (event.status === "inferred" || event.status === "disputed") {
    return { allowed: false, reason: `event_status_${event.status}` };
  }

  if (!ACCEPTED_STATUSES.has(event.status)) {
    return { allowed: false, reason: "event_not_confirmed" };
  }

  if (event.confidence !== 1) {
    return { allowed: false, reason: "event_not_confirmed" };
  }

  return { allowed: true, reason: "confirmed_active_explicit_event" };
};

export const isCharacterEventTrusted = (
  event: CharacterEvent,
  expectedScope?: CharacterLifeScope,
): boolean => evaluateCharacterEventTrust(event, expectedScope).allowed;

export const characterEventPolicy = {
  evaluate: evaluateCharacterEventTrust,
  isTrusted: isCharacterEventTrusted,
};
