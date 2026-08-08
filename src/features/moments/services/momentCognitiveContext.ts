import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import type {
  CharacterRoutine,
} from "../../../domain/characterLife/characterRoutine/characterRoutineTypes";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveEventCandidate,
} from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import { isCharacterEventTrusted } from "../../../domain/characterLife/characterEventPolicy";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../../../types";

/**
 * A Moment may draw on confirmed events from its own relationship.  This is
 * deliberately broader than the old two-event allowlist: users can choose to
 * express an established relationship or a confirmed offline experience
 * publicly.  The context builder still enforces the exact relation, character
 * and user-identity scope before anything reaches a prompt.
 */
const getMomentEventVisibility = (event: CharacterEvent): CharacterCognitiveEventCandidate["promptVisibility"] =>
  isCharacterEventTrusted(event) ? "safe" : "private";

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
  routine?: CharacterRoutine;
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
    routine: input.routine,
  });
}
