import { MessageCircle, ThumbsUp } from "lucide-react";
import type { ForumThread } from "../../../types";
import { getForumLikeCount } from "../../../domain/forum/forumData";
import { ForumAvatar } from "./ForumAvatar";

export function ForumThreadCard({
  thread,
  formattedTime,
  onOpen,
}: {
  thread: ForumThread;
  formattedTime: string;
  onOpen: () => void;
}) {
  return (
    <article className="border-b border-slate-100 bg-white px-4 py-4 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left active:opacity-70"
        aria-label={`查看帖子：${thread.title}`}
      >
        <div className="flex items-center gap-2.5">
          <ForumAvatar author={thread.publicAuthor} className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-semibold text-slate-800">
                {thread.publicAuthor.displayName}
              </span>
              {thread.publicAuthor.isAnonymous && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-500">
                  匿名
                </span>
              )}
            </div>
            <time className="text-[10px] text-slate-400">{formattedTime}</time>
          </div>
        </div>

        <h2 className="mt-3 line-clamp-2 text-[16px] font-bold leading-6 text-slate-900">
          {thread.title}
        </h2>
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-600">
          {thread.body}
        </p>

        <div className="mt-3 flex items-center gap-5 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5" />
            {getForumLikeCount(thread)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {thread.replyCount}
          </span>
        </div>
      </button>
    </article>
  );
}
