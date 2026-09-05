import type { Dispatch, SetStateAction } from "react";
import type { OfflineStory } from "../../../types";

interface UseOfflineMessageEditorActionsOptions {
  activeStory: OfflineStory | null;
  editingText: string;
  saveActiveStorySnapshot: (story: OfflineStory) => void | Promise<void>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string>>;
  showToast: (message: string) => void;
}

/** Owns offline message edit transitions while preserving the existing story snapshot boundary. */
export function useOfflineMessageEditorActions({
  activeStory, editingText, saveActiveStorySnapshot, setEditingMessageId, setEditingText, showToast,
}: UseOfflineMessageEditorActionsOptions) {
  const handleStartEdit = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditingText(currentContent);
  };

  const handleSaveEdit = (messageId: string) => {
    if (!activeStory) return;
    const updatedStory: OfflineStory = {
      ...activeStory,
      messages: activeStory.messages.map((message) => message.id === messageId ? { ...message, content: editingText } : message),
      updatedAt: Date.now(),
    };
    saveActiveStorySnapshot(updatedStory);
    setEditingMessageId(null);
    setEditingText("");
    showToast("修改内容已保存");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  return { handleStartEdit, handleSaveEdit, handleCancelEdit };
}
