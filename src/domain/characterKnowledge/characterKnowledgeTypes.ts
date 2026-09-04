import type { OfflineStoryFactPolicyInput } from "../offlineStory/offlineStoryFactPolicy";
import type { MemorySourceApp } from "../memory/memoryModel";

export const KNOWLEDGE_CLAIM_SCHEMA_VERSION = 1;
export const CONVERSATION_SUMMARY_SCHEMA_VERSION = 1;
export const CONVERSATION_SUMMARY_PROJECTION_VERSION = 2;
export const BEHAVIOR_CORRECTION_SCHEMA_VERSION = 1;

export interface CharacterTruthScope {
  relationId: string;
  characterId: string;
  userIdentityId: string;
  conversationId?: string;
}

export type KnowledgeKind = "fact" | "preference" | "plan" | "belief" | "hypothesis";
export type KnowledgeSubject = "user" | "character" | "relationship" | "other";
export type TruthStatus = "asserted" | "confirmed" | "inferred" | "disputed" | "retracted" | "legacy_unverified";
export type TemporalStatus = "past" | "present" | "future" | "timeless" | "unknown";
export type KnowledgeSourceKind =
  | "user_message"
  | "automatic_summary"
  | "deterministic_action"
  | "manual"
  | "ooc_correction"
  | "offline_story"
  | "import"
  | "legacy_memory";
export type KnowledgeSourceAuthorship = "user" | "character" | "system" | "unknown";
export type KnowledgeEvidenceForm = "statement" | "question" | "suggestion" | "roleplay" | "action" | "system_instruction";

export interface KnowledgeSourceRef {
  kind: KnowledgeSourceKind;
  authorship: KnowledgeSourceAuthorship;
  /** Product surface that produced this claim; kind remains the evidence form. */
  app?: MemorySourceApp;
  messageIds?: string[];
  eventId?: string;
  storyId?: string;
  sourceRecordId?: string;
  producer: string;
  evidenceKey: string;
}

export interface KnowledgeClaim extends CharacterTruthScope {
  id: string;
  kind: KnowledgeKind;
  subject: KnowledgeSubject;
  statement: string;
  truthStatus: TruthStatus;
  temporalStatus: TemporalStatus;
  source: KnowledgeSourceRef;
  confidence: number;
  /** Optional 1-10 importance supplied by a trusted writer; retrieval derives a safe fallback. */
  importance?: number;
  userConfirmed: boolean;
  /** Manual pause only; the claim remains stored and can be recovered later. */
  recallDisabled?: boolean;
  occurredAt?: number;
  recordedAt: number;
  validFrom?: number;
  validTo?: number;
  supersedesId?: string;
  supersededById?: string;
  retractionReason?: string;
  status: "active" | "retracted";
  visibility: "relation_private";
  schemaVersion: number;
}

export interface KnowledgeWriteCandidate extends CharacterTruthScope {
  id: string;
  kind: KnowledgeKind;
  subject: KnowledgeSubject;
  statement: string;
  temporalStatus: TemporalStatus;
  source: KnowledgeSourceRef;
  evidenceForm?: KnowledgeEvidenceForm;
  requestedTruthStatus?: TruthStatus;
  confidence?: number;
  importance?: number;
  userConfirmed?: boolean;
  occurredAt?: number;
  recordedAt: number;
  validFrom?: number;
  validTo?: number;
  offlineStoryPolicyInput?: OfflineStoryFactPolicyInput;
}

export type KnowledgeWriteRejectionReason =
  | "invalid_scope"
  | "invalid_candidate"
  | "missing_evidence"
  | "low_information"
  | "question_or_instruction"
  | "behavior_correction_required"
  | "fictional_story_boundary";

export type KnowledgeWriteDecision =
  | { accepted: true; claim: KnowledgeClaim; adjustments: string[] }
  | { accepted: false; reason: KnowledgeWriteRejectionReason };

export interface ConversationSummaryRecord extends CharacterTruthScope {
  id: string;
  /** Original legacy record when this summary was created by migration. */
  sourceRecordId?: string;
  summary: string;
  sourceMessageIds: string[];
  sourceClaimIds: string[];
  rangeStartAt?: number;
  rangeEndAt?: number;
  generatedAt: number;
  generator: string;
  projectionVersion: number;
  status: "active" | "stale" | "retracted";
  schemaVersion: number;
}

export interface BehaviorCorrectionRecord extends CharacterTruthScope {
  id: string;
  /** Original legacy record when this correction was created by migration. */
  sourceRecordId?: string;
  instruction: string;
  originalResponse?: string;
  sourceMessageIds: string[];
  createdAt: number;
  updatedAt: number;
  status: "active" | "superseded" | "retracted";
  supersedesId?: string;
  schemaVersion: number;
}

export interface KnowledgePromptProjection {
  confirmedFacts: KnowledgeClaim[];
  userAssertions: KnowledgeClaim[];
  preferences: KnowledgeClaim[];
  futurePlans: KnowledgeClaim[];
  openBeliefsAndHypotheses: KnowledgeClaim[];
  disputed: KnowledgeClaim[];
  legacyUnverified: KnowledgeClaim[];
}
