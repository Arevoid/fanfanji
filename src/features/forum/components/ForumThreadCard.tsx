import { MessageCircle, ThumbsUp } from "lucide-react";
import type { ForumPublicAuthor, ForumThread } from "../../../types";
import { getForumLikeCount, type ForumThreadMetrics } from "../../../domain/forum/forumData";
import { ForumAvatar } from "./ForumAvatar";

export function ForumThreadCard({
  thread,
  author = thread.publicAuthor,
  metrics,
  formattedTime,
  liked,
  onOpen,
  onToggleLike,
}: {
  thread: ForumThread;
  author?: ForumPublicAuthor;
  metrics: ForumThreadMetrics;
  formattedTime: string;
  liked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
}) {
  return (
    <article className="border-b border-[var(--divider)] bg-[var(--surface)] px-4 py-4 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left active:opacity-70"
        aria-label={`查看帖子：${thread.title}`}
      >
        <div className="flex items-center gap-2.5">
          <ForumAvatar author={author} className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                {author.displayName}
              </span>
              {author.isAnonymous && (
                <span className="rounded-full bg-[var(--badge-muted-bg)] px-2 py-0.5 text-[9px] font-medium text-[var(--badge-muted-text)]">
                  匿名
                </span>
              )}
            </div>
            <time className="text-[10px] text-[var(--text-tertiary)]">{formattedTime}</time>
          </div>
          {metrics.hasUnreadAuthorUpdate && (
            <span className="shrink-0 rounded-full bg-[var(--badge-muted-bg)] px-2 py-1 text-[10px] font-medium text-[var(--badge-muted-text)]">
              楼主更新
            </span>
          )}
        </div>

        <h2 className="mt-3 line-clamp-2 text-[16px] font-bold leading-6 text-[var(--text-primary)]">
          {thread.title}
        </h2>
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--text-secondary)]">
          {thread.body}
        </p>

      </button>
      <div className="mt-3 flex items-center gap-5 text-[11px] text-[var(--text-tertiary)]">
        <button
          type="button"
          onClick={onToggleLike}
          aria-label={liked ? "取消点赞" : "点赞"}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-1 transition-colors active:opacity-70 ${liked ? "text-rose-500" : "text-[var(--text-tertiary)]"}`}
        >
          <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
          {getForumLikeCount(thread)}
        </button>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" />
          {metrics.effectiveReplyCount}
        </span>
      </div>
    </article>
  );
}
