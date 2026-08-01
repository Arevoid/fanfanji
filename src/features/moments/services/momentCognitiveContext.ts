import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveEventCandidate,
} from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../../../types";

const getMomentEventVisibility = (event: CharacterEvent): CharacterCognitiveEventCandidate["promptVisibility"] =>
  event.status === "active"
    && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
    ? "safe"
    : "private";

/**
 * Builds the read-only cognitive snapshot for one Moment AI attempt.
 *
 * This adapter deliberately does not format or otherwise consume the context:
 * Phase 3 only transports it through the Moment generation chain.
 */
export function buildMomentCognitiveContext(input: {
  character: Character;
  relationship: CharacterRelationship;
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  occurredAt: number;
}): CharacterCognitiveContext {
  return buildCharacterCognitiveContext({
    character: input.character,
    relation: input.relationship,
    memories: input.memories,
    events: input.events.map((event) => ({
      event,
      promptVisibility: getMomentEventVisibility(event),
    })),
    timeContext: { now: input.occurredAt },
    knowledgeBoundary: createDirectChatKnowledgeBoundary(),
    conversationId: input.relationship.conversationId,
  });
}
