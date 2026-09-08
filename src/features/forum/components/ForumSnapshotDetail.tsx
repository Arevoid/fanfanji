import { MessageCircle } from "lucide-react";
import type { ForumThreadPublicSnapshot } from "../../../types";
import { ForumAvatar } from "./ForumAvatar";

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function ForumSnapshotDetail({ snapshot }: { snapshot: ForumThreadPublicSnapshot }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
      <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700">
        原帖已删除，以下为转发时保存的公开快照。
      </div>
      <article className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2.5">
          <ForumAvatar author={snapshot.publicAuthor} className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-slate-800">{snapshot.publicAuthor.displayName}</span>
              <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold text-white">楼主</span>
            </div>
            <time className="text-[10px] text-slate-400">{formatTime(snapshot.occurredAt)}</time>
          </div>
          <span className="text-[10px] text-slate-300">1 楼</span>
        </div>
        <h2 className="mt-4 break-words text-[18px] font-bold leading-7 text-slate-950">{snapshot.title}</h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">{snapshot.body}</p>
        <div className="mt-4 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <MessageCircle className="h-4 w-4" />
          {snapshot.replyCount}
        </div>
      </article>

      <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-4 py-3 text-[13px] font-bold text-slate-800">转发时的公开回复</h3>
        {snapshot.replies.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-slate-400">转发时没有回复</p>
        ) : snapshot.replies.map((reply) => (
          <div key={reply.id} className="border-b border-slate-100 px-4 py-4 last:border-b-0">
            <div className="flex items-start gap-2.5">
              <ForumAvatar author={reply.publicAuthor} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[12px] font-semibold text-slate-700">{reply.publicAuthor.displayName}</p>
                  {reply.kind === "author-update" && (
                    <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                      楼主更新
                    </span>
                  )}
                </div>
                <time className="text-[9px] text-slate-400">{formatTime(reply.occurredAt)}</time>
              </div>
              <span className="text-[10px] text-slate-300">{reply.floor} 楼</span>
            </div>
            {reply.replyToFloor && (
              <div className="ml-10 mt-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                回复 {reply.replyToFloor} 楼 · {reply.replyToAuthorName}
                {reply.quotedText && <p className="mt-0.5 break-words">{reply.quotedText}</p>}
              </div>
            )}
            <p className="ml-10 mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-700">{reply.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
