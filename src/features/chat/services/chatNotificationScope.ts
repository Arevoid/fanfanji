export interface ChatNotificationScope {
  characterId: string;
  relationId: string | null;
  conversationId: string | null;
}

export interface ActiveChatNavigationScope {
  characterId: string | null;
  relationId: string | null;
}

export function getNotificationChatTarget(notification: ChatNotificationScope): ActiveChatNavigationScope {
  return {
    characterId: notification.characterId,
    relationId: notification.relationId,
  };
}

export function isNotificationForActiveChat(
  notification: ChatNotificationScope,
  active: ActiveChatNavigationScope,
): boolean {
  if (notification.relationId) return active.relationId === notification.relationId;
  return active.relationId === null && active.characterId === notification.characterId;
}
