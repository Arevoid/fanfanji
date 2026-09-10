import type { Character, MemoryItem, Message } from "../../types";
import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import type { ExtractedKnowledgeCandidatePayload } from "../../features/characterKnowledge/services/knowledgeExtractionProtocol";
import type {
  MemoryExtractionCandidateV2,
  MemoryExtractionRejectionDiagnostic,
} from "./memoryExtractionSchema";
import type { MemoryExtractionSourceEnvelope } from "./memoryExtractionSourceEnvelope";

export type MemoryScenario =
  | "chat"
  | "group-chat"
  | "proactive-message"
  | "moment"
  | "offline"
  | "manual-summary"
  | "immediate-summary";

export interface MemoryRetrievalContext {
  characterId: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
  queryText: string;
  existingMemories: readonly MemoryItem[];
  limit?: number;
  /** Soft prompt budget for compatibility-memory recall, measured in characters. */
  maxCharacters?: number;
  /** Truth Layer is the prompt authority; skip compatibility mirrors when it is loaded. */
  excludeCanonicalMirrors?: boolean;
  scenario: MemoryScenario;
}

export interface MemoryExtractionContext {
  character: Character;
  characterId: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
  recentMessages: readonly Message[];
  existingMemories: readonly MemoryItem[];
  scenario: "chat" | "offline" | "manual-summary" | "immediate-summary";
  /** Normal Direct Chat only; enables additive V2 producer shadow output. */
  enableMemoryExtractionV2Shadow?: boolean;
  /** Dev-only observation; derives shadow candidates from this request without changing its Prompt. */
  enableAdmissionShadowObservation?: boolean;
  /** Optional lineage supplied by the owning runtime; never model-authored. */
  parentActionId?: string;
  extractionActionId?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  templateType?: Character["archiveTemplateType"];
  createId: () => string;
  currentTime: () => number;
  /**
   * Allows callers with stricter provenance requirements (such as an offline
   * story returning to chat) to reject ambiguous model output before a memory
   * record is created.
   */
  filterItems?: (items: readonly string[]) => string[];
  formatContent: (items: readonly string[], options?: { displayItems: readonly string[] }) => string;
  offlineStoryPolicyInput?: import("../offlineStory/offlineStoryFactPolicy").OfflineStoryFactPolicyInput;
}

export interface MemoryExtractionApiParams {
  history: { id: string; role: "user" | "model"; text: string }[];
  /** Provider transport uses M# refs only for the direct-chat path. */
  sourceReferenceMode?: "canonical" | "local";
  characterName: string;
  characterProfile?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  templateType?: Character["archiveTemplateType"];
  scenario?: "offline";
  characterId?: string;
  relationId?: string;
  conversationId?: string;
  parentActionId?: string;
  /** Internal accounting lineage; never sent to a Provider or source envelope. */
  logicalActionId?: string;
  /** Internal producer flag; never changes legacy write authority. */
  enableV2Shadow?: boolean;
}

export interface MemoryExtractionApiResult {
  items?: unknown;
  candidates?: ExtractedKnowledgeCandidatePayload[];
  /** Additive V2 metadata; old API responses continue to use candidates. */
  structuredCandidatesV2?: MemoryExtractionCandidateV2[];
  /** True when a response attempted V2 metadata, even if it was malformed. */
  v2MetadataPresent?: boolean;
  error?: string;
}

export interface MemoryExtractionResult {
  extractedMemories: MemoryItem[];
  acceptedClaims: KnowledgeClaim[];
  rejectedCandidateCount: number;
  /** Optional V2 metadata for compatibility adapters; not a write signal. */
  structuredCandidatesV2?: MemoryExtractionCandidateV2[];
  /** Classification-only candidates derived from the same legacy payload; never a write signal. */
  shadowCandidatesV2?: MemoryExtractionCandidateV2[];
  /** Runtime-owned source universe for additive provenance shadow consumers. */
  sourceEnvelope?: MemoryExtractionSourceEnvelope;
  /** Per-candidate legacy classification; never includes statement/evidence bodies. */
  rejectedCandidates?: MemoryExtractionRejectionDiagnostic[];
  apiError?: string;
}

export type MemoryExtractionApi = (params: MemoryExtractionApiParams) => Promise<MemoryExtractionApiResult>;
