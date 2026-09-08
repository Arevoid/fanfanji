import type { CharacterEventKind } from "../characterLife/characterEventTypes";
import type { Message, OfflineStory } from "../../types";
import {
  canCreateCharacterEventFromOfflineStory,
  classifyOfflineStoryFactLevel,
  type OfflineStoryFactLevel,
} from "./offlineStoryFactPolicy";

export const OFFLINE_STORY_COMPLETED_EVENT_KIND = "offline_story_completed" satisfies CharacterEventKind;

export interface OfflineStoryEventPolicyInput {
  story: OfflineStory;
  /** Completion is explicit because OfflineStory does not yet persist a completion state. */
  isCompleted?: boolean;
  userConfirmed?: boolean;
  sourceMessages?: readonly Message[];
  /** Future multi-character relation scope. It is not persisted on OfflineStory yet. */
  participantRelationIds?: readonly string[];
  /** Previously persisted event source keys for the same relation. */
  recordedSourceKeys?: readonly string[];
}

export interface OfflineStoryEventEligibility {
  allowed: boolean;
  kind: typeof OFFLINE_STORY_COMPLETED_EVENT_KIND;
  storyId: string;
  relationId?: string;
  factLevel: OfflineStoryFactLevel;
  confidence: number;
  /** Per-story source key: never use a mutable story title as a factual event summary or dedupe key. */
  sourceKey: string;
  duplicate: boolean;
  reason?: "story_incomplete" | "fact_policy_rejected" | "duplicate_completion";
}

export const getOfflineStoryCompletionSourceKey = (storyId: string): string =>
  `offline_story:${storyId}:completed`;

const hasSupportedParticipantScope = (input: OfflineStoryEventPolicyInput): boolean => {
  const participantIds = Array.from(new Set((input.story.characterIds || [input.story.characterId]).filter(Boolean)));
  if (participantIds.length <= 1) return true;
  return Boolean(input.participantRelationIds && input.participantRelationIds.length === participantIds.length);
};

/**
 * Pure eligibility check only. The caller must still decide when to persist a
 * CharacterEvent; this policy intentionally does not build an event summary.
 */
export const evaluateOfflineStoryCompletedEvent = (
  input: OfflineStoryEventPolicyInput,
): OfflineStoryEventEligibility => {
  const sourceKey = getOfflineStoryCompletionSourceKey(input.story.id);
  const duplicate = Boolean(input.recordedSourceKeys?.includes(sourceKey));
  const factInput = {
    story: input.story,
    userConfirmed: Boolean(input.userConfirmed && input.isCompleted),
    sourceMessages: input.sourceMessages,
    participantRelationIds: input.participantRelationIds,
  };
  const factLevel = classifyOfflineStoryFactLevel(factInput);
  const factAllowed = canCreateCharacterEventFromOfflineStory(factInput);
  const allowed = Boolean(input.isCompleted && factAllowed && hasSupportedParticipantScope(input) && !duplicate);

  return {
    allowed,
    kind: OFFLINE_STORY_COMPLETED_EVENT_KIND,
    storyId: input.story.id,
    relationId: input.story.relationId,
    factLevel,
    confidence: allowed ? 1 : 0,
    sourceKey,
    duplicate,
    reason: !input.isCompleted
      ? "story_incomplete"
      : duplicate
        ? "duplicate_completion"
        : allowed
          ? undefined
          : "fact_policy_rejected",
  };
};
