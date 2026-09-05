import type { OfflineStory } from "../../../types";

interface UseOfflineMessageActionsOptions {
  activeStory: OfflineStory | null;
  saveActiveStorySnapshot: (story: OfflineStory) => void | Promise<void>;
  showToast: (message: string) => void;
}

/** Owns individual offline message deletion while preserving the story snapshot boundary. */
export function useOfflineMessageActions({ activeStory, saveActiveStorySnapshot, showToast }: UseOfflineMessageActionsOptions) {
  const handleDeleteMessage = (messageId: string) => {
    if (!activeStory) return;
    saveActiveStorySnapshot({
      ...activeStory,
      messages: activeStory.messages.filter((message) => message.id !== messageId),
      updatedAt: Date.now(),
    });
    showToast("剧情记录已删除");
  };

  return { handleDeleteMessage };
}
