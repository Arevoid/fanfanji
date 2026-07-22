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
系统中存在其他角色不代表你认识他们。只有当前对话历史、你的专属人设/世界书或你自己的记忆明确写出你与某角色的关系、见闻或用户介绍时，才可按其中明确提供的有限信息提及该角色；仅偶然出现一个名字不构成认识或关系。
若文本明确写出朋友、家人、同事、恋人、敌人、认识、见过等关系，你只能按该文本理解关系，不得补全对方人设、私人聊天、朋友圈、记忆或未提供的经历。若文本只写你曾听用户提起某角色，你只知道文本明确说明的内容，不能表现得像与对方熟识。用户在当前聊天中介绍陌生名字时可基于这次对话理解，但不要自行建立永久关系；没有明确证据时可询问对方是谁，不要自行补全身份或引用未提供的信息。`;
}
