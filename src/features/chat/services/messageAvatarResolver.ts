/**
 * Direct-chat user bubbles follow the currently selected identity profile.
 * Group bubbles and explicitly attributed foreign identities retain their
 * frozen snapshots so changing a profile never rewrites another actor.
 */
export function resolveChatMessageAvatar(input: {
  isSelf: boolean;
  isGroupChat: boolean;
  messageAvatarSnapshot?: string;
  messageAuthorIdentityId?: string;
  currentIdentityId: string;
  currentIdentityAvatar?: string;
  fallbackAvatar?: string;
}): string {
  if (!input.isSelf) return input.fallbackAvatar || "";
  if (!input.isGroupChat
    && (!input.messageAuthorIdentityId || input.messageAuthorIdentityId === input.currentIdentityId)
    && input.currentIdentityAvatar) {
    return input.currentIdentityAvatar;
  }
  return input.messageAvatarSnapshot || input.currentIdentityAvatar || input.fallbackAvatar || "";
}
