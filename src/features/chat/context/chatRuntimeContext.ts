/**
 * Relationship-aware runtime boundary for chat services.
 *
 * This is a pure value object. It deliberately owns no React state, storage,
 * or lifecycle so services can adopt it incrementally.
 */
export interface ChatRuntimeContext {
  characterId: string | null;
  relationId: string | null;
  conversationId: string | null;
  userIdentityId: string;
  isGroup: boolean;
  groupId?: string;
}

export interface ChatRuntimeContextInput {
  characterId?: string | null;
  relationId?: string | null;
  conversationId?: string | null;
  userIdentityId?: string | null;
  isGroup?: boolean;
  groupId?: string | null;
}

export const DEFAULT_CHAT_RUNTIME_IDENTITY = "identity-1";

export function createChatRuntimeContext(input: ChatRuntimeContextInput = {}): ChatRuntimeContext {
  return {
    characterId: input.characterId ?? null,
    relationId: input.relationId ?? null,
    conversationId: input.conversationId ?? null,
    userIdentityId: input.userIdentityId || DEFAULT_CHAT_RUNTIME_IDENTITY,
    isGroup: input.isGroup === true,
    ...(input.groupId ? { groupId: input.groupId } : {}),
  };
}

export const isDirectChatRuntimeContext = (context: ChatRuntimeContext) => !context.isGroup;
export const isGroupChatRuntimeContext = (context: ChatRuntimeContext) => context.isGroup;
export const readRuntimeCharacterId = (context: ChatRuntimeContext) => context.characterId;
export const readRuntimeRelationId = (context: ChatRuntimeContext) => context.relationId;
export const readRuntimeConversationId = (context: ChatRuntimeContext) => context.conversationId;
export const readRuntimeIdentityId = (context: ChatRuntimeContext) => context.userIdentityId;
