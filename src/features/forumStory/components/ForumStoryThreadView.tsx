import { Clock3, Heart, RefreshCw, UserRound } from "lucide-react";
import { getForumStoryUiThread } from "../forumStoryUiData";

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

export function ForumStoryThreadView({
  storyId,
  onLike,
  onRequestUpdate,
  updating = false,
}: {
  storyId: string;
  onLike?: (storyId: string) => void;
  onRequestUpdate?: (storyId: string) => void;
  updating?: boolean;
}) {
  const view = getForumStoryUiThread(storyId);
  if (!view) {
    return <main className="min-h-0 flex-1 overflow-y-auto px-4 py-10 text-center text-sm text-slate-400">故事内容暂不可用</main>;
  }
  const author = view.characters.find((character) => character.id === view.thread.authorCharacterId);
  return (
    <main data-testid="forum-story-thread" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-3">
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <BookOpenIcon />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-lg font-bold text-slate-900">{view.story.title || view.thread.title}</h1>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                {view.story.status === "completed" ? "完结" : view.story.status === "waiting_update" ? "等待更新" : "连载中"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">第 {view.story.currentEpisode} 集 · {view.story.premise}</p>
          </div>
        </div>
        {view.characters.length > 0 && (
          <div className="mt-4 border-t border-indigo-100 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">故事角色</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {view.characters.map((character) => (
                <span key={character.id} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] text-slate-600 shadow-sm">
                  <UserRound className="h-3 w-3 text-indigo-400" />
                  {character.name} · {character.role}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <article className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserRound className="h-4 w-4" /></span>
          <span className="font-semibold text-slate-700">{author?.name || "故事楼主"}</span>
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] text-indigo-500">楼主</span>
        </div>
        <h2 className="mt-3 break-words text-[17px] font-bold leading-6 text-slate-900">{view.thread.title}</h2>
        <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">{view.thread.initialContent}</p>
        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => onLike?.(storyId)}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-500 active:bg-rose-100"
          >
            <Heart className="h-3.5 w-3.5" /> 赞 {view.thread.likeCount || 0}
          </button>
          {view.story.status !== "completed" && (
            <button
              type="button"
              disabled={updating}
              onClick={() => onRequestUpdate?.(storyId)}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${updating ? "animate-spin" : ""}`} />
              {updating ? "楼主整理中" : "催更 / 刷新进展"}
            </button>
          )}
          <span className="ml-auto text-[10px] text-slate-400">{view.thread.viewCount || 0} 浏览</span>
        </div>
      </article>

      {view.updates.map((update) => (
        <article key={update.id} data-testid={`forum-story-update-${update.id}`} className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-amber-700">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold">楼主更新</span>
            <time className="inline-flex items-center gap-1 text-amber-500"><Clock3 className="h-3 w-3" />{formatStoryTime(update.updatedAt)}</time>
          </div>
          {update.title && <h2 className="mt-2 text-[15px] font-bold text-slate-900">{update.title}</h2>}
          <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">{update.content}</p>
          {update.eventProgression && <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] leading-5 text-amber-700">事件推进：{update.eventProgression}</p>}
        </article>
      ))}

      <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-[13px] font-bold text-slate-800">评论讨论</h2>
          <p className="mt-1 text-[10px] text-slate-400">{view.replies.length} 条故事评论</p>
        </div>
        {view.replies.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-slate-400">暂时还没有评论</p>
        ) : view.replies.map((reply) => (
          <article key={reply.id} className="border-b border-slate-100 px-4 py-4 last:border-b-0">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserRound className="h-3.5 w-3.5" /></span>
              <span className="font-semibold text-slate-700">{reply.authorName}</span>
              <span className="text-slate-300">#{reply.floor}</span>
              <time className="ml-auto text-[9px] text-slate-400">{formatStoryTime(reply.occurredAt)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words pl-9 text-[13px] leading-5 text-slate-600">{reply.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function BookOpenIcon() {
  return <span className="text-lg leading-none" aria-hidden="true">📖</span>;
}

