import type { apiChat } from "../../../utils/apiHelper";
import type { Message } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

export type AiChatRequest = Parameters<typeof apiChat>[0];
export type AiChatResponse = Awaited<ReturnType<typeof apiChat>>;

export interface ReplyCandidateContext {
  rawText: string;
  disableBracketActions: boolean;
  keepPeriods: boolean;
  characterId?: string;
  context?: ChatRuntimeContext;
  createId: (index: number) => string;
  currentTime: (index: number) => number;
  transformBubble?: (bubbleText: string, index: number) => string;
  /** Defaults to false: character emoji/stickers require a deliberate per-turn allowance. */
  allowEmoji?: boolean;
}

export interface ReplyCandidatesResult {
  messages: Message[];
  bubbleTexts: string[];
  cleanedText: string;
}
