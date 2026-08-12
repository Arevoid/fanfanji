import { ChevronRight, MessageCircle, MessagesSquare } from "lucide-react";
import type { ForumShare } from "../../../types";

export function ForumShareCard({
  share,
  onOpen,
}: {
  share: ForumShare;
  onOpen: () => void;
}) {
  const snapshot = share.publicSnapshot;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="chat-message--forum-share w-[230px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition-transform active:scale-[0.98]"
      aria-label={`打开论坛帖子：${snapshot.title}`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
          <MessagesSquare className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-800">论坛分享</p>
          <p className="truncate text-[9px] text-slate-400">{snapshot.publicAuthor.displayName}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
      <div className="px-3 py-3">
        <h4 className="line-clamp-2 text-[13px] font-bold leading-5 text-slate-900">{snapshot.title}</h4>
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-500">
          {snapshot.body}
        </p>
        <div className="mt-2.5 flex items-center gap-1 text-[10px] text-slate-400">
          <MessageCircle className="h-3.5 w-3.5" />
          {snapshot.replyCount} 条回复
        </div>
      </div>
    </button>
  );
}
