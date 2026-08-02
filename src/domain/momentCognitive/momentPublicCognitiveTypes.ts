import type { Character } from "../../types";
import type { CharacterRoutine } from "../characterLife/characterRoutine/characterRoutineTypes";
import type { CharacterEvent } from "../characterLife/characterEventTypes";
import type { CharacterCognitiveRoutineContext } from "../characterCognitive/characterCognitiveTypes";
import type { MomentTopicRecord } from "../moments/momentGeneration/momentTopicTypes";

export const MOMENT_PUBLIC_COGNITIVE_CONTEXT_SCHEMA_VERSION = 1;

/** Only explicitly public records can enter the Moment public projection. */
export type MomentPublicVisibility = "public" | "relationship" | "private";

export interface MomentPublicCharacterProfile {
  name: Character["name"];
  age?: Character["age"];
  gender?: Character["gender"];
  mbti?: Character["mbti"];
  personality: Character["personality"];
  backstory: Character["backstory"];
}

export interface MomentPublicHistoryCandidate {
  /** Used only to keep one character's public feed separate from another's. */
  characterId: string;
  visibility?: MomentPublicVisibility;
  authorName: string;
  content: string;
  timestamp: number;
  imageDescription?: string;
}

export interface MomentPublicHistoryItem {
  authorName: string;
  content: string;
  timestamp: number;
  imageDescription?: string;
}

export interface MomentPublicCommentCandidate {
  /** Used only to keep one character's comment history separate from another's. */
  characterId: string;
  visibility?: MomentPublicVisibility;
  authorName: string;
  content: string;
  timestamp: number;
}

export interface MomentPublicCommentItem {
  authorName: string;
  content: string;
  timestamp: number;
}

export interface MomentPublicEventCandidate {
  event: CharacterEvent;
  /** Omitted visibility is unknown and therefore denied. */
  visibility?: MomentPublicVisibility;
  /** Required when a relationship-scoped fact is explicitly authorized for public use. */
  explicitlyAuthorized?: boolean;
  /** Prevents a relationship event from becoming public through an accidental label. */
  isRelationshipScoped?: boolean;
}

export interface MomentPublicEvent {
  kind: CharacterEvent["kind"];
  summary: CharacterEvent["summary"];
  occurredAt: CharacterEvent["occurredAt"];
  confidence: CharacterEvent["confidence"];
}

export interface MomentPublicFactCandidate {
  characterId: string;
  content: string;
  visibility?: MomentPublicVisibility;
  /** Shared or relationship-derived facts require explicit public authorization. */
  isRelationshipScoped?: boolean;
  explicitlyAuthorized?: boolean;
}

export interface MomentPublicFact {
  content: string;
}

export interface MomentPublicBehaviorConstraintCandidate {
  description: string;
  visibility?: MomentPublicVisibility;
}

export interface MomentPublicBehaviorConstraint {
  description: string;
}

/**
 * Generation-only hints. This projection deliberately contains no Moment,
 * character, relationship, or storage identifiers.
 */
export interface MomentPublicTopicContext {
  recentTopics: readonly string[];
  repeatedTopics: readonly string[];
  cooldownTopics: readonly string[];
}

/** Prompt-safe routine signal; configuration and identity remain private. */
export type MomentPublicRoutineContext = CharacterCognitiveRoutineContext;

export interface MomentPublicTimeContextInput {
  now: number;
  date?: string;
  time?: string;
  timezone?: string;
  period?: string;
}

export interface MomentPublicTimeContext {
  now: number;
  date: string;
  time: string;
  timezone?: string;
  period?: string;
}

/**
 * Moment's own public-expression snapshot. It intentionally has no identity,
 * relationship, conversation, Memory, InnerVoice, or OfflineStory fields.
 */
export interface MomentPublicCognitiveContext {
  schemaVersion: typeof MOMENT_PUBLIC_COGNITIVE_CONTEXT_SCHEMA_VERSION;
  createdAt: number;
  publicCharacterProfile: MomentPublicCharacterProfile;
  publicMomentHistory: readonly MomentPublicHistoryItem[];
  publicCommentHistory: readonly MomentPublicCommentItem[];
  authorizedPublicFacts: readonly MomentPublicFact[];
  publicEvents: readonly MomentPublicEvent[];
  publicBehaviorConstraints: readonly MomentPublicBehaviorConstraint[];
  topicContext?: MomentPublicTopicContext;
  routineContext?: MomentPublicRoutineContext;
  currentTime: MomentPublicTimeContext;
}

export interface BuildMomentPublicCognitiveContextInput {
  character: Character;
  publicMomentHistory?: readonly MomentPublicHistoryCandidate[];
  publicCommentHistory?: readonly MomentPublicCommentCandidate[];
  publicFacts?: readonly MomentPublicFactCandidate[];
  publicEvents?: readonly MomentPublicEventCandidate[];
  publicBehaviorConstraints?: readonly MomentPublicBehaviorConstraintCandidate[];
  topicHistory?: readonly MomentTopicRecord[];
  routine?: CharacterRoutine;
  currentTime: MomentPublicTimeContextInput;
}
