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
/** The retrieval layer a conversation summary belongs to. */
export type ConversationSummaryLayer = "episode" | "projection" | "legacy";
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
  experience?: import("../memory/characterExperience").CharacterExperience;
  interpretation?: KnowledgeSourceInterpretation;
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
  /** Each group independently supports the proposition; IDs within a group are conjunctive. */
  evidenceGroups?: string[][];
  messageRevisions?: Record<string, string>;
  /** Time of the source statement, never evidence of the event's occurrence. */
  statementAt?: number;
  /** Verified contiguous source quote; never a model-authored paraphrase. */
  evidenceQuote?: string;
  /** Runtime-only derived index lineage; the persisted source reader does not accept this from model/import input. */
  supportingClaimIds?: string[];
  retainedSnapshot?: boolean;
  actingIdentityId?: string;
  messageAuthors?: Record<string, "user" | "character">;
  quotedMessageId?: string;
}
/** Source-grounded semantic interpretation; never grants canonical identity or awareness. */
export interface KnowledgeSourceInterpretation {
  acquisition?: "self_report" | "hearsay" | "inference" | "unknown";
  acquisitionQuote?: string;
  roles: { mention: string; role: "actor" | "participant" | "observer" | "informant"; quote: string }[];
  interval?: { from: string; to: string; quote: string };
}

export interface KnowledgeSemantics {
  key: string;
  value: string;
  condition?: string;
  update: "assertion" | "change" | "correction";
}
export interface SemanticFactDecision {
  targetClaimId?: string; entityReferenceId?: string; entity: string; attribute: string; value: string;
  operation: "new" | "duplicate" | "change" | "correction" | "conflict" | "different_condition" | "uncertain";
  confidence: number; reason: string; currentQuote: string; previousQuote?: string; condition?: string;
  conditionRelation?: "same" | "different" | "unknown";
}
export interface SemanticFactIdentity { entityId: string; attributeId: string; entityLabel: string; attributeLabel: string }
export interface KnowledgeValueAssessment {
  quote: string; impact: number; durability: number; novelty: number; confidence: number; reason: string;
  explicitRemember?: boolean;
}
export interface KnowledgeAssociation {
  targetId: string; relation: "same_event" | "same_attribute" | "historical_version" | "duplicate";
  sourceQuote: string; targetQuote: string; confidence: number; reason: string;
  targetRevision?: string;
}
export interface OrganizedKnowledgeJudgment {
  targetId: string; sourceRevision: string; targetRevision: string;
  factDecision?: SemanticFactDecision; event?: KnowledgeEventIdentity;
}

/** Runtime provenance, never an authority or permission proposed by a model. */
export interface KnowledgePerspective {
  speaker: { kind: "user" | "character" | "system" | "unknown"; id?: string };
  acquisition: { holderCharacterId: string; relationId: string; userIdentityId: string; conversationId?: string;
    mode: "reported" | "confirmed_participation" | "product_action" | "inference" | "unknown";
    from: "user" | "system" | "unknown"; sourceIds: string[]; at?: number };
  /** Unknown actors remain unknown; a statement's subject does not prove participation. */
  participants: { kind: "user" | "character"; id: string }[];
  actionActors: { kind: "user" | "character"; id: string }[];
  reportedRoles?: { mentionId: string; mention: string; role: "actor" | "participant" | "observer" | "informant"; quote: string }[];
  eventTime: { precision: "day" | "month" | "year" | "range" | "unknown"; calendar?: string; at?: number; from?: string; to?: string };
  statementAt?: number;
  validFrom?: number;
  validTo?: number;
  sourceState: "active" | "retracted";
}

export interface KnowledgeEventIdentity {
  activity: string;
  scheduledDate?: string;
  state: "proposed" | "confirmed" | "completed" | "cancelled" | "rescheduled" | "unfulfilled";
  identityId?: string;
  referenceClaimId?: string;
  referenceQuote?: string;
  matchConfidence?: number;
  matchReason?: string;
  participants?: string[];
  object?: string;
  place?: string;
  timeWindow?: string;
}
export interface KnowledgeClaim extends CharacterTruthScope {
  /** Runtime compatibility of pre-upgrade data; never raises its truth authority. */
  legacyCompatible?: boolean;
  /** Value admission is separate from source truth and manual recall pause. */
  admissionStatus?: "retained" | "review" | "skipped";
  /** Owned by resumable offline extraction, independent of legacy migration. */
  offlineArchiveManaged?: boolean;
  organizationJudgment?: OrganizedKnowledgeJudgment;
  /** Transient scoped event-family projection; not a canonical identity or permission. */
  organizationFamilyId?: string;
  /** Transient read projection only. Repositories restore these fields before writes. */
  organizationProjectionBase?: Pick<KnowledgeClaim, "factIdentity" | "semantics" | "supersedesId" | "supersededById" | "retractionReason" | "recallDisabled" | "mergedClaimIds" | "event" | "planStatus" | "temporalStatus" | "kind" | "coreMemory" | "importance">;
  id: string;
  kind: KnowledgeKind;
  subject: KnowledgeSubject;
  statement: string;
  truthStatus: TruthStatus;
  temporalStatus: TemporalStatus;
  source: KnowledgeSourceRef;
  perspective?: KnowledgePerspective;
  confidence: number;
  /** Optional 1-10 importance supplied by a trusted writer; retrieval derives a safe fallback. */
  importance?: number;
  /** Only an explicit user action can pin a core memory. Relevance remains required. */
  coreMemory?: boolean;
  archivedAt?: number;
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
  semantics?: KnowledgeSemantics;
  factDecision?: SemanticFactDecision;
  factIdentity?: SemanticFactIdentity;
  resolutionStatus?: "accepted" | "review";
  resolutionReason?: string;
  valueAssessment?: KnowledgeValueAssessment;
  coreCandidate?: boolean;
  valueReason?: string;
  associations?: KnowledgeAssociation[];
  event?: KnowledgeEventIdentity;
  organizationSourceId?: string;
  organizationSourceRevision?: string;
  organizationOriginal?: boolean;
  organizationCoverage?: number;
  planStatus?: "proposed" | "confirmed" | "completed" | "cancelled" | "expired" | "unfulfilled";
  continuityVersion?: 1;
  intervention?: boolean;
  mergedClaimIds?: string[];
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
  /**
   * Episode records are bounded scene memories; projection records are
   * canonical rebuilds; legacy records are imported compatibility data.
   * Optional for backwards-compatible in-memory fixtures and old storage.
   */
  layer?: ConversationSummaryLayer;
  /** Additive canonical snapshot marker for durable background projections. */
  canonicalRevision?: string;
  sourceMessageIds: string[];
  /** Runtime-owned processed revisions, including low-value source entries. */
  sourceMessageRevisions?: Record<string,string>;
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
