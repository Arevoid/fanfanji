import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { OfflineStory } from "../../../types";

interface UseOfflineStoryManagementActionsOptions {
  offlineStories: OfflineStory[];
  activeStoryRef: { current: OfflineStory | null };
  clearOfflineSession: (story: OfflineStory) => void;
  onDeleteOfflineStory: (storyId: string) => void;
  clearActiveStorySnapshot: () => void;
  onSaveOfflineStory: (story: OfflineStory) => void;
  saveActiveStorySnapshot: (story: OfflineStory) => void | Promise<void>;
  showToast: (message: string) => void;
  editingStory: OfflineStory | null;
  editingStoryTitle: string;
  editingStoryIfPrompt: string;
  setEditingStory: Dispatch<SetStateAction<OfflineStory | null>>;
  setEditingStoryTitle: Dispatch<SetStateAction<string>>;
  setEditingStoryIfPrompt: Dispatch<SetStateAction<string>>;
}

/** Owns offline story deletion and title/IF prompt editing while preserving persistence routing. */
export function useOfflineStoryManagementActions({
  offlineStories, activeStoryRef, clearOfflineSession, onDeleteOfflineStory,
  clearActiveStorySnapshot, onSaveOfflineStory, saveActiveStorySnapshot, showToast,
  editingStory, editingStoryTitle, editingStoryIfPrompt, setEditingStory,
  setEditingStoryTitle, setEditingStoryIfPrompt,
}: UseOfflineStoryManagementActionsOptions) {
  const handleDeleteStory = (storyId: string, event: MouseEvent) => {
    event.stopPropagation();
    if (!confirm("确定要删除这个线下故事记录吗？此操作无法撤销。")) return;
    const story = offlineStories.find((item) => item.id === storyId);
    if (story) clearOfflineSession(story);
    onDeleteOfflineStory(storyId);
    if (activeStoryRef.current?.id === storyId) clearActiveStorySnapshot();
    showToast("故事已删除");
  };

  const handleStartEditStory = (story: OfflineStory, event: MouseEvent) => {
    event.stopPropagation();
    setEditingStory(story);
    setEditingStoryTitle(story.title);
    setEditingStoryIfPrompt(story.ifPrompt || "");
  };

  const handleSaveStoryEdit = () => {
    if (!editingStory) return;
    const title = editingStoryTitle.trim();
    if (!title) {
      showToast("故事名称不能为空");
      return;
    }
    const updatedStory: OfflineStory = {
      ...editingStory,
      title,
      ...(editingStory.mode === "if" ? { ifPrompt: editingStoryIfPrompt.trim() || undefined } : {}),
      updatedAt: Date.now(),
    };
    if (activeStoryRef.current?.id === updatedStory.id) saveActiveStorySnapshot(updatedStory);
    else onSaveOfflineStory(updatedStory);
    setEditingStory(null);
    showToast("剧本已更新");
  };

  return { handleDeleteStory, handleStartEditStory, handleSaveStoryEdit };
}
