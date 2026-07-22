export interface CharacterKnowledgeContext {
  currentCharacterId: string;
  groupMemberIds?: readonly string[];
}

export function getKnownCharacterIds(context: CharacterKnowledgeContext): string[] {
  return Array.from(new Set([context.currentCharacterId, ...(context.groupMemberIds || [])]));
}

export function formatCharacterKnowledgeBoundary(context: CharacterKnowledgeContext): string {
  const isGroupConversation = Boolean(context.groupMemberIds?.length);
  if (isGroupConversation) {
    return `[角色知识边界]
当前是群聊；你只知道本群真实成员及本群实际提供的上下文。非群成员角色不应被假设为认识、见过或了解。`;
  }

  return `[角色知识边界]
除非当前对话历史、你的专属人设/世界书或你自己的记忆明确提供证据，否则不要声称认识、见过、听说过或了解其他角色。系统中存在其他角色不代表你认识他们；用户提到陌生名字时可询问对方是谁，不要自行补全身份或引用未提供的信息。`;
}
