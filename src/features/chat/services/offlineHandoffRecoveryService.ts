import type { Message, OfflineStory } from "../../../types";
import { createPendingOfflineHandoff, getOfflineHandoffSourceMessagesForReturn, selectPendingOfflineHandoffStory } from "../../../domain/memory/offlineMemorySync";

interface OfflineHandoffRecoveryScope {
  isGroup: boolean;
  characterId?: string;
  relationId?: string;
  relationCharacterId?: string;
  conversationId?: string;
}

interface RecoverPendingOfflineHandoffInput {
  stories: readonly OfflineStory[];
  currentChatMessages: readonly Message[];
  scope: OfflineHandoffRecoveryScope;
  now?: number;
  onSaveOfflineStory: (story: OfflineStory) => boolean | void | Promise<boolean | void>;
}

/** Recovers a missed, recent offline-to-online handoff without changing reply policy. */
export function recoverPendingOfflineHandoff(input: RecoverPendingOfflineHandoffInput): OfflineStory | undefined {
  const pending = selectPendingOfflineHandoffStory({
    stories: input.stories,
    relationId: input.scope.isGroup ? undefined : input.scope.relationId,
    groupId: input.scope.isGroup ? input.scope.characterId : undefined,
    characterId: input.scope.isGroup ? input.scope.characterId : input.scope.relationCharacterId,
    conversationId: input.scope.isGroup ? `group:${input.scope.characterId}` : input.scope.conversationId,
    now: input.now,
  });
  if (pending) return pending;

  const now = input.now ?? Date.now();
  const recentUntrackedStory = [...input.stories]
    .filter((story) => !story.onlineHandoff && story.mode === "continue" && Boolean(story.archivedAt))
    .filter((story) => input.scope.isGroup
      ? story.relationId === undefined && story.characterId === input.scope.characterId && story.conversationId === `group:${input.scope.characterId}`
      : story.relationId === input.scope.relationId && story.characterId === input.scope.relationCharacterId)
    .filter((story) => input.scope.isGroup
      ? true
      : !input.scope.conversationId || !story.conversationId || story.conversationId === input.scope.conversationId)
    .filter((story) => now - (story.archivedAt || 0) >= 0 && now - (story.archivedAt || 0) <= 2 * 60 * 60 * 1000)
    .filter((story) => input.currentChatMessages.filter((message) => message.sender === "character" && message.timestamp > (story.archivedAt || 0)).length <= 3)
    .sort((left, right) => (right.archivedAt || 0) - (left.archivedAt || 0))[0];
  if (!recentUntrackedStory) return undefined;

  const upgraded = createPendingOfflineHandoff({
    story: recentUntrackedStory,
    sourceMessages: getOfflineHandoffSourceMessagesForReturn(recentUntrackedStory),
    now: recentUntrackedStory.archivedAt,
  });
  if (!upgraded.onlineHandoff) return undefined;
  void input.onSaveOfflineStory(upgraded);
  return upgraded;
}
