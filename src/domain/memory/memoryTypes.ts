import type { Character, MemoryItem, MemoryVaultSettings, Message } from "../../types";
import type { KnowledgeClaim } from "../characterKnowledge/characterKnowledgeTypes";
import type { ExtractedKnowledgeCandidatePayload } from "../../features/characterKnowledge/services/knowledgeExtractionProtocol";

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
  characterName: string;
  characterProfile?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  templateType?: Character["archiveTemplateType"];
  scenario?: "offline";
}

export interface MemoryExtractionApiResult {
  items?: unknown;
  candidates?: ExtractedKnowledgeCandidatePayload[];
  error?: string;
}

export interface MemoryExtractionResult {
  extractedMemories: MemoryItem[];
  acceptedClaims: KnowledgeClaim[];
  rejectedCandidateCount: number;
  apiError?: string;
}

export type MemoryExtractionApi = (params: MemoryExtractionApiParams) => Promise<MemoryExtractionApiResult>;
