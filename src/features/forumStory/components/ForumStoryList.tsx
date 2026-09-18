import { Eye, MessageCircle } from "lucide-react";
import type { ForumStoryUiListItem } from "../forumStoryUiData";

const formatStoryCount = (value: number): string => {
  const normalized = Math.max(0, Math.floor(value));
  if (normalized < 1000) return String(normalized);
  if (normalized < 10000) return `${(normalized / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(normalized / 1000)}k`;
};

const formatStoryTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export function ForumStoryList({
  items,
  onOpen,
}: {
  items: readonly ForumStoryUiListItem[];
  onOpen: (storyId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section data-testid="forum-story-list" className="border-b border-[var(--divider)]">
      {items.map((item) => (
        <article key={item.storyId} data-testid={`forum-story-${item.storyId}`} className="border-b border-[var(--divider)] bg-[var(--surface)] px-4 py-2.5 last:border-b-0">
          <button
            type="button"
            onClick={() => onOpen(item.storyId)}
            className="block w-full text-left active:opacity-70"
            aria-label={`查看帖子：${item.title}`}
          >
            <div className="flex items-start">
              <h2 className="min-w-0 flex-1 line-clamp-2 text-[14px] font-semibold leading-5 text-[var(--text-primary)]">{item.title}</h2>
            </div>
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-4 text-[var(--text-secondary)]">{item.body}</p>
          </button>
          <div className="mt-1.5 flex min-w-0 items-center gap-2.5 text-[10px] leading-4 text-[var(--text-tertiary)]">
            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-blue-400">#推荐</span>
            <time className="shrink-0">{formatStoryTime(item.updatedAt)}</time>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1">
              <Eye className="h-3 w-3" aria-hidden="true" />
              {formatStoryCount(item.likeCount)}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <MessageCircle className="h-3 w-3" aria-hidden="true" />
              {formatStoryCount(item.replyCount)}
            </span>
          </div>
        </article>
      ))}
    </section>
  );
}
