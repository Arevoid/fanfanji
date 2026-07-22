import type { apiChat } from "../../../utils/apiHelper";
import type { Message } from "../../../types";

export type AiChatRequest = Parameters<typeof apiChat>[0];
export type AiChatResponse = Awaited<ReturnType<typeof apiChat>>;

export interface ReplyCandidateContext {
  rawText: string;
  disableBracketActions: boolean;
  keepPeriods: boolean;
  characterId: string;
  createId: (index: number) => string;
  currentTime: (index: number) => number;
  transformBubble?: (bubbleText: string, index: number) => string;
}

export interface ReplyCandidatesResult {
  messages: Message[];
  bubbleTexts: string[];
  cleanedText: string;
}
