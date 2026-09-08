import type { MemoryItem } from "../../types";
import type {
  CharacterCognitiveEventCandidate,
  CharacterCognitiveIdentityScope,
  CharacterCognitiveKnowledgeBoundary,
  CharacterCognitiveKnownFact,
  CharacterCognitiveRecentEvent,
} from "./characterCognitiveTypes";

/**
 * Structured, read-only counterpart to the existing direct-chat knowledge
 * boundary. It is context metadata only and is never rendered into a prompt
 * during Phase 2.
 */
export function createDirectChatKnowledgeBoundary(): CharacterCognitiveKnowledgeBoundary {
  return {
    known: ["The current direct conversation and explicitly scoped evidence."],
    unknown: ["Private facts from other user identities, relations, and characters."],
    forbidden: ["Unverified shared scenes, locations, actions, and user experiences."],
  };
}

/**
 * A direct cognitive context is stricter than legacy reads: unscoped Memory
 * must first be assigned by relationship migration and can never become a
 * wildcard for every identity of the same character.
 */
export function isMemoryVisibleToCognitiveScope(
  memory: MemoryItem,
  scope: CharacterCognitiveIdentityScope,
): boolean {
  return memory.characterId === scope.characterId && memory.relationId === scope.relationId;
}

export function selectKnownFacts(
  memories: readonly MemoryItem[],
  scope: CharacterCognitiveIdentityScope,
): CharacterCognitiveKnownFact[] {
  return memories
    .filter((memory) => isMemoryVisibleToCognitiveScope(memory, scope))
    .map((memory) => ({
      id: memory.id,
      content: memory.content,
      timestamp: memory.timestamp,
      importance: memory.importance,
      source: "memory" as const,
    }));
}

/** Only explicitly safe, fully scope-matched events may enter a context snapshot. */
export function isEventVisibleToCognitiveScope(
  candidate: CharacterCognitiveEventCandidate,
  scope: CharacterCognitiveIdentityScope,
): boolean {
  const { event } = candidate;
  return candidate.promptVisibility === "safe"
    && event.relationId === scope.relationId
    && event.characterId === scope.characterId
    && event.userIdentityId === scope.userIdentityId;
}

export function selectRecentEvents(
  events: readonly CharacterCognitiveEventCandidate[],
  scope: CharacterCognitiveIdentityScope,
): CharacterCognitiveRecentEvent[] {
  return events
    .filter((candidate) => isEventVisibleToCognitiveScope(candidate, scope))
    .map(({ event }) => ({
      id: event.id,
      kind: event.kind,
      summary: event.summary,
      source: event.source,
      occurredAt: event.occurredAt,
      recordedAt: event.recordedAt,
      confidence: event.confidence,
    }));
}
