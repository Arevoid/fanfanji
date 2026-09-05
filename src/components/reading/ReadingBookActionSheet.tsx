import React from "react";
import { BookOpenText, ImagePlus, Pencil, Sparkles, Trash2, UsersRound, X } from "lucide-react";
import type { ReadingBook } from "../../domain/reading/types";
import ReadingBookCover from "./ReadingBookCover";

export type ReadingBookAction = "edit" | "cover" | "clear_cover" | "co_read" | "story" | "delete";

export default function ReadingBookActionSheet({ book, canInvite, onAction, onClose }: {
  book: ReadingBook;
  canInvite: boolean;
  onAction: (action: ReadingBookAction) => void;
  onClose: () => void;
}) {
  const actions = [
    { id: "edit" as const, label: "编辑", detail: "书名、作者与简介", Icon: Pencil },
    { id: "cover" as const, label: "书籍封面", detail: "从本地选择图片", Icon: ImagePlus },
    ...(book.coverUrl ? [{ id: "clear_cover" as const, label: "清除封面", detail: "恢复自动生成的默认封面", Icon: Trash2 }] : []),
    { id: "co_read" as const, label: "共读", detail: canInvite ? "选择一位 AI 好友" : "暂无可邀请好友", Icon: UsersRound, disabled: !canInvite },
    { id: "story" as const, label: "穿书", detail: "单人或与 AI 好友进入", Icon: Sparkles },
    { id: "delete" as const, label: "永久删除", detail: "删除书籍、正文与阅读记录", Icon: Trash2, danger: true },
  ];
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`${book.title}操作菜单`} onClick={onClose}>
    <div className="w-full max-w-md rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4"><ReadingBookCover book={book} className="h-20 w-15 rounded-xl" /><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">书籍操作</p><h2 className="mt-1 line-clamp-2 text-base font-black">{book.title}</h2><p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">短按直接阅读</p></div><button type="button" onClick={onClose} aria-label="关闭书籍操作" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><X className="h-4 w-4" /></button></div>
      <div className="grid grid-cols-2 gap-2 pt-4">{actions.map(({ id, label, detail, Icon, disabled, danger }) => <button key={id} type="button" disabled={disabled} onClick={() => onAction(id)} data-reading-delete={danger ? "true" : undefined} className={`${danger ? "col-span-2 flex h-10 items-center justify-center gap-2 rounded-xl border-rose-300/40 bg-rose-500/10 px-3 text-rose-500" : "rounded-2xl border p-4 text-left"} border disabled:opacity-40 ${danger ? "" : "border-[var(--border)] bg-[var(--surface-raised)]"}`}><Icon className={danger ? "h-4 w-4" : "h-5 w-5"} /><span className={danger ? "text-xs font-bold" : "mt-3 block text-sm font-bold"}>{label}</span>{!danger && <p className="mt-1 text-[10px] text-[var(--text-muted)]">{detail}</p>}</button>)}</div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[var(--surface-raised)] p-3 text-[10px] leading-4 text-[var(--text-muted)]"><BookOpenText className="h-4 w-4 shrink-0" />长按仅打开操作菜单，不会改变阅读进度。</div>
    </div>
  </div>;
}
