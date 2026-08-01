import type { Message, OfflineStory } from "../../../types";
import { append, listByRelation } from "../../../core/storage/repositories/characterEventRepository";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";
import {
  evaluateOfflineStoryCompletedEvent,
  type OfflineStoryEventEligibility,
} from "../../../domain/offlineStory/offlineStoryEventPolicy";
import { CHARACTER_EVENT_SCHEMA_VERSION, type CharacterEventInput } from "../../../domain/characterLife/characterEventTypes";

export interface CaptureOfflineStoryCompletedEventInput {
  story: OfflineStory;
  userIdentityId?: string;
  sourceMessages: readonly Message[];
  /** Only the explicit user sync action confirms a story for event capture. */
  userConfirmed: boolean;
  recordedAt?: number;
}

export interface OfflineStoryEventCaptureResult {
  created: boolean;
  eligibility: OfflineStoryEventEligibility;
  writeResult?: StorageWriteResult;
}

const getOfflineStoryCompletedEventId = (relationId: string, storyId: string): string =>
  `character-event:${relationId}:offline_story:${storyId}:completed`;

const buildCompletedEvent = (
  input: CaptureOfflineStoryCompletedEventInput,
  eligibility: OfflineStoryEventEligibility,
): CharacterEventInput | undefined => {
  const { story, userIdentityId } = input;
  if (!eligibility.allowed || !story.relationId || !userIdentityId) return undefined;

  return {
    id: getOfflineStoryCompletedEventId(story.relationId, story.id),
    relationId: story.relationId,
    characterId: story.characterId,
    userIdentityId,
    kind: eligibility.kind,
    // A stable boundary record, never a title or AI-generated plot detail.
    summary: "用户与角色完成了一次已确认的线下互动剧情。",
    // CharacterEvent currently stores a source string. This scoped key encodes
    // offline-story + story id + completed action without exposing plot text.
    source: eligibility.sourceKey,
    occurredAt: story.archivedAt ?? story.updatedAt,
    recordedAt: input.recordedAt ?? Date.now(),
    confidence: eligibility.confidence,
    status: "active",
    schemaVersion: CHARACTER_EVENT_SCHEMA_VERSION,
  };
};

/**
 * Persist exactly one completion event for one relation-scoped story. This is
 * intentionally invoked only by an explicit confirmation path, after the
 * story's Memory handoff has completed successfully.
 */
export const captureOfflineStoryCompletedEvent = (
  input: CaptureOfflineStoryCompletedEventInput,
): OfflineStoryEventCaptureResult => {
  const relationEvents = input.story.relationId
    ? listByRelation(input.story.relationId)
    : [];
  const eligibility = evaluateOfflineStoryCompletedEvent({
    story: input.story,
    isCompleted: Boolean(input.story.archivedAt),
    userConfirmed: input.userConfirmed,
    sourceMessages: input.sourceMessages,
    recordedSourceKeys: relationEvents.map((event) => event.source),
  });
  const event = buildCompletedEvent(input, eligibility);
  if (!event) return { created: false, eligibility };

  const writeResult = append(event);
  return { created: writeResult.success, eligibility, writeResult };
};
