import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveEventCandidate,
} from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../../../types";

const getProactiveEventVisibility = (event: CharacterEvent): CharacterCognitiveEventCandidate["promptVisibility"] =>
  event.status === "active"
    && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
    ? "safe"
    : "private";

/** Builds an optional relation-scoped snapshot without changing legacy proactive behavior. */
export function buildProactiveCognitiveContext(input: {
  character: Character;
  relationship: CharacterRelationship;
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  occurredAt: number;
}): CharacterCognitiveContext | undefined {
  try {
    return buildCharacterCognitiveContext({
      character: input.character,
      relation: input.relationship,
      memories: input.memories,
      events: input.events.map((event) => ({
        event,
        promptVisibility: getProactiveEventVisibility(event),
      })),
      timeContext: { now: input.occurredAt },
      knowledgeBoundary: createDirectChatKnowledgeBoundary(),
      conversationId: input.relationship.conversationId,
    });
  } catch {
    return undefined;
  }
}
