import { buildCharacterCognitiveContext } from "../../../domain/characterCognitive/contextBuilder";
import { createDirectChatKnowledgeBoundary } from "../../../domain/characterCognitive/contextPolicy";
import {
  classifyTimeOfDay,
  getCurrentRoutineState,
} from "../../../domain/characterLife/characterRoutine/characterRoutinePolicy";
import type {
  CharacterCognitiveContext,
  CharacterCognitiveEventCandidate,
} from "../../../domain/characterCognitive/characterCognitiveTypes";
import type {
  CharacterRoutine,
  CharacterRoutinePeriod,
  CharacterRoutineState,
} from "../../../domain/characterLife/characterRoutine/characterRoutineTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Character, MemoryItem } from "../../../types";

const getProactiveEventVisibility = (event: CharacterEvent): CharacterCognitiveEventCandidate["promptVisibility"] =>
  event.status === "active"
    && (event.kind === "relationship_created" || event.kind === "offline_story_completed")
    ? "safe"
    : "private";

/** A prompt-safe routine signal; the routine configuration itself never leaves this service. */
export interface ProactiveRoutineContext {
  period: CharacterRoutinePeriod;
  state: CharacterRoutineState;
}

export type ProactiveCognitiveContext = CharacterCognitiveContext & {
  routineContext?: ProactiveRoutineContext;
};

/** Builds an optional relation-scoped snapshot without changing legacy proactive behavior. */
export function buildProactiveCognitiveContext(input: {
  character: Character;
  relationship: CharacterRelationship;
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
  occurredAt: number;
  /** Optional routine configuration used only to derive the current prompt hint. */
  routine?: CharacterRoutine;
}): ProactiveCognitiveContext | undefined {
  try {
    const context = buildCharacterCognitiveContext({
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
    if (!input.routine) return context;

    return {
      ...context,
      routineContext: {
        period: classifyTimeOfDay(input.occurredAt, input.routine.timezone),
        state: getCurrentRoutineState(input.routine, input.occurredAt),
      },
    };
  } catch {
    return undefined;
  }
}
