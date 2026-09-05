import type { Dispatch, SetStateAction } from "react";
import type { ForumReply, UserSettings } from "../../../types";
import { ForumStoryCommentService } from "../services/forumStoryCommentService";
import { ForumStoryRepository } from "../forumStoryRepository";
import { getForumStoryUiThread } from "../forumStoryUiData";
import type { ForumStoryUiReply } from "../forumStoryUiData";
import { StoryEventRepository } from "../storyEventRepository";
import { StoryForumReplyRepository } from "../storyReplyRepository";
import { createId } from "../../../core/id/createId";

interface UseForumStoryReaderActionsOptions {
  settings: UserSettings;
  replyingTo: ForumReply | null;
  setActiveStoryId: Dispatch<SetStateAction<string | null>>;
  setReplyingTo: Dispatch<SetStateAction<ForumReply | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setForumStoryRevision: Dispatch<SetStateAction<number>>;
}

export function useForumStoryReaderActions({
  settings,
  replyingTo,
  setActiveStoryId,
  setReplyingTo,
  setError,
  setNotice,
  setForumStoryRevision,
}: UseForumStoryReaderActionsOptions) {
  const submitForumStoryComment = async (storyId: string, body: string, replyTo?: ForumStoryUiReply) => {
    const view = getForumStoryUiThread(storyId);
    if (!view) return;
    const now = Date.now();
    const readerId = `${storyId}:reader`;
    const parent = replyTo ? StoryForumReplyRepository.listReplies(storyId, view.thread.id).find((reply) => reply.id === replyTo.id) : undefined;
    const write = StoryForumReplyRepository.appendReply({
      id: createId("forum-story-reader-reply"),
      storyId,
      threadId: view.thread.id,
      ownerIdentityId: `story-scope:${storyId}`,
      publicAuthor: { displayName: "我", kind: "virtual", isAnonymous: false },
      body,
      source: "ai-virtual",
      occurredAt: now,
      baseLikeCount: 0,
      likedByIdentityIds: [],
      createdAt: now,
      updatedAt: now,
      storyAuthorType: "forum_user",
      storyAuthorId: readerId,
      ...(parent ? { parentReplyId: parent.id, replyToUserId: parent.storyAuthorId, quoteContent: parent.body.slice(0, 180) } : {}),
      storyCommentStyle: "ordinary",
      storyCommentLabel: "论坛读者",
    });
    if (!write.success || !write.reply) throw new Error("故事评论保存失败");
    const eventWrite = StoryEventRepository.appendEvent({
      id: createId("forum-story-reader-event"),
      storyId,
      type: "comment_added",
      source: "user",
      status: "confirmed",
      summary: `论坛读者: ${body.slice(0, 200)}`,
      storyVersion: view.story.version,
      occurredAt: now,
      createdAt: now,
      forumThreadId: view.thread.id,
      forumReplyId: write.reply.id,
      floorNumber: write.reply.floorNumber ?? write.reply.floor,
      idempotencyKey: `${storyId}:reader:${write.reply.id}`,
    });
    if (!eventWrite.success) throw new Error("故事评论事件保存失败");
    setForumStoryRevision((revision) => revision + 1);
    void ForumStoryCommentService.generateStoryComments({ story: view.story, thread: view.thread, settings, count: 3 }).then(() => {
      setForumStoryRevision((revision) => revision + 1);
    }).catch(() => undefined);
  };

  const handleForumStoryUtility = async (
    action: "share" | "delete" | "translate",
    storyId: string,
    reply?: ForumStoryUiReply,
  ) => {
    const view = getForumStoryUiThread(storyId);
    if (!view) return;
    if (action === "share") {
      const text = `${view.thread.title}\n${view.thread.initialContent}`;
      try { await navigator.clipboard?.writeText(text); setNotice("帖子内容已复制，可转发给朋友。"); }
      catch { setNotice("当前浏览器不支持复制，请手动选择帖子内容。"); }
      return;
    }
    if (action === "delete" && !reply) {
      if (!window.confirm("删除这条故事帖子？已生成的故事记录不会进入普通论坛。")) return;
      if (!ForumStoryRepository.deleteStory(storyId).success) { setError("故事帖子删除失败"); return; }
      setActiveStoryId(null);
      setForumStoryRevision((revision) => revision + 1);
      return;
    }
    if (action === "delete" && reply) {
      if (!window.confirm("删除这条评论？楼层会保留，内容将显示为“该回复已删除”。")) return;
      if (!StoryForumReplyRepository.tombstoneReply(storyId, view.thread.id, reply.id).success) {
        setError("故事评论删除失败，请重试");
        return;
      }
      setForumStoryRevision((revision) => revision + 1);
      if (replyingTo?.id === reply.id) setReplyingTo(null);
      return;
    }
    if (action === "delete") return;
    setNotice("故事帖子使用原文展示，暂不需要翻译。");
  };

  return { submitForumStoryComment, handleForumStoryUtility };
}
