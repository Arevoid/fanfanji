import type { Message } from "../../../types";
import { getConversationId, type CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { ChatRuntimeContext } from "./chatRuntimeContext";

/** Complete ownership boundary required by every new direct-chat artifact. */
export interface DirectInteractionScope {
  characterId: string;
  relationId: string;
  conversationId: string;
  userIdentityId: string;
}

export function resolveDirectInteractionScope(input: {
  characterId?: string | null;
  activeIdentityId: string;
  relationship?: CharacterRelationship;
  isGroupChat: boolean;
}): DirectInteractionScope | undefined {
  const { relationship, characterId, activeIdentityId, isGroupChat } = input;
  if (!relationship || !characterId || isGroupChat) return undefined;
  if (relationship.userIdentityId !== activeIdentityId || relationship.characterId !== characterId) return undefined;
  return {
    characterId,
    relationId: relationship.id,
    conversationId: relationship.conversationId || getConversationId(relationship.id),
    userIdentityId: activeIdentityId,
  };
}

export const toDirectChatRuntimeContext = (scope: DirectInteractionScope): ChatRuntimeContext => ({
  characterId: scope.characterId,
  relationId: scope.relationId,
  conversationId: scope.conversationId,
  userIdentityId: scope.userIdentityId,
  isGroup: false,
});

export const isMessageInDirectScope = (message: Message, scope: DirectInteractionScope): boolean =>
  message.characterId === scope.characterId
  && message.relationId === scope.relationId
  && (!message.conversationId || message.conversationId === scope.conversationId);

export type MessageMutationScope = Pick<Message, "characterId" | "relationId" | "conversationId">;

export const messageMatchesMutationScope = (message: Message, scope?: MessageMutationScope): boolean => !scope || (
  message.characterId === scope.characterId
  && message.relationId === scope.relationId
  && message.conversationId === scope.conversationId
);

export const attachDirectScope = (message: Message, scope: DirectInteractionScope): Message | undefined => {
  if (message.relationId && message.relationId !== scope.relationId) return undefined;
  if (message.conversationId && message.conversationId !== scope.conversationId) return undefined;
  if (message.characterId !== scope.characterId) return undefined;
  return { ...message, relationId: scope.relationId, conversationId: scope.conversationId };
};
