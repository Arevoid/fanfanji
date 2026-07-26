import type { Message } from "../../../types";

export interface ConversationRelationScope {
  characterId: string;
  relationId?: string;
  /** Contact copies have distinct legacy ids, while archive profiles do not. */
  allowLegacyCharacterMessages: boolean;
}

export function isMessageInConversationRelation(
  message: Message,
  scope: ConversationRelationScope,
): boolean {
  if (message.characterId !== scope.characterId) return false;
  if (message.relationId) return message.relationId === scope.relationId;
  return scope.allowLegacyCharacterMessages || Boolean(scope.relationId?.endsWith(":identity-1"));
}
