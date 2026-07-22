import type { Message } from "../../../types";

export type ChatMessageVisualType = "image" | "sticker" | "red-packet" | "transfer" | "call" | "voice" | "file" | "location" | "text";
export type CallTranscriptItem = Pick<Message, "id" | "sender" | "content" | "timestamp">;

export interface CharacterMessageInput {
  id: string;
  characterId: string;
  content: string;
  timestamp: number;
  senderId?: string;
  isOffline?: boolean;
  isNarration?: boolean;
}

export interface UserMessageInput {
  id: string;
  characterId: string;
  content: string;
  timestamp: number;
  isOffline?: boolean;
  isNarration?: boolean;
}
