import { useCallback, type MutableRefObject } from "react";
import type { OfflineStory } from "../../../types";

interface UseOfflineStoryPersistenceOptions {
  activeStoryRef: MutableRefObject<OfflineStory | null>;
  setActiveStory: (story: OfflineStory | null) => void;
  storyPersistenceRef: MutableRefObject<Promise<boolean>>;
  onSaveOfflineStory: (story: OfflineStory) => boolean | Promise<boolean>;
  showToast: (message: string) => void;
}

/** Owns the serialized story snapshot queue used by every offline edit path. */
export function useOfflineStoryPersistence({
  activeStoryRef,
  setActiveStory,
  storyPersistenceRef,
  onSaveOfflineStory,
  showToast,
}: UseOfflineStoryPersistenceOptions) {
  const saveActiveStorySnapshot = useCallback((story: OfflineStory) => {
    activeStoryRef.current = story;
    setActiveStory(story);
    const pendingSave = storyPersistenceRef.current
      .catch(() => false)
      .then(() => Promise.resolve(onSaveOfflineStory(story)))
      .then((success) => success !== false)
      .catch((error) => {
        console.error("Failed to persist offline story:", error);
        return false;
      });
    storyPersistenceRef.current = pendingSave;
    void pendingSave.then((success) => {
      if (!success) showToast("剧情暂未写入设备，请勿关闭应用并检查可用存储空间");
    });
    return story;
  }, [activeStoryRef, onSaveOfflineStory, setActiveStory, showToast, storyPersistenceRef]);

  return { saveActiveStorySnapshot };
}
