/**
 * The relationship-aware boundary for a chat session.
 *
 * This is intentionally a small read-only value object for the first
 * extraction step. Existing callers can continue to pass their current
 * individual ids until later chat migrations adopt it.
 */
export interface ChatContext {
  characterId: string | null;
  relationId: string | null;
  conversationId: string | null;
  userIdentityId: string;
  isGroupChat: boolean;
}

export interface ChatContextInput {
  characterId?: string | null;
  relationId?: string | null;
  conversationId?: string | null;
  userIdentityId?: string | null;
  isGroupChat?: boolean;
}

export const DEFAULT_CHAT_IDENTITY_ID = "identity-1";

export function createChatContext(input: ChatContextInput = {}): ChatContext {
  return {
    characterId: input.characterId ?? null,
    relationId: input.relationId ?? null,
    conversationId: input.conversationId ?? null,
    userIdentityId: input.userIdentityId || DEFAULT_CHAT_IDENTITY_ID,
    isGroupChat: input.isGroupChat === true,
  };
}

export const readChatCharacterId = (context: ChatContext) => context.characterId;
export const readChatRelationId = (context: ChatContext) => context.relationId;
export const readChatConversationId = (context: ChatContext) => context.conversationId;
export const readChatUserIdentityId = (context: ChatContext) => context.userIdentityId;
