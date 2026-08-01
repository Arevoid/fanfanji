import type { Message, OfflineStory } from "../../types";

/**
 * Offline stories are a private writing space by default. A fact may leave that
 * space only after the user explicitly confirms a direct online continuation.
 */
export type OfflineStoryFactLevel = "story_only" | "memory_eligible" | "event_eligible";

export interface OfflineStoryFactPolicyInput {
  story: OfflineStory;
  /** The sync action is an explicit confirmation that this continuation is complete. */
  userConfirmed?: boolean;
  /** Story messages written after any imported online context. */
  sourceMessages?: readonly Message[];
  /** Reserved for a future multi-character model; absent scope must never create relationship facts. */
  participantRelationIds?: readonly string[];
}

const hasDirectRelationScope = (story: OfflineStory): boolean => Boolean(story.relationId?.trim());

const isSingleCharacterStory = (story: OfflineStory): boolean => {
  const participantIds = Array.from(new Set((story.characterIds || [story.characterId]).filter(Boolean)));
  return participantIds.length === 1 && participantIds[0] === story.characterId;
};

const hasConfirmedUserContribution = (sourceMessages: readonly Message[] | undefined): boolean =>
  Boolean(sourceMessages?.some((message) =>
    message.sender === "user"
    && !message.isImportedContext
    && !message.id.startsWith("offline-import-")
    && Boolean(message.content?.trim()),
  ));

const isExplicitDirectContinuation = (input: OfflineStoryFactPolicyInput): boolean => {
  const { story } = input;
  return Boolean(
    input.userConfirmed
    && story.mode === "continue"
    && hasDirectRelationScope(story)
    && isSingleCharacterStory(story)
    && hasConfirmedUserContribution(input.sourceMessages),
  );
};

/**
 * Memory sync is intentionally narrower than story creation: director and IF
 * modes are fictional workspaces, and AI-only continuations have no user
 * confirmed fact to persist.
 */
export const canSyncOfflineStoryToMemory = (input: OfflineStoryFactPolicyInput): boolean =>
  isExplicitDirectContinuation(input);

/**
 * This phase does not create events. It exposes the stricter future boundary
 * so callers cannot treat a multi-character story as a relationship fact until
 * participant relation scopes exist in the data model.
 */
export const canCreateCharacterEventFromOfflineStory = (input: OfflineStoryFactPolicyInput): boolean =>
  isExplicitDirectContinuation(input);

export const classifyOfflineStoryFactLevel = (input: OfflineStoryFactPolicyInput): OfflineStoryFactLevel => {
  if (!canSyncOfflineStoryToMemory(input)) return "story_only";
  return canCreateCharacterEventFromOfflineStory(input) ? "event_eligible" : "memory_eligible";
};
