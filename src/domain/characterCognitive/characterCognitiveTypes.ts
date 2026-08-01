import type { Character, MemoryItem } from "../../types";
import type { CharacterEvent } from "../characterLife/characterEventTypes";
import type {
  CharacterRoutine,
  CharacterRoutinePeriod,
  CharacterRoutineState,
} from "../characterLife/characterRoutine/characterRoutineTypes";
import type { RelationshipTimeline } from "../characterLife/relationshipTimelineTypes";
import type { RelationshipState } from "../characterLife/relationshipStateTypes";
import type { CharacterRelationship, CharacterRelationshipState } from "../relationship/characterRelationship";

export const CHARACTER_COGNITIVE_CONTEXT_SCHEMA_VERSION = 1;

/**
 * A compact, stable persona projection. Relationship facts and UI-specific
 * contact data deliberately stay outside this object.
 */
export interface CharacterCognitivePersona {
  id: Character["id"];
  name: Character["name"];
  age?: Character["age"];
  gender?: Character["gender"];
  mbti?: Character["mbti"];
  personality: Character["personality"];
  backstory: Character["backstory"];
}

export interface CharacterCognitiveIdentityScope {
  characterId: string;
  relationId: string;
  userIdentityId: string;
  conversationId?: string;
}

/** Read-only projection of the existing relationship model, not a new state model. */
export interface CharacterCognitiveRelationshipContext {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  conversationId: string;
  stage: CharacterRelationshipState;
  compressedMemory?: string;
  lastActiveTime?: number;
  scheduledProactiveTime?: number;
  updatedAt: number;
  /** Reserved for the future RelationshipState domain. Phase 1 never populates it. */
  relationshipState?: unknown;
}

/** A compact relation-scoped Memory projection suitable for later prompt adapters. */
export interface CharacterCognitiveKnownFact {
  id: MemoryItem["id"];
  content: MemoryItem["content"];
  timestamp: MemoryItem["timestamp"];
  importance?: MemoryItem["importance"];
  source: "memory";
}

export type CharacterCognitivePromptVisibility = "safe" | "private" | "hidden";

/**
 * CharacterEvent itself intentionally has no prompt contract in Phase 1.
 * Callers must explicitly provide this read-time visibility projection; an
 * omitted or non-safe value is never admitted to cognitive context.
 */
export interface CharacterCognitiveEventCandidate {
  event: CharacterEvent;
  promptVisibility: CharacterCognitivePromptVisibility;
}

export interface CharacterCognitiveRecentEvent {
  id: CharacterEvent["id"];
  kind: CharacterEvent["kind"];
  summary: CharacterEvent["summary"];
  source: CharacterEvent["source"];
  occurredAt: CharacterEvent["occurredAt"];
  recordedAt: CharacterEvent["recordedAt"];
  confidence: CharacterEvent["confidence"];
}

/** Structured counterpart for the existing characterKnowledgeBoundary prompt helper. */
export interface CharacterCognitiveKnowledgeBoundary {
  known: readonly string[];
  unknown: readonly string[];
  forbidden?: readonly string[];
  rules?: readonly string[];
}

/**
 * Request-time temporal facts. Callers can pass already-localized date/time
 * values from the existing time system; ISO fallbacks keep the builder pure.
 */
export interface CharacterCognitiveTimeContextInput {
  now: number;
  date?: string;
  time?: string;
  timezone?: string;
  period?: string;
}

export interface CharacterCognitiveTemporalContext {
  now: number;
  date: string;
  time: string;
  timezone?: string;
  period?: string;
}

/** Prompt-safe routine signal; routine configuration remains outside the snapshot. */
export interface CharacterCognitiveRoutineContext {
  period: CharacterRoutinePeriod;
  state: CharacterRoutineState;
}

/** Metadata only. Phase 1 never derives or adds behavior constraints. */
export interface CharacterCognitiveBehaviorConstraint {
  id: string;
  description: string;
}

/** The read-only, relation-isolated snapshot used by future scene adapters. */
export interface CharacterCognitiveContext {
  schemaVersion: typeof CHARACTER_COGNITIVE_CONTEXT_SCHEMA_VERSION;
  createdAt: number;
  scope: CharacterCognitiveIdentityScope;
  persona: CharacterCognitivePersona;
  relationship: CharacterCognitiveRelationshipContext;
  /** Optional read-only CharacterEvent projection, admitted only for this exact scope. */
  relationshipState?: RelationshipState;
  /** Optional read-only timeline, never persisted or used as a cross-relation lookup. */
  relationshipTimeline?: RelationshipTimeline;
  knownFacts: readonly CharacterCognitiveKnownFact[];
  recentEvents: readonly CharacterCognitiveRecentEvent[];
  temporalContext: CharacterCognitiveTemporalContext;
  routineContext?: CharacterCognitiveRoutineContext;
  knowledgeBoundary: CharacterCognitiveKnowledgeBoundary;
  behaviorConstraints: readonly CharacterCognitiveBehaviorConstraint[];
}

export interface BuildCharacterCognitiveContextInput {
  character: Character;
  relation: CharacterRelationship;
  memories: readonly MemoryItem[];
  events: readonly CharacterCognitiveEventCandidate[];
  timeContext: CharacterCognitiveTimeContextInput;
  knowledgeBoundary: CharacterCognitiveKnowledgeBoundary;
  conversationId?: string;
  behaviorConstraints?: readonly CharacterCognitiveBehaviorConstraint[];
  relationshipTimeline?: RelationshipTimeline;
  routine?: CharacterRoutine;
}
