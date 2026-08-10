import type { Message, OfflineStory } from "../../types";

/**
 * Offline stories are private by default. Continue stories are confirmed when
 * the user ends them; Director and IF branches require a settings sync action.
 */
export type OfflineStoryFactLevel = "story_only" | "memory_eligible" | "event_eligible";

export interface OfflineStoryFactPolicyInput {
  story: OfflineStory;
  /** The sync action is an explicit confirmation that this continuation is complete. */
  userConfirmed?: boolean;
  /** Continue stories may sync on exit; fictional branches require settings confirmation. */
  syncIntent?: "automatic_end" | "manual_settings";
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

const hasSafeConfirmedGroupScope = (input: OfflineStoryFactPolicyInput): boolean => {
  const participantIds = Array.from(new Set((input.story.characterIds || []).filter(Boolean)));
  const relationIds = Array.from(new Set((input.participantRelationIds || []).filter(Boolean)));
  return Boolean(
    input.userConfirmed
    && !input.story.relationId
    && participantIds.length > 0
    && !participantIds.includes(input.story.characterId)
    && relationIds.length === participantIds.length
    && hasConfirmedUserContribution(input.sourceMessages),
  );
};

const hasSafeConfirmedScope = (input: OfflineStoryFactPolicyInput): boolean => {
  const { story } = input;
  return Boolean(
    input.userConfirmed
    && hasDirectRelationScope(story)
    && isSingleCharacterStory(story)
    && hasConfirmedUserContribution(input.sourceMessages),
  );
};

/**
 * Memory sync is intentionally narrower than story creation: Director and IF
 * modes remain fictional until a manual settings sync, and AI-only plots have
 * no user-authored evidence to persist.
 */
export const canSyncOfflineStoryToMemory = (input: OfflineStoryFactPolicyInput): boolean => {
  if (!hasSafeConfirmedScope(input) && !hasSafeConfirmedGroupScope(input)) return false;
  if (input.story.mode === "continue") return true;
  return input.syncIntent === "manual_settings";
};

/**
 * This phase does not create events. It exposes the stricter future boundary
 * so callers cannot treat a multi-character story as a relationship fact until
 * participant relation scopes exist in the data model.
 */
export const canCreateCharacterEventFromOfflineStory = (input: OfflineStoryFactPolicyInput): boolean =>
  hasSafeConfirmedScope(input) && input.story.mode === "continue";

export const classifyOfflineStoryFactLevel = (input: OfflineStoryFactPolicyInput): OfflineStoryFactLevel => {
  if (!canSyncOfflineStoryToMemory(input)) return "story_only";
  return canCreateCharacterEventFromOfflineStory(input) ? "event_eligible" : "memory_eligible";
};
