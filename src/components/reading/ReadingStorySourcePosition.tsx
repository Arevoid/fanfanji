import { useEffect, useMemo, useState } from "react";
import type { ReadingSourceContinuity, ReadingSourceCursor } from "../../domain/reading/sourceContinuity";
import { listReadingStorySourceStarts, requireReadingStorySourceCursor } from "../../features/reading/story/readingStorySource";

export function ReadingStorySourcePosition({ userIdentityId, bookId, cursor, onChange, disabled }: { userIdentityId: string; bookId: string; cursor?: ReadingSourceCursor; onChange: (cursor: ReadingSourceCursor) => void; disabled?: boolean }) {
  const chapters = useMemo(() => listReadingStorySourceStarts(userIdentityId, bookId), [userIdentityId, bookId]);
  const selected = chapters.find(chapter => chapter.chapterId === cursor?.chapterId) || chapters[0];
  return <div className="space-y-3 text-xs">
    <label className="block">原著章节<select aria-label="原著章节" disabled={disabled || !chapters.length} value={selected?.chapterId || ""} onChange={event => { const next = chapters.find(item => item.chapterId === event.target.value)?.paragraphs[0]; if (next) onChange(next.cursor); }} className="mt-2 h-11 w-full rounded-xl border border-current/20 bg-transparent px-3">{chapters.map(chapter => <option key={chapter.chapterId} value={chapter.chapterId}>{chapter.title}</option>)}</select></label>
    <label className="block">进入段落<select aria-label="原著段落" disabled={disabled || !selected?.paragraphs.length} value={selected?.paragraphs.find(paragraph => paragraph.cursor.paragraphAnchorId === cursor?.paragraphAnchorId)?.cursor.paragraphAnchorId || selected?.paragraphs[0]?.cursor.paragraphAnchorId || ""} onChange={event => { const next = selected?.paragraphs.find(item => item.cursor.paragraphAnchorId === event.target.value); if (next) onChange(next.cursor); }} className="mt-2 h-11 w-full rounded-xl border border-current/20 bg-transparent px-3">{selected?.paragraphs.map(paragraph => <option key={paragraph.cursor.paragraphAnchorId} value={paragraph.cursor.paragraphAnchorId}>{paragraph.label}</option>)}</select></label>
    <p className="leading-5 opacity-60">默认从原著开头进入，也可指定章节和段落。仅定位本地原文，不调用 API；单章小说同样按段落推进。</p>
    {!selected?.paragraphs.length && <p role="alert">暂无可定位的正文段落，请先重新导入小说。</p>}
  </div>;
}
export function ReadingStorySourcePanel({ userIdentityId, bookId, continuity, onApply, disabled }: { userIdentityId: string; bookId: string; continuity?: ReadingSourceContinuity; onApply: (cursor: ReadingSourceCursor) => void; disabled?: boolean }) {
  const [cursor, setCursor] = useState(() => continuity?.cursor || listReadingStorySourceStarts(userIdentityId, bookId)[0]?.paragraphs[0]?.cursor);
  useEffect(() => { setCursor(continuity?.cursor || listReadingStorySourceStarts(userIdentityId, bookId)[0]?.paragraphs[0]?.cursor); }, [continuity?.cursor.chapterId, continuity?.cursor.paragraphAnchorId, continuity?.cursor.characterOffset, bookId, userIdentityId]);
  let valid = false;
  try { if (continuity) { requireReadingStorySourceCursor(userIdentityId, bookId, continuity.cursor); valid = true; } } catch { /* Explicit relocation only; keep the existing branch intact. */ }
  return <div className="space-y-4">
    <p className="text-xs leading-6">{valid ? (continuity?.mode === "diverged" ? "已产生改写，后续将承接本分支。" : "尽量遵循原著，用户行动可以改变发展。") : "原著尚未定位或版本已变化，请选择接续位置。已有正文、用户行动和分支不会重写。"}</p>
    <ReadingStorySourcePosition userIdentityId={userIdentityId} bookId={bookId} cursor={cursor} onChange={setCursor} disabled={disabled} />
    <button type="button" disabled={disabled || !cursor} onClick={() => cursor && onApply(cursor)} className="h-11 w-full rounded-xl border border-amber-400/30 bg-amber-400/10 text-xs font-bold disabled:opacity-40">应用原著定位（保留已有剧情）</button>
    {continuity?.summary && <div className="text-xs leading-6"><p className="font-bold">这次穿书已经发生</p><p className="whitespace-pre-wrap opacity-70">{continuity.summary}</p></div>}
    {!!continuity?.changes.length && <div className="space-y-2 text-xs leading-5"><p className="font-bold">已改变的条件</p>{continuity.changes.map((item,index) => <p key={`${item.nodeId}-${index}`} className="opacity-70">{item.eventLabel}：{item.reason}</p>)}</div>}
  </div>;
}
