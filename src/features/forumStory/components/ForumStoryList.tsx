import { MessageCircle, ThumbsUp, UserRound } from "lucide-react";
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
    <section data-testid="forum-story-list" className="mt-3 border-y border-slate-100 bg-white">
      {items.map((item) => (
        <article key={item.storyId} data-testid={`forum-story-${item.storyId}`} className="border-b border-slate-100 px-4 py-4 last:border-b-0">
          <button type="button" onClick={() => onOpen(item.storyId)} className="block w-full text-left active:opacity-70" aria-label={`查看帖子：${item.title}`}>
            <div className="flex items-center gap-2.5">
              {item.authorAvatar ? (
                <img src={item.authorAvatar} alt="" className="h-9 w-9 rounded-full bg-slate-100 object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><UserRound className="h-4 w-4 text-slate-400" /></span>
              )}
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-slate-800">{item.authorName}</span>
                <time className="text-[10px] text-slate-400">{formatStoryTime(item.updatedAt)}</time>
              </div>
            </div>
            <h2 className="mt-3 line-clamp-2 text-[16px] font-bold leading-6 text-slate-900">{item.title}</h2>
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">{item.body}</p>
          </button>
          <div className="mt-3 flex items-center gap-5 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" />{item.likeCount}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{item.replyCount}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

