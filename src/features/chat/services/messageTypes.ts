import type { Message } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

export type ChatMessageVisualType = "image" | "sticker" | "red-packet" | "transfer" | "call" | "voice" | "file" | "location" | "text";
export type CallTranscriptItem = Pick<Message, "id" | "sender" | "content" | "timestamp">;

export interface CharacterMessageInput {
  id: string;
  characterId?: string;
  context?: ChatRuntimeContext;
  relationId?: string;
  conversationId?: string;
  content: string;
  timestamp: number;
  senderId?: string;
  isOffline?: boolean;
  isNarration?: boolean;
}

export interface UserMessageInput {
  id: string;
  characterId?: string;
  context?: ChatRuntimeContext;
  relationId?: string;
  conversationId?: string;
  content: string;
  timestamp: number;
  isOffline?: boolean;
  isNarration?: boolean;
}
