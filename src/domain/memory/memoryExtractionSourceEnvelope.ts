import type { Message } from "../../types";

/**
 * Runtime-owned metadata for one extraction batch.  It deliberately contains
 * identifiers, roles, and timestamps only; message bodies and model output do
 * not cross this boundary.
 */
export interface MemoryExtractionSourceMessage {
  messageId: string;
  role: Message["sender"];
  actorId?: string;
  timestamp?: number;
}

export interface MemoryExtractionSourceEnvelope {
  characterId: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
  messageSources: readonly MemoryExtractionSourceMessage[];
  allowedSourceMessageIds: readonly string[];
  parentActionId?: string;
  extractionActionId?: string;
}

export interface BuildMemoryExtractionSourceEnvelopeInput {
  characterId: string;
  relationId?: string;
  userIdentityId?: string;
  conversationId?: string;
  recentMessages: readonly Pick<Message, "id" | "sender" | "senderId" | "authorIdentityId" | "timestamp">[];
  parentActionId?: string;
  extractionActionId?: string;
}

const normalize = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Build the canonical source universe before any provider call is made. */
export function buildMemoryExtractionSourceEnvelope(
  input: BuildMemoryExtractionSourceEnvelopeInput,
): MemoryExtractionSourceEnvelope {
  const messageSources = input.recentMessages
    .filter((message) => Boolean(message.id.trim()))
    .map((message) => ({
      messageId: message.id.trim(),
      role: message.sender,
      ...(message.sender === "user"
        ? { actorId: normalize(message.authorIdentityId) || normalize(input.userIdentityId) }
        : { actorId: normalize(message.senderId) || normalize(input.characterId) }),
      ...(Number.isFinite(message.timestamp) ? { timestamp: message.timestamp } : {}),
    }));
  return {
    characterId: input.characterId.trim(),
    ...(normalize(input.relationId) ? { relationId: normalize(input.relationId) } : {}),
    ...(normalize(input.userIdentityId) ? { userIdentityId: normalize(input.userIdentityId) } : {}),
    ...(normalize(input.conversationId) ? { conversationId: normalize(input.conversationId) } : {}),
    messageSources,
    allowedSourceMessageIds: messageSources.map((message) => message.messageId),
    ...(normalize(input.parentActionId) ? { parentActionId: normalize(input.parentActionId) } : {}),
    ...(normalize(input.extractionActionId) ? { extractionActionId: normalize(input.extractionActionId) } : {}),
  };
}

