import type { Dispatch, SetStateAction } from "react";
import type { UserSettings } from "../../../types";
import { ForumStoryCommentService } from "../services/forumStoryCommentService";
import { ForumStoryUpdateService } from "../services/forumStoryUpdateService";
import { getForumStoryUiThread } from "../forumStoryUiData";

interface UseForumStoryUpdateActionOptions {
  isStoryUpdating: boolean;
  settings: UserSettings;
  setIsStoryUpdating: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setForumStoryRevision: Dispatch<SetStateAction<number>>;
}

export function useForumStoryUpdateAction({
  isStoryUpdating,
  settings,
  setIsStoryUpdating,
  setError,
  setNotice,
  setForumStoryRevision,
}: UseForumStoryUpdateActionOptions) {
  const requestForumStoryUpdate = async (storyId: string) => {
    if (isStoryUpdating) return;
    const view = getForumStoryUiThread(storyId);
    if (!view || view.story.status === "completed") return;
    setIsStoryUpdating(true);
    setError("");
    try {
      const updateResult = await ForumStoryUpdateService.generateStoryUpdate({
        story: view.story,
        thread: view.thread,
        settings,
        triggerReason: "manual",
        conclude: view.thread.readerInterest === true && view.story.currentEpisode >= 3,
      });
      if (updateResult.story.status !== "completed") {
        await ForumStoryCommentService.generateStoryComments({
          story: updateResult.story,
          thread: updateResult.thread,
          settings,
          count: 5 + Math.floor(Math.random() * 6),
        });
      }
      setForumStoryRevision((revision) => revision + 1);
      setNotice(updateResult.story.status === "completed" ? "楼主已发布最终结局。" : "楼主已更新，新的讨论已补进楼层。");
    } catch (storyError) {
      setError(storyError instanceof Error ? storyError.message : "故事更新失败，请稍后重试。");
    } finally {
      setIsStoryUpdating(false);
    }
  };

  return { requestForumStoryUpdate };
}
