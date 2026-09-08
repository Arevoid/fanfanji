import type { Dispatch, SetStateAction } from "react";
import type { OfflineStory } from "../../../types";

interface OfflineChatNavigationTarget {
  characterId: string;
  relationId?: string;
  conversationId?: string;
}

interface UseOfflineWorkspaceExitActionsOptions {
  activeStoryRef: { current: OfflineStory | null };
  storyPersistenceRef: { current: Promise<boolean> };
  finalizeStoryBeforeLeaving: (story: OfflineStory) => Promise<OfflineStory>;
  clearOfflineSession: (story: OfflineStory) => void;
  clearActiveStorySnapshot: () => void;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string) => void;
  onNavigateToChat?: (characterId: string, relationId?: string, conversationId?: string) => void;
  resolveChatTarget: (story: OfflineStory) => OfflineChatNavigationTarget | null;
}

/** Owns offline workspace exit and return-to-chat lifecycle ordering. */
export function useOfflineWorkspaceExitActions({
  activeStoryRef, storyPersistenceRef, finalizeStoryBeforeLeaving, clearOfflineSession,
  clearActiveStorySnapshot, setIsSettingsOpen, showToast, onNavigateToChat, resolveChatTarget,
}: UseOfflineWorkspaceExitActionsOptions) {
  const handleExitStoryWorkspace = async () => {
    await storyPersistenceRef.current;
    const latestStory = activeStoryRef.current;
    const completedStory = latestStory ? await finalizeStoryBeforeLeaving(latestStory) : null;
    await storyPersistenceRef.current;
    if (completedStory) clearOfflineSession(completedStory);
    clearActiveStorySnapshot();
    setIsSettingsOpen(false);
  };

  const handleReturnToOnlineChat = async () => {
    await storyPersistenceRef.current;
    const latestStory = activeStoryRef.current;
    if (!latestStory || !onNavigateToChat) return;
    const target = resolveChatTarget(latestStory);
    if (!target) {
      showToast("未找到当前身份对应的线上聊天关系。");
      return;
    }
    const completedStory = await finalizeStoryBeforeLeaving(latestStory);
    await storyPersistenceRef.current;
    clearOfflineSession(completedStory);
    clearActiveStorySnapshot();
    setIsSettingsOpen(false);
    onNavigateToChat(target.characterId, target.relationId, target.conversationId);
  };

  return { handleExitStoryWorkspace, handleReturnToOnlineChat };
}
