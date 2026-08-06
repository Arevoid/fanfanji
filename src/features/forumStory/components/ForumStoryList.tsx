import { BookOpen, ChevronRight } from "lucide-react";
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

const statusClass: Record<ForumStoryUiListItem["status"], string> = {
  连载中: "bg-emerald-50 text-emerald-600",
  等待更新: "bg-amber-50 text-amber-600",
  完结: "bg-slate-100 text-slate-500",
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
    <section data-testid="forum-story-list" className="mx-4 mt-3 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-indigo-100 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-800">故事论坛</h2>
          <p className="mt-0.5 text-[10px] text-slate-400">连续事件与楼层讨论</p>
        </div>
        <span className="text-[10px] text-slate-400">{items.length} 个故事</span>
      </div>
      <div>
        {items.map((item) => (
          <button
            key={item.storyId}
            type="button"
            data-testid={`forum-story-${item.storyId}`}
            onClick={() => onOpen(item.storyId)}
            className="flex w-full items-center gap-3 border-b border-indigo-50 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-white/80 active:bg-white"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <strong className="truncate text-[13px] text-slate-800">{item.title}</strong>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${statusClass[item.status]}`}>
                  {item.status}
                </span>
              </span>
              <span className="mt-1 block text-[10px] text-slate-400">
                第 {item.currentEpisode} 集 · 更新于 {formatStoryTime(item.updatedAt)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        ))}
      </div>
    </section>
  );
}

