import type { Message, RedPacketPayload } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

export type ChatMessageVisualType = "image" | "text-image" | "sticker" | "red-packet" | "transfer" | "call" | "voice" | "file" | "location" | "text";
export type CallTranscriptItem = Pick<Message, "id" | "sender" | "content" | "timestamp">;
export type VoiceCallStatus = "completed" | "rejected" | "cancelled";
export type VoiceCallDirection = "incoming" | "outgoing";

export interface VoiceCallRecord {
  callType: string;
  status: VoiceCallStatus;
  direction: VoiceCallDirection;
  duration: string;
  transcript: CallTranscriptItem[];
}

export interface CharacterMessageInput {
  id: string;
  characterId?: string;
  context?: ChatRuntimeContext;
  relationId?: string;
  conversationId?: string;
  content: string;
  translation?: string;
  timestamp: number;
  senderId?: string;
  sentFromCharacterPhone?: boolean;
  isOffline?: boolean;
  isNarration?: boolean;
  redPacket?: RedPacketPayload;
  redPacketAction?: Message["redPacketAction"];
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
  redPacket?: RedPacketPayload;
  redPacketAction?: Message["redPacketAction"];
}
