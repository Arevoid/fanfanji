import type { Character, MemoryItem, MemoryVaultSettings, Message } from "../../types";

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
  queryText: string;
  existingMemories: readonly MemoryItem[];
  limit?: number;
  scenario: MemoryScenario;
}

export interface MemoryExtractionContext {
  character: Character;
  characterId: string;
  relationId?: string;
  recentMessages: readonly Message[];
  existingMemories: readonly MemoryItem[];
  scenario: "chat" | "offline" | "manual-summary" | "immediate-summary";
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  templateType?: Character["archiveTemplateType"];
  createId: () => string;
  currentTime: () => number;
  formatContent: (items: readonly string[]) => string;
}

export interface MemoryExtractionApiParams {
  history: { role: "user" | "model"; text: string }[];
  characterName: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  templateType?: Character["archiveTemplateType"];
}

export interface MemoryExtractionApiResult {
  items?: unknown;
  error?: string;
}

export type MemoryExtractionApi = (params: MemoryExtractionApiParams) => Promise<MemoryExtractionApiResult>;
