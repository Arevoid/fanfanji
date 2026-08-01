import type { CharacterCognitiveContext } from "../../../domain/characterCognitive/characterCognitiveTypes";
import type { MomentPublicCognitiveContext } from "../../../domain/momentCognitive/momentPublicCognitiveTypes";

/**
 * Prompt-safe projections deliberately omit every internal identifier. The
 * adapters are the only supported bridge from a cognitive snapshot to a
 * future prompt formatter.
 */
export interface CognitivePromptPersona {
  name: string;
  age?: string | number;
  gender?: string;
  mbti?: string;
  personality: string;
  backstory: string;
}

export interface CognitivePromptRelationship {
  stage: string;
  compressedMemory?: string;
}

export interface CognitivePromptFact {
  content: string;
  importance?: number;
}

export interface CognitivePromptEvent {
  kind: string;
  summary: string;
  occurredAt: number;
  confidence: number;
}

export interface CognitivePromptTimeContext {
  date: string;
  time: string;
  timezone?: string;
  period?: string;
}

export interface CognitivePromptBoundary {
  known: readonly string[];
  unknown: readonly string[];
  forbidden: readonly string[];
  rules: readonly string[];
}

export interface CognitivePromptBehaviorConstraint {
  description: string;
}

export interface CognitivePromptWorldSetting {
  title: string;
  content: string;
}

export interface PromptAdapterOptions {
  maxFacts?: number;
  maxEvents?: number;
  maxPublicHistory?: number;
  maxPublicComments?: number;
  /** Existing callers may pass their already-ranked Memory IDs without exposing them in adapter output. */
  relevantMemoryIds?: readonly string[];
}

/** Explicit Moment-public input; unknown visibility is denied before this boundary. */
export interface MomentPromptAdapterOptions extends PromptAdapterOptions {
  publicContext?: MomentPublicCognitiveContext;
}

export interface ChatPromptContext {
  persona: CognitivePromptPersona;
  relationship: CognitivePromptRelationship;
  /** Optional relation-scoped projection with all storage metadata removed. */
  relationshipState?: {
    stage: string;
    tone: string;
  };
  relationshipTimeline?: {
    recentEvents: readonly CognitivePromptEvent[];
    openLoops: readonly string[];
    boundaries: readonly string[];
  };
  relevantMemories: readonly CognitivePromptFact[];
  safeEvents: readonly CognitivePromptEvent[];
  boundaries: CognitivePromptBoundary;
  time: CognitivePromptTimeContext;
}

export interface MomentPromptContext {
  persona: CognitivePromptPersona;
  publicFacts: readonly CognitivePromptFact[];
  publicEvents: readonly CognitivePromptEvent[];
  publicWorldKnowledge: readonly CognitivePromptWorldSetting[];
  publicMomentHistory: readonly {
    authorName: string;
    content: string;
    timestamp: number;
    imageDescription?: string;
  }[];
  publicCommentHistory: readonly {
    authorName: string;
    content: string;
    timestamp: number;
  }[];
  behaviorConstraints: readonly CognitivePromptBehaviorConstraint[];
  time: CognitivePromptTimeContext;
}

export interface ProactivePromptContext {
  persona: CognitivePromptPersona;
  relationship: CognitivePromptRelationship;
  /** Optional relation-scoped projection with all storage metadata removed. */
  relationshipState?: {
    stage: string;
    tone: string;
  };
  relationshipTimeline?: {
    recentEvents: readonly CognitivePromptEvent[];
    openLoops: readonly string[];
    boundaries: readonly string[];
    lastMeaningfulEventAt?: number;
  };
  recentMeaningfulEvents: readonly CognitivePromptEvent[];
  openContext: readonly string[];
  boundaries: CognitivePromptBoundary;
  time: CognitivePromptTimeContext;
}

/** A private, relation-safe projection for a character's own diary. */
export interface DiaryPromptContext {
  persona: CognitivePromptPersona;
  relationship: CognitivePromptRelationship;
  safeEvents: readonly CognitivePromptEvent[];
  behaviorConstraints: readonly CognitivePromptBehaviorConstraint[];
  boundaries: CognitivePromptBoundary;
  time: CognitivePromptTimeContext;
}

/** A narrow relation-safe projection for a Forum direct-message reply. */
export interface ForumDirectMessagePromptContext {
  persona: CognitivePromptPersona;
  relationship: CognitivePromptRelationship;
  safeEvents: readonly CognitivePromptEvent[];
  behaviorConstraints: readonly CognitivePromptBehaviorConstraint[];
  boundaries: CognitivePromptBoundary;
  time: CognitivePromptTimeContext;
}

export type CognitivePromptAdapter<TOutput> = (
  context: CharacterCognitiveContext,
  options?: PromptAdapterOptions,
) => TOutput;
