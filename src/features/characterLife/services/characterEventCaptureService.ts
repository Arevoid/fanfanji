import type { Message, OfflineStory } from "../../../types";
import { append, removeByRelations } from "../../../core/storage/repositories/characterEventRepository";
import type { StorageWriteResult } from "../../../core/storage/storageTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import {
  CHARACTER_EVENT_SCHEMA_VERSION,
  type CharacterEventInput,
} from "../../../domain/characterLife/characterEventTypes";
import { captureOfflineStoryCompletedEvent as captureGuardedOfflineStoryCompletedEvent } from "./offlineStoryEventCaptureService";

export const CHARACTER_EVENT_SOURCE = {
  relationship: "relationship",
  offlineStory: "offline_story",
} as const;

const getEventId = (relationId: string, kind: string) =>
  `character-event:${relationId}:${kind}`;

/** Builds the deterministic event for an explicitly created relationship. */
export function buildRelationshipCreatedEvent(
  relationship: CharacterRelationship,
  recordedAt = Date.now(),
): CharacterEventInput {
  return {
    id: getEventId(relationship.id, "relationship_created"),
    relationId: relationship.id,
    characterId: relationship.characterId,
    userIdentityId: relationship.userIdentityId,
    kind: "relationship_created",
    summary: "Relationship created",
    source: CHARACTER_EVENT_SOURCE.relationship,
    occurredAt: relationship.createdAt,
    recordedAt,
    confidence: 1,
    status: "active",
    schemaVersion: CHARACTER_EVENT_SCHEMA_VERSION,
  };
}

/**
 * Builds the event only for relation-owned stories. Group stories and legacy
 * stories without a relation are intentionally not assigned to a relation.
 */
export function buildOfflineStoryCompletedEvent(
  story: OfflineStory,
  userIdentityId: string | undefined,
  recordedAt = Date.now(),
): CharacterEventInput | undefined {
  if (!story.relationId || !userIdentityId) return undefined;
  return {
    id: getEventId(story.relationId, "offline_story_completed"),
    relationId: story.relationId,
    characterId: story.characterId,
    userIdentityId,
    kind: "offline_story_completed",
    summary: `Offline story completed: ${story.title}`,
    source: CHARACTER_EVENT_SOURCE.offlineStory,
    occurredAt: story.archivedAt ?? story.updatedAt,
    recordedAt,
    confidence: 1,
    status: "active",
    schemaVersion: CHARACTER_EVENT_SCHEMA_VERSION,
  };
}

export const captureRelationshipCreatedEvent = (
  relationship: CharacterRelationship,
  recordedAt = Date.now(),
): StorageWriteResult => append(buildRelationshipCreatedEvent(relationship, recordedAt));

export const captureOfflineStoryCompletedEvent = (
  story: OfflineStory,
  userIdentityId: string | undefined,
  recordedAt = Date.now(),
  options?: {
    sourceMessages?: readonly Message[];
    userConfirmed?: boolean;
    confirmedFacts?: readonly string[];
  },
): StorageWriteResult => {
  // Keep the legacy signature fail-closed. Callers that need to persist an
  // OfflineStory event must provide the explicit confirmation/evidence inputs
  // so the centralized reality boundary can run before CharacterEvent append.
  if (!options?.userConfirmed) return { success: false, error: "write" };
  const result = captureGuardedOfflineStoryCompletedEvent({
    story,
    userIdentityId,
    sourceMessages: options.sourceMessages ?? story.messages,
    userConfirmed: options.userConfirmed,
    confirmedFacts: options.confirmedFacts,
    recordedAt,
  });
  return result.writeResult ?? { success: false, error: "write" };
};

export const removeCharacterLifeEventsForRelations = (
  relationIds: readonly string[],
): StorageWriteResult => removeByRelations(relationIds);
