import type { Character } from "../../types";
import type { CharacterEvent } from "../characterLife/characterEventTypes";

export const PUBLIC_FORUM_COGNITIVE_CONTEXT_SCHEMA_VERSION = 1;

/** Explicit opt-in is required because existing persisted records have no public visibility contract. */
export type PublicCognitiveVisibility = "public" | "relationship" | "private";

export interface PublicCharacterProfile {
  name: Character["name"];
  age?: Character["age"];
  gender?: Character["gender"];
  mbti?: Character["mbti"];
  personality: Character["personality"];
  backstory: Character["backstory"];
}

export interface PublicCharacterEventCandidate {
  event: CharacterEvent;
  /** Omitted visibility is unknown and therefore denied. */
  visibility?: PublicCognitiveVisibility;
}

export interface PublicForumEvent {
  kind: CharacterEvent["kind"];
  summary: CharacterEvent["summary"];
  occurredAt: CharacterEvent["occurredAt"];
  confidence: CharacterEvent["confidence"];
}

/** Public world content must be explicitly classified by a future WorldBook policy. */
export interface PublicWorldSettingCandidate {
  title: string;
  content: string;
  visibility?: PublicCognitiveVisibility;
}

export interface PublicWorldSetting {
  title: string;
  content: string;
}

export interface PublicForumKnowledgeBoundary {
  known: readonly string[];
  unknown: readonly string[];
  forbidden: readonly string[];
}

export interface PublicForumTimeContextInput {
  now: number;
  date?: string;
  time?: string;
  timezone?: string;
  period?: string;
}

export interface PublicForumTimeContext {
  now: number;
  date: string;
  time: string;
  timezone?: string;
  period?: string;
}

/**
 * A public-only cognitive snapshot. It intentionally contains no identity,
 * relationship, conversation, Memory, InnerVoice, or OfflineStory fields.
 */
export interface PublicForumCognitiveContext {
  schemaVersion: typeof PUBLIC_FORUM_COGNITIVE_CONTEXT_SCHEMA_VERSION;
  createdAt: number;
  publicCharacterProfile: PublicCharacterProfile;
  publicEvents: readonly PublicForumEvent[];
  publicWorldSettings: readonly PublicWorldSetting[];
  publicKnowledgeBoundary: PublicForumKnowledgeBoundary;
  currentTime: PublicForumTimeContext;
}

export interface BuildPublicForumCognitiveContextInput {
  character: Character;
  events?: readonly PublicCharacterEventCandidate[];
  worldSettings?: readonly PublicWorldSettingCandidate[];
  currentTime: PublicForumTimeContextInput;
  publicKnowledgeBoundary?: Partial<PublicForumKnowledgeBoundary>;
}
