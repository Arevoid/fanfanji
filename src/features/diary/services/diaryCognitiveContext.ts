import type { Character } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import type { CharacterCognitiveContext, CharacterCognitiveEventCandidate } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { buildRelationshipCognitiveProjection } from "../../characterLife/services/relationshipCognitiveProjectionService";
import { buildCharacterRoutine } from "../../../domain/characterLife/characterRoutine/characterRoutineBuilder";

/**
 * Only Truth-layer admitted CharacterEvents may project into Diary. Raw
 * OfflineStory records, Memory, Relationship internals and unconfirmed
 * screenplay content stay outside this boundary.
 */
export const isDiaryEventEligible = (event: CharacterEvent): boolean => {
  if (event.status !== "active") return false;
  if (event.kind === "relationship_created") return event.source === "relationship";
  if (event.kind === "offline_story_completed") {
    return event.source === "offline_story" || event.source.startsWith("offline_story:");
  }
  return false;
};

export const getDiaryEventVisibility = (
  event: CharacterEvent,
): CharacterCognitiveEventCandidate["promptVisibility"] =>
  isDiaryEventEligible(event) ? "safe" : "private";

/** Build the relation-scoped, prompt-safe Diary projection for one turn. */
export const buildDiaryCognitiveContext = (input: {
  character: Character;
  relation: CharacterRelationship;
  events: readonly CharacterEvent[];
  now: number;
}): CharacterCognitiveContext => {
  const events: CharacterCognitiveEventCandidate[] = input.events.map((event) => ({
    event,
    promptVisibility: getDiaryEventVisibility(event),
  }));
  const relationshipProjection = buildRelationshipCognitiveProjection({
    relation: input.relation,
    events: input.events,
    now: input.now,
  });
  return buildCharacterCognitiveContext({
    character: input.character,
    relation: input.relation,
    // Diary does not read the user Memory vault as an AI fact source.
    memories: [],
    events,
    timeContext: { now: input.now },
    knowledgeBoundary: createDirectChatKnowledgeBoundary(),
    conversationId: input.relation.conversationId,
    relationshipTimeline: relationshipProjection.timeline,
    routine: buildCharacterRoutine(input.character.routine),
  });
};
