import type { Message } from "../../../types";
import { getConversationId, type CharacterRelationship } from "../../../domain/relationship/characterRelationship";

/** A direct voice call must remain in the relationship that started it. */
export interface DirectVoiceCallScope {
  relationId: string;
  conversationId: string;
}

export function resolveDirectVoiceCallScope(input: {
  activeIdentityId: string;
  relationship?: CharacterRelationship;
  isGroupChat: boolean;
}): DirectVoiceCallScope | undefined {
  const { activeIdentityId, relationship, isGroupChat } = input;
  if (!relationship || isGroupChat || relationship.userIdentityId !== activeIdentityId) return undefined;

  return {
    relationId: relationship.id,
    conversationId: relationship.conversationId || getConversationId(relationship.id),
  };
}

export function isCurrentVoiceCallScope(
  sessionRelationId: string | null,
  activeScope?: DirectVoiceCallScope,
): activeScope is DirectVoiceCallScope {
  return Boolean(sessionRelationId && activeScope && sessionRelationId === activeScope.relationId);
}

export function createVoiceCallRecordMessage(input: {
  id: string;
  characterId: string;
  scope: DirectVoiceCallScope;
  content: string;
  timestamp: number;
}): Message {
  return {
    id: input.id,
    characterId: input.characterId,
    relationId: input.scope.relationId,
    conversationId: input.scope.conversationId,
    sender: "user",
    content: input.content,
    timestamp: input.timestamp,
  };
}
