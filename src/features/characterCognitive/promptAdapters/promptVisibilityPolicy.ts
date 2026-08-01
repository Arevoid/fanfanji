import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type {
  CognitivePromptBehaviorConstraint,
  CognitivePromptBoundary,
  CognitivePromptEvent,
  CognitivePromptFact,
  CognitivePromptPersona,
  CognitivePromptRelationship,
  CognitivePromptTimeContext,
  PromptAdapterOptions,
} from "./types";

const DEFAULT_FACT_LIMIT = 8;
const DEFAULT_EVENT_LIMIT = 4;

const bounded = (requested: number | undefined, fallback: number): number =>
  Math.max(0, Math.floor(requested ?? fallback));

export function projectPromptPersona(context: CharacterCognitiveContext): CognitivePromptPersona {
  const { name, age, gender, mbti, personality, backstory } = context.persona;
  return {
    name,
    ...(age === undefined ? {} : { age }),
    ...(gender === undefined ? {} : { gender }),
    ...(mbti === undefined ? {} : { mbti }),
    personality,
    backstory,
  };
}

export function projectPromptRelationship(context: CharacterCognitiveContext): CognitivePromptRelationship {
  const { stage, compressedMemory } = context.relationship;
  return { stage, ...(compressedMemory ? { compressedMemory } : {}) };
}

export function projectPromptTime(context: CharacterCognitiveContext): CognitivePromptTimeContext {
  const { date, time, timezone, period } = context.temporalContext;
  return {
    date,
    time,
    ...(timezone ? { timezone } : {}),
    ...(period ? { period } : {}),
  };
}

export function projectPromptBoundary(context: CharacterCognitiveContext): CognitivePromptBoundary {
  return {
    known: [...context.knowledgeBoundary.known],
    unknown: [...context.knowledgeBoundary.unknown],
    forbidden: [...(context.knowledgeBoundary.forbidden || [])],
    rules: [...(context.knowledgeBoundary.rules || [])],
  };
}

/** Context already admits only scope-matched safe events; drop their IDs/source metadata again for Prompt use. */
export function selectSafePromptEvents(
  context: CharacterCognitiveContext,
  options?: PromptAdapterOptions,
): CognitivePromptEvent[] {
  return [...context.recentEvents]
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, bounded(options?.maxEvents, DEFAULT_EVENT_LIMIT))
    .map(({ kind, summary, occurredAt, confidence }) => ({ kind, summary, occurredAt, confidence }));
}

/** Memory relevance remains caller-owned; this adapter only removes storage identifiers and caps the projection. */
export function selectChatPromptFacts(
  context: CharacterCognitiveContext,
  options?: PromptAdapterOptions,
): CognitivePromptFact[] {
  const relevantMemoryIds = options?.relevantMemoryIds ? new Set(options.relevantMemoryIds) : undefined;
  return context.knownFacts
    .filter((fact) => !relevantMemoryIds || relevantMemoryIds.has(fact.id))
    .slice(0, bounded(options?.maxFacts, DEFAULT_FACT_LIMIT))
    .map(({ content, importance }) => ({ content, ...(importance === undefined ? {} : { importance }) }));
}

/**
 * Memory records currently have no public-visibility contract. Treat every
 * Memory fact as private for Moments until a separate public fact model exists.
 */
export function selectMomentPublicFacts(_context: CharacterCognitiveContext): CognitivePromptFact[] {
  return [];
}

export function selectPromptBehaviorConstraints(
  context: CharacterCognitiveContext,
): CognitivePromptBehaviorConstraint[] {
  return context.behaviorConstraints.map(({ description }) => ({ description }));
}
