import { Eye, MessageCircle } from "lucide-react";
import type { ForumPublicAuthor, ForumThread } from "../../../types";
import { getForumLikeCount, type ForumThreadMetrics } from "../../../domain/forum/forumData";

const formatForumCount = (value: number): string => {
  const normalized = Math.max(0, Math.floor(value));
  if (normalized < 1000) return String(normalized);
  if (normalized < 10000) return `${(normalized / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(normalized / 1000)}k`;
};

const categoryTone = (category: string): string => {
  if (category === "情感") return "bg-rose-50 text-rose-400";
  if (category === "八卦") return "bg-amber-50 text-amber-500";
  if (category === "推荐") return "bg-blue-50 text-blue-400";
  return "bg-slate-100 text-slate-400";
};

export function ForumThreadCard({
  thread,
  author = thread.publicAuthor,
  metrics,
  formattedTime,
  liked,
  onOpen,
  onToggleLike,
  compact = false,
}: {
  thread: ForumThread;
  author?: ForumPublicAuthor;
  metrics: ForumThreadMetrics;
  formattedTime: string;
  liked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
  compact?: boolean;
}) {
  const category = thread.category?.trim() || "推荐";

  return (
    <article
      data-forum-card-layout={compact ? "compact" : "comfortable"}
      className={`border-b border-[var(--divider)] bg-[var(--surface)] px-4 last:border-b-0 ${compact ? "py-2" : "py-2.5"}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left active:opacity-70"
        aria-label={`查看帖子：${thread.title}，作者：${author.displayName}`}
      >
        <div className="flex items-start">
          <h2 className="min-w-0 flex-1 line-clamp-2 text-[14px] font-semibold leading-5 text-[var(--text-primary)]">
            {thread.title}
          </h2>
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-4 text-[var(--text-secondary)]">
          {thread.body}
        </p>
      </button>

      <div className="mt-1.5 flex min-w-0 items-center gap-2.5 text-[10px] leading-4 text-[var(--text-tertiary)]">
          <span className={`shrink-0 rounded-full px-2 py-0.5 ${categoryTone(category)}`}>
            #{category}
          </span>
          <time className="shrink-0">{formattedTime}</time>
          {metrics.hasUnreadAuthorUpdate && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-400">楼主更新</span>
          )}
          <button
            type="button"
            onClick={onToggleLike}
            aria-label={liked ? "取消点赞" : "点赞"}
            aria-pressed={liked}
            className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-1 py-0.5 transition-colors active:opacity-70 ${liked ? "text-rose-500" : "text-[var(--text-tertiary)]"}`}
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            {formatForumCount(getForumLikeCount(thread))}
          </button>
          <span className="inline-flex shrink-0 items-center gap-1">
            <MessageCircle className="h-3 w-3" aria-hidden="true" />
            {formatForumCount(metrics.effectiveReplyCount)}
          </span>
        </div>
    </article>
  );
}
