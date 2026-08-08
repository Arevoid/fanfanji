import { MessageCircle, ThumbsUp } from "lucide-react";
import type { ForumPublicAuthor } from "../../../types";
import { ForumAvatar } from "../../forum/components/ForumAvatar";
import type { ForumStoryUiListItem } from "../forumStoryUiData";

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
        <article key={item.storyId} data-testid={`forum-story-${item.storyId}`} className="border-b border-[var(--divider)] bg-[var(--surface)] px-4 py-4 last:border-b-0">
          <button type="button" onClick={() => onOpen(item.storyId)} className="block w-full text-left active:opacity-70" aria-label={`查看帖子：${item.title}`}>
            <div className="flex items-center gap-2.5">
              <ForumAvatar
                author={{ displayName: item.authorName, ...(item.authorAvatar ? { avatar: item.authorAvatar } : {}), kind: "virtual", isAnonymous: false } satisfies ForumPublicAuthor}
                className="h-9 w-9"
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{item.authorName}</span>
                <time className="text-[10px] text-[var(--text-tertiary)]">{formatStoryTime(item.updatedAt)}</time>
              </div>
            </div>
            <h2 className="mt-3 line-clamp-2 text-[16px] font-bold leading-6 text-[var(--text-primary)]">{item.title}</h2>
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--text-secondary)]">{item.body}</p>
          </button>
          <div className="mt-3 flex items-center gap-5 text-[11px] text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{item.likeCount}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{item.replyCount}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

