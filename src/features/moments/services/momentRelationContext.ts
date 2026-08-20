import type { Character, MemoryItem } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import type { CharacterEvent } from "../../../domain/characterLife/characterEventTypes";
import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import { buildCharacterRoutine } from "../../../domain/characterLife/characterRoutine/characterRoutineBuilder";
import { resolveChatRoutine } from "../../chat/services/chatTurnSettings";
import { buildMomentCognitiveContext } from "./momentCognitiveContext";

export function buildRelationMomentContext(input: {
  character: Character;
  relationship: CharacterRelationship;
  occurredAt: number;
  knowledgeClaims: readonly KnowledgeClaim[];
  memories: readonly MemoryItem[];
  events: readonly CharacterEvent[];
}): CharacterCognitiveContext {
  const confirmedClaimMemories: MemoryItem[] = input.knowledgeClaims
    .filter((claim) => claim.relationId === input.relationship.id
      && claim.characterId === input.relationship.characterId
      && claim.userIdentityId === input.relationship.userIdentityId
      && claim.status === "active"
      && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
    .map((claim) => ({
      id: `moment-claim:${claim.id}`,
      characterId: claim.characterId,
      relationId: claim.relationId,
      content: claim.statement,
      timestamp: claim.recordedAt,
      importance: 5,
    }));
  const explicitManualMemories = input.memories.filter((memory) =>
    memory.characterId === input.character.id
    && memory.relationId === input.relationship.id
    && memory.isManual === true);
  return buildMomentCognitiveContext({
    character: input.character,
    relationship: input.relationship,
    memories: [...confirmedClaimMemories, ...explicitManualMemories],
    events: input.events,
    occurredAt: input.occurredAt,
    routine: resolveChatRoutine(
      buildCharacterRoutine(input.character.routine),
      input.character.enableTimeAwareness !== false,
    ),
  });
}

export function formatMomentSourceText(context: CharacterCognitiveContext): string {
  return [
    context.persona.personality,
    context.persona.backstory,
    ...context.knownFacts.map((fact) => fact.content),
    ...context.recentEvents.map((event) => event.summary),
  ].filter(Boolean).join("\n");
}
