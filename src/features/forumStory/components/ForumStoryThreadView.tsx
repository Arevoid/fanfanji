import { MessageCircle, Reply, Send, Share2, ThumbsUp, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ForumPublicAuthor } from "../../../types";
import { ForumAvatar } from "../../forum/components/ForumAvatar";
import { getForumStoryUiThread, type ForumStoryUiReply } from "../forumStoryUiData";

const formatStoryTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
};

const authorFor = (name: string, avatar?: string): ForumPublicAuthor => ({
  displayName: name,
  ...(avatar ? { avatar } : {}),
  kind: "virtual",
  isAnonymous: false,
});

/**
 * Story records remain isolated in the ForumStory repositories, but this view
 * deliberately follows the ordinary Forum detail DOM, actions and floor layout.
 */
export function ForumStoryThreadView({
  storyId,
  onLike,
  onLikeReply,
  onUtilityAction,
  onSubmitComment,
  submitting = false,
}: {
  storyId: string;
  onLike?: (storyId: string) => void;
  onLikeReply?: (storyId: string, replyId: string) => void;
  onUtilityAction?: (action: "share" | "delete" | "translate", storyId: string, reply?: ForumStoryUiReply) => void;
  onSubmitComment?: (storyId: string, body: string, replyTo?: ForumStoryUiReply) => void | Promise<void>;
  submitting?: boolean;
}) {
  const view = getForumStoryUiThread(storyId);
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<ForumStoryUiReply | undefined>();
  const entries = useMemo(() => {
    if (!view) return [];
    const author = view.characters.find((character) => character.id === view.thread.authorCharacterId);
    const nextFloor = Math.max(1, ...view.replies.map((reply) => reply.floor)) + 1;
    return [
      ...view.replies.map((reply) => ({ kind: "reply" as const, reply, occurredAt: reply.occurredAt, floor: reply.floor })),
      ...view.updates.map((update, index) => ({ kind: "update" as const, update, occurredAt: update.updatedAt, floor: nextFloor + index, author })),
    ].sort((left, right) => left.occurredAt - right.occurredAt || left.floor - right.floor);
  }, [view]);

  if (!view) return <main className="min-h-0 flex-1 overflow-y-auto px-4 py-10 text-center text-sm text-slate-400">帖子暂不可用</main>;
  const author = view.characters.find((character) => character.id === view.thread.authorCharacterId);
  const threadAuthor = authorFor(author?.name || "匿名楼主", author?.avatar);
  const submit = async () => {
    const value = body.trim();
    if (!value || submitting || !onSubmitComment) return;
    await onSubmitComment(storyId, value, replyingTo);
    setBody("");
    setReplyingTo(undefined);
  };

  return <>
    <main data-testid="forum-story-thread" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-3">
      <article className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2.5">
          <ForumAvatar author={threadAuthor} className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-semibold text-slate-800">{threadAuthor.displayName}</span>
              <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold text-white">楼主</span>
            </div>
            <time className="mt-0.5 block text-[10px] text-slate-400">{formatStoryTime(view.thread.createdAt)}</time>
          </div>
          <span className="text-[10px] font-medium text-slate-300">1 楼</span>
        </div>
        <h1 className="mt-4 break-words text-[18px] font-bold leading-7 text-slate-950">{view.thread.title}</h1>
        <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">{view.thread.initialContent}</p>
        <div className="mt-4 grid grid-cols-4 items-center gap-1 border-t border-slate-100 pt-3">
          <button type="button" onClick={() => onLike?.(storyId)} className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] font-medium text-slate-500"><ThumbsUp className="h-4 w-4" />{view.thread.likeCount || 0}</button>
          <button type="button" onClick={() => document.getElementById("forum-reply-input")?.focus()} className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] text-slate-500"><MessageCircle className="h-4 w-4" />{view.replies.length}</button>
          <button type="button" onClick={() => onUtilityAction?.("share", storyId)} className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] font-medium text-slate-500"><Share2 className="h-4 w-4" />转发</button>
          <button type="button" onClick={() => onUtilityAction?.("delete", storyId)} className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] font-medium text-rose-400 active:text-rose-600"><Trash2 className="h-3.5 w-3.5" />删除</button>
        </div>
      </article>

      <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-[13px] font-bold text-slate-800">全部回复</h2></div>
        {entries.length === 0 ? <p className="px-4 py-10 text-center text-xs text-slate-400">还没有回复，来说点什么吧</p> : entries.map((entry) => {
          const isUpdate = entry.kind === "update";
          const reply = isUpdate ? undefined : entry.reply;
          const entryAuthor = isUpdate ? threadAuthor : authorFor(reply!.authorName, view.characters.find((character) => character.id === reply!.storyCharacterId)?.avatar);
          const label = isUpdate ? "楼主更新" : undefined;
          const content = isUpdate ? `${entry.update.title ? `${entry.update.title}\n` : ""}${entry.update.content}` : reply!.body;
          return <div key={isUpdate ? entry.update.id : reply!.id} className="border-b border-slate-100 px-4 py-4 last:border-b-0">
            <div className="flex items-start gap-2.5">
              <ForumAvatar author={entryAuthor} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-semibold text-slate-700">{entryAuthor.displayName}</span>
                  {label && <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[8px] font-semibold text-white">{label}</span>}
                </div>
                <time className="text-[9px] text-slate-400">{formatStoryTime(entry.occurredAt)}</time>
              </div>
              <span className="text-[10px] font-medium text-slate-300">{entry.floor} 楼</span>
            </div>
            {reply?.quoteContent && <div className="ml-10 mt-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500"><div className="mb-0.5 font-medium text-slate-600">回复 {reply.floor - 1} 楼</div><p className="break-words">{reply.quoteContent}</p></div>}
            <p className="ml-10 mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-700">{content}</p>
            {!isUpdate && <div className="ml-10 mt-3 flex items-center gap-4">
              <button type="button" onClick={() => onLikeReply?.(storyId, reply!.id)} className="inline-flex items-center gap-1 text-[11px] text-slate-400"><ThumbsUp className="h-3.5 w-3.5" />{reply!.likeCount}</button>
              <button type="button" onClick={() => onUtilityAction?.("delete", storyId, reply)} className="text-[11px] text-slate-300 active:text-red-500">删除</button>
              <button type="button" onClick={() => { setReplyingTo(reply); document.getElementById("forum-reply-input")?.focus(); }} className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Reply className="h-3.5 w-3.5" />回复此楼</button>
              <button type="button" onClick={() => onUtilityAction?.("translate", storyId, reply)} className="text-[11px] text-slate-400">翻译</button>
            </div>}
          </div>;
        })}
      </section>
    </main>
    <footer className="shrink-0 border-t border-slate-100 bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      {replyingTo && <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500"><button type="button" onClick={() => setReplyingTo(undefined)} className="font-semibold">取消</button><span className="truncate">回复 {replyingTo.floor} 楼 · {replyingTo.authorName}</span></div>}
      <div className="flex items-end gap-2"><textarea id="forum-reply-input" value={body} onChange={(event) => setBody(event.target.value)} rows={1} maxLength={2000} placeholder={replyingTo ? `回复 ${replyingTo.floor} 楼…` : "写下你的回复…"} className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] leading-5 outline-none focus:border-slate-400" /><button type="button" disabled={!body.trim() || submitting} onClick={() => void submit()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white disabled:bg-slate-200 disabled:text-slate-400" aria-label="发布回复"><Send className="h-4 w-4" /></button></div>
    </footer>
  </>;
}
