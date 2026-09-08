import type { OfflineStory } from "../../types";
import type { CharacterLifeScope } from "../characterLife/characterLifeTypes";

export type OfflineStoryRealityStatus =
  | "confirmed"
  | "active"
  | "unconfirmed"
  | "hypothetical"
  | "what-if"
  | "fictional"
  | "ai-generated";

/** Normalized candidate passed to the reality boundary before event creation. */
export interface OfflineStoryEvent {
  storyId: string;
  relationId?: string;
  characterId?: string;
  userIdentityId?: string;
  mode?: OfflineStory["mode"];
  status: OfflineStoryRealityStatus | string;
  source?: string;
  userConfirmed?: boolean;
  occurred?: boolean;
  explicitlyOccurred?: boolean;
  isHypothetical?: boolean;
  isWhatIf?: boolean;
  isFictionalContinuation?: boolean;
  isAiGenerated?: boolean;
}

export interface OfflineStoryRealityDecision {
  allowed: boolean;
  reason: string;
}

const isNonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const hasCompleteScope = (event: OfflineStoryEvent): boolean =>
  isNonEmpty(event.storyId)
  && isNonEmpty(event.relationId)
  && isNonEmpty(event.characterId)
  && isNonEmpty(event.userIdentityId);

const hasScope = (event: OfflineStoryEvent, expectedScope: CharacterLifeScope): boolean =>
  event.relationId === expectedScope.relationId
  && event.characterId === expectedScope.characterId
  && event.userIdentityId === expectedScope.userIdentityId;

const sourceLooksAiGenerated = (source: string): boolean => {
  const normalized = source.trim().toLowerCase();
  return normalized === "ai"
    || normalized === "assistant"
    || normalized === "model"
    || normalized.startsWith("ai:")
    || normalized.startsWith("ai-")
    || normalized.startsWith("assistant:")
    || normalized.startsWith("assistant-")
    || normalized.startsWith("model:")
    || normalized.startsWith("model-")
    || normalized.includes(":ai:")
    || normalized.includes(":assistant:")
    || normalized.includes(":model:")
    || normalized.includes("generated")
    || normalized.includes("inferred")
    || normalized.includes("speculative");
};

const sourceLooksFictional = (source: string): boolean => {
  const normalized = source.trim().toLowerCase();
  return normalized.includes("hypothetical")
    || normalized.includes("what-if")
    || normalized.includes("what_if")
    || normalized.includes("fictional")
    || normalized.includes("director")
    || normalized.includes("if-mode")
    || normalized.includes("if_mode");
};

/**
 * Pure, deny-by-default reality boundary. Only an explicitly confirmed,
 * relation-scoped continue story with a concrete source may create a real
 * CharacterEvent. Director/IF and AI-only branches remain story-local.
 */
export const evaluateOfflineStoryReality = (
  event: OfflineStoryEvent,
  expectedScope?: CharacterLifeScope,
): OfflineStoryRealityDecision => {
  if (!hasCompleteScope(event)) return { allowed: false, reason: "missing_relation_scope" };
  if (expectedScope && !hasScope(event, expectedScope)) {
    return { allowed: false, reason: "relation_scope_mismatch" };
  }
  if (event.isHypothetical || event.status === "hypothetical") {
    return { allowed: false, reason: "hypothetical_story" };
  }
  if (event.isWhatIf || event.status === "what-if" || event.mode === "if") {
    return { allowed: false, reason: "what_if_story" };
  }
  if (event.mode === "director") {
    return { allowed: false, reason: "director_mode" };
  }
  if (event.isFictionalContinuation || event.status === "fictional") {
    return { allowed: false, reason: "fictional_continuation" };
  }
  if (event.isAiGenerated || event.status === "ai-generated") {
    return { allowed: false, reason: "ai_generated_story" };
  }
  if (!event.userConfirmed) return { allowed: false, reason: "user_confirmation_missing" };
  if (event.occurred !== true && event.explicitlyOccurred !== true && event.status !== "confirmed") {
    return { allowed: false, reason: "event_not_explicitly_occurred" };
  }
  if (!isNonEmpty(event.source)) return { allowed: false, reason: "missing_source" };
  if (sourceLooksFictional(event.source)) return { allowed: false, reason: "fictional_source" };
  if (sourceLooksAiGenerated(event.source)) return { allowed: false, reason: "ai_generated_source" };
  if (event.mode !== "continue") return { allowed: false, reason: "unsupported_story_mode" };
  if (event.status !== "confirmed" && event.status !== "active") {
    return { allowed: false, reason: "event_not_confirmed" };
  }
  return { allowed: true, reason: "confirmed_real_offline_event" };
};

export const isOfflineStoryRealityAllowed = (
  event: OfflineStoryEvent,
  expectedScope?: CharacterLifeScope,
): boolean => evaluateOfflineStoryReality(event, expectedScope).allowed;
