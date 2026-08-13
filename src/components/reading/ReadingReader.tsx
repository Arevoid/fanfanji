import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookOpenText, ChevronLeft, ChevronRight, Copy, Highlighter, List, LoaderCircle, Search, SlidersHorizontal, StickyNote, Trash2, X } from "lucide-react";
import { fontAssetDb } from "../../utils/fontAssetDb";
import { GLOBAL_FONT_ASSET_ID } from "../../features/theme/globalTypography";
import {
  getReadingProgress,
  loadReadingBookContent,
  ReadingReaderError,
  saveReadingProgress,
  type ReadingBookContent,
  type ReadingParagraphView,
} from "../../features/reading/reader/readingReader";
import {
  createReadingAnnotation,
  deleteReadingAnnotation,
  getReadingAnnotations,
  getReadingBookPreferences,
  saveReadingBookPreferences,
  searchReadingContent,
  toggleReadingBookmark,
  type ReadingSearchResult,
} from "../../features/reading/tools/readingTools";
import type { ReadingAnnotation, ReadingBookPreferences } from "../../domain/reading/types";

interface ReadingReaderProps {
  userIdentityId: string;
  bookId: string;
  onClose: () => void;
}

interface VisiblePosition {
  paragraph: ReadingParagraphView;
  chapterId: string;
  characterOffset: number;
  scrollOffsetHint: number;
}

export default function ReadingReader({ userIdentityId, bookId, onClose }: ReadingReaderProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const paragraphRefs = useRef(new Map<string, HTMLParagraphElement>());
  const progressTimerRef = useRef<number | null>(null);
  const currentPositionRef = useRef<VisiblePosition | null>(null);
  const restoredRef = useRef(false);
  const [content, setContent] = useState<ReadingBookContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [annotations, setAnnotations] = useState<ReadingAnnotation[]>([]);
  const [activeParagraph, setActiveParagraph] = useState<{ paragraph: ReadingParagraphView; chapterId: string; start: number; end: number } | null>(null);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ReadingBookPreferences>(() => getReadingBookPreferences(userIdentityId, bookId));
  const [customFontFamily, setCustomFontFamily] = useState<string | undefined>();
  const [percent, setPercent] = useState(0);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    loadReadingBookContent(userIdentityId, bookId)
      .then((loaded) => {
        if (!active) return;
        setContent(loaded);
        setAnnotations(getReadingAnnotations(userIdentityId, bookId));
        setPreferences(getReadingBookPreferences(userIdentityId, bookId));
        const progress = getReadingProgress(userIdentityId, bookId);
        setPercent(progress?.percent || 0);
        setCurrentChapterId(progress?.chapterId || loaded.chapters[0]?.chapter.id || null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof ReadingReaderError ? reason.message : "正文读取失败");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [bookId, userIdentityId]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let face: FontFace | null = null;
    if (!preferences.fontAssetId) {
      setCustomFontFamily(undefined);
      return undefined;
    }
    fontAssetDb.getFont(preferences.fontAssetId).then(async (blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      face = new FontFace("ReadingBookCustom", `url(${objectUrl})`);
      await face.load();
      document.fonts.add(face);
      setCustomFontFamily("ReadingBookCustom");
    }).catch(() => setCustomFontFamily(undefined));
    return () => {
      if (face) document.fonts.delete(face);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preferences.fontAssetId]);

  const flatParagraphs = useMemo(() => content?.chapters.flatMap((chapterView) =>
    chapterView.paragraphs.map((paragraph) => ({ paragraph, chapterId: chapterView.chapter.id }))) || [], [content]);

  const persistPosition = useCallback((position: VisiblePosition | null) => {
    if (!content || !position) return;
    try {
      const saved = saveReadingProgress({
        userIdentityId,
        bookId,
        chapterId: position.chapterId,
        paragraphAnchorId: position.paragraph.anchor.id,
        characterOffset: position.characterOffset,
        scrollOffsetHint: position.scrollOffsetHint,
        sourceCharacterLength: content.sourceCharacterLength,
      });
      setPercent(saved.percent);
    } catch {
      // Reading stays available when local progress persistence is temporarily unavailable.
    }
  }, [bookId, content, userIdentityId]);

  const scrollToAnchor = useCallback((anchorId: string, behavior: ScrollBehavior = "smooth", characterOffset = 0) => {
    const container = scrollRef.current;
    const element = paragraphRefs.current.get(anchorId);
    if (!container || !element) return;
    const ratio = element.textContent?.length ? characterOffset / element.textContent.length : 0;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const elementTop = elementRect.top - containerRect.top + container.scrollTop;
    const top = elementTop - 48 + elementRect.height * Math.min(Math.max(ratio, 0), 1);
    container.scrollTo({ top, behavior });
  }, []);

  useEffect(() => {
    if (!content || restoredRef.current) return;
    restoredRef.current = true;
    const progress = getReadingProgress(userIdentityId, bookId);
    const target = progress?.paragraphAnchorId || content.chapters[0]?.paragraphs[0]?.anchor.id;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToAnchor(target, "auto", progress?.characterOffset || 0));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bookId, content, scrollToAnchor, userIdentityId]);

  const captureVisiblePosition = useCallback(() => {
    const container = scrollRef.current;
    if (!container || flatParagraphs.length === 0) return null;
    const containerRect = container.getBoundingClientRect();
    const threshold = containerRect.top + 48;
    let chosen = flatParagraphs[0];
    let chosenElement = paragraphRefs.current.get(chosen.paragraph.anchor.id) || null;
    for (const candidate of flatParagraphs) {
      const element = paragraphRefs.current.get(candidate.paragraph.anchor.id);
      if (!element) continue;
      if (element.getBoundingClientRect().top <= threshold + 2) {
        chosen = candidate;
        chosenElement = element;
      } else {
        break;
      }
    }
    if (!chosenElement) return null;
    const rect = chosenElement.getBoundingClientRect();
    const atEnd = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
    const ratio = atEnd && chosen === flatParagraphs.at(-1)
      ? 1
      : Math.min(Math.max((threshold - rect.top) / Math.max(rect.height, 1), 0), 1);
    return {
      paragraph: chosen.paragraph,
      chapterId: chosen.chapterId,
      characterOffset: Math.round(chosen.paragraph.text.length * ratio),
      scrollOffsetHint: Math.round(rect.top - containerRect.top),
    } satisfies VisiblePosition;
  }, [flatParagraphs]);

  const handleScroll = () => {
    const position = captureVisiblePosition();
    if (!position) return;
    currentPositionRef.current = position;
    setCurrentChapterId(position.chapterId);
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => persistPosition(currentPositionRef.current), 220);
  };

  useEffect(() => () => {
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    persistPosition(currentPositionRef.current);
  }, [persistPosition]);

  const closeReader = () => {
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    persistPosition(currentPositionRef.current || (() => {
      const progress = getReadingProgress(userIdentityId, bookId);
      if (!progress) return null;
      const paragraph = flatParagraphs.find((item) => item.paragraph.anchor.id === progress.paragraphAnchorId);
      return paragraph ? {
        paragraph: paragraph.paragraph,
        chapterId: progress.chapterId,
        characterOffset: progress.characterOffset,
        scrollOffsetHint: progress.scrollOffsetHint || 0,
      } : null;
    })());
    onClose();
  };

  const currentChapterIndex = Math.max(0, content?.chapters.findIndex((chapter) => chapter.chapter.id === currentChapterId) ?? 0);
  const searchResults = useMemo(() => content ? searchReadingContent(content, searchQuery) : [], [content, searchQuery]);
  const refreshAnnotations = () => setAnnotations(getReadingAnnotations(userIdentityId, bookId));
  const updatePreferences = (patch: Partial<ReadingBookPreferences>) => {
    try {
      setPreferences(saveReadingBookPreferences({ ...preferences, ...patch, userIdentityId, bookId, updatedAt: preferences.updatedAt }));
    } catch {
      setToolMessage("阅读设置保存失败");
    }
  };

  const copyActiveParagraph = async () => {
    if (!activeParagraph) return;
    try {
      await navigator.clipboard.writeText(activeParagraph.paragraph.text.slice(activeParagraph.start, activeParagraph.end));
      setToolMessage("文字已复制");
    } catch {
      setToolMessage("复制失败，请使用系统文本选择复制");
    }
  };

  const toggleHighlight = () => {
    if (!activeParagraph) return;
    const existing = annotations.find((item) => item.kind === "highlight"
      && item.paragraphAnchorId === activeParagraph.paragraph.anchor.id
      && item.range?.start === activeParagraph.start
      && item.range.end === activeParagraph.end);
    try {
      if (existing) deleteReadingAnnotation(userIdentityId, existing.id);
      else createReadingAnnotation({ userIdentityId, bookId, chapterId: activeParagraph.chapterId, paragraph: activeParagraph.paragraph, kind: "highlight", start: activeParagraph.start, end: activeParagraph.end });
      refreshAnnotations();
      setToolMessage(existing ? "已取消高亮" : "文字已高亮");
    } catch { setToolMessage("高亮保存失败"); }
  };

  const toggleBookmark = () => {
    if (!activeParagraph) return;
    try {
      const result = toggleReadingBookmark({ userIdentityId, bookId, chapterId: activeParagraph.chapterId, paragraph: activeParagraph.paragraph });
      refreshAnnotations();
      setToolMessage(result.active ? "书签已添加" : "书签已移除");
    } catch { setToolMessage("书签保存失败"); }
  };

  const addNote = () => {
    if (!activeParagraph) return;
    const note = window.prompt("写下这段文字旁边的笔记：", "");
    if (!note?.trim()) return;
    try {
      createReadingAnnotation({ userIdentityId, bookId, chapterId: activeParagraph.chapterId, paragraph: activeParagraph.paragraph, kind: "note", note, start: activeParagraph.start, end: activeParagraph.end });
      refreshAnnotations();
      setToolMessage("笔记已保存");
    } catch { setToolMessage("笔记保存失败"); }
  };

  const jumpToSearchResult = (result: ReadingSearchResult) => {
    setCurrentChapterId(result.chapterId);
    setIsSearchOpen(false);
    scrollToAnchor(result.paragraph.anchor.id, "smooth", result.matchStart);
  };

  const selectParagraphRange = (paragraph: ReadingParagraphView, chapterId: string, element: HTMLParagraphElement) => {
    const selection = window.getSelection();
    let start = 0;
    let end = paragraph.text.length;
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) {
        const prefix = range.cloneRange();
        prefix.selectNodeContents(element);
        prefix.setEnd(range.startContainer, range.startOffset);
        start = Math.min(prefix.toString().length, paragraph.text.length);
        end = Math.min(start + range.toString().length, paragraph.text.length);
      }
    }
    setActiveParagraph({ paragraph, chapterId, start, end });
    setToolMessage(null);
  };

  const renderParagraphText = (paragraph: ReadingParagraphView) => {
    const highlights = annotations
      .filter((item) => item.paragraphAnchorId === paragraph.anchor.id && item.kind === "highlight" && item.range)
      .map((item) => item.range!)
      .sort((left, right) => left.start - right.start);
    if (highlights.length === 0) return paragraph.text;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    highlights.forEach((range, index) => {
      const start = Math.max(cursor, range.start);
      const end = Math.min(Math.max(start, range.end), paragraph.text.length);
      if (start > cursor) parts.push(paragraph.text.slice(cursor, start));
      if (end > start) parts.push(<mark key={`${start}:${end}:${index}`} className="rounded-sm bg-amber-200/70 text-inherit">{paragraph.text.slice(start, end)}</mark>);
      cursor = Math.max(cursor, end);
    });
    if (cursor < paragraph.text.length) parts.push(paragraph.text.slice(cursor));
    return parts;
  };
  const jumpToChapter = (index: number) => {
    const chapter = content?.chapters[index];
    const paragraph = chapter?.paragraphs[0];
    if (!chapter || !paragraph) return;
    const position: VisiblePosition = {
      paragraph,
      chapterId: chapter.chapter.id,
      characterOffset: 0,
      scrollOffsetHint: 48,
    };
    currentPositionRef.current = position;
    persistPosition(position);
    setCurrentChapterId(chapter.chapter.id);
    setIsTocOpen(false);
    scrollToAnchor(paragraph.anchor.id);
  };

  return (
    <div data-theme-page="reading-reader" className="relative flex h-full flex-col overflow-hidden" style={{ background: preferences.background, color: preferences.textColor, fontFamily: customFontFamily }}>
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-2 backdrop-blur">
        <button type="button" onClick={closeReader} aria-label="返回书籍详情" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0 px-3 text-center"><h1 className="max-w-56 truncate text-sm font-bold">{content?.book.title || "阅读"}</h1><p className="mt-0.5 max-w-56 truncate text-[10px] text-[var(--text-muted)]">{content?.chapters[currentChapterIndex]?.chapter.title || "正在打开正文"}</p></div>
        <button type="button" onClick={() => setIsTocOpen(true)} aria-label="打开目录" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><List className="h-4 w-4" /></button>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><LoaderCircle className="h-5 w-5 animate-spin" />正在加载正文</div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><BookOpenText className="h-8 w-8 text-[var(--text-muted)]" /><p className="mt-4 text-sm font-bold">无法打开这本书</p><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{error}</p></div>
      ) : (
        <main ref={scrollRef} onScroll={handleScroll} aria-label="小说正文" className="flex-1 overflow-y-auto scroll-smooth pb-28 pt-8" style={{ paddingLeft: preferences.pageMargin, paddingRight: preferences.pageMargin }}>
          <article className="mx-auto max-w-[42rem]">
            {content?.chapters.map((chapterView) => (
              <section key={chapterView.chapter.id} data-chapter-id={chapterView.chapter.id} className="mb-16">
                <h2 className="mb-10 mt-3 text-center text-xl font-bold tracking-wide">{chapterView.chapter.title}</h2>
                <div>
                  {chapterView.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph.anchor.id}
                      ref={(element) => {
                        if (element) paragraphRefs.current.set(paragraph.anchor.id, element);
                        else paragraphRefs.current.delete(paragraph.anchor.id);
                      }}
                      data-anchor-id={paragraph.anchor.id}
                      onMouseUp={(event) => selectParagraphRange(paragraph, chapterView.chapter.id, event.currentTarget)}
                      onTouchEnd={(event) => selectParagraphRange(paragraph, chapterView.chapter.id, event.currentTarget)}
                      className={`relative rounded-md transition-colors ${annotations.some((item) => item.paragraphAnchorId === paragraph.anchor.id && item.kind === "note") ? "border-b border-dashed border-current" : ""}`}
                      style={{
                        fontSize: preferences.fontSize,
                        lineHeight: preferences.lineHeight,
                        letterSpacing: `${preferences.letterSpacing}em`,
                        textAlign: preferences.textAlign,
                        textIndent: `${preferences.firstLineIndent}em`,
                        marginBottom: preferences.paragraphSpacing,
                      }}
                    >
                      {renderParagraphText(paragraph)}
                      {annotations.some((item) => item.paragraphAnchorId === paragraph.anchor.id && item.kind === "bookmark") && <Bookmark className="absolute -right-4 top-1 h-3.5 w-3.5 fill-current" aria-label="已添加书签" />}
                    </p>
                  ))}
                </div>
              </section>
            ))}
            <div className="pb-8 text-center text-xs tracking-[0.3em] text-[var(--text-muted)]">本书完</div>
          </article>
        </main>
      )}

      {!isLoading && !error && (
        <footer className="absolute inset-x-3 bottom-3 z-20 flex h-12 items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 px-1 shadow-lg backdrop-blur text-[var(--text-primary)]">
          <button type="button" disabled={currentChapterIndex <= 0} onClick={() => jumpToChapter(currentChapterIndex - 1)} className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold disabled:opacity-30"><ChevronLeft className="h-4 w-4" />上一章</button>
          <button type="button" onClick={() => setIsSearchOpen(true)} aria-label="搜索正文" className="flex h-8 w-8 items-center justify-center rounded-xl"><Search className="h-4 w-4" /></button>
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{percent.toFixed(1)}%</span>
          <button type="button" onClick={() => setIsSettingsOpen(true)} aria-label="阅读设置" className="flex h-8 w-8 items-center justify-center rounded-xl"><SlidersHorizontal className="h-4 w-4" /></button>
          <button type="button" disabled={!content || currentChapterIndex >= content.chapters.length - 1} onClick={() => jumpToChapter(currentChapterIndex + 1)} className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold disabled:opacity-30">下一章<ChevronRight className="h-4 w-4" /></button>
        </footer>
      )}

      {activeParagraph && !isTocOpen && !isSearchOpen && !isSettingsOpen && (
        <div className="absolute inset-x-4 bottom-16 z-30 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text-primary)] shadow-xl">
          <div className="grid grid-cols-4 gap-1">
            <button type="button" onClick={copyActiveParagraph} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px]"><Copy className="h-4 w-4" />复制</button>
            <button type="button" onClick={toggleHighlight} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px]"><Highlighter className="h-4 w-4" />高亮</button>
            <button type="button" onClick={addNote} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px]"><StickyNote className="h-4 w-4" />笔记</button>
            <button type="button" onClick={toggleBookmark} className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px]"><Bookmark className="h-4 w-4" />书签</button>
          </div>
          <button type="button" onClick={() => setActiveParagraph(null)} aria-label="关闭段落工具" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"><X className="h-3 w-3" /></button>
          {toolMessage && <p className="border-t border-[var(--border)] px-2 pt-2 text-center text-[10px] text-[var(--text-muted)]">{toolMessage}</p>}
          {annotations.filter((item) => item.paragraphAnchorId === activeParagraph.paragraph.anchor.id && item.kind === "note").map((item) => (
            <div key={item.id} className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--surface-raised)] p-2 text-xs"><p className="min-w-0 flex-1 leading-5">{item.note}</p><button type="button" aria-label="删除笔记" onClick={() => { deleteReadingAnnotation(userIdentityId, item.id); refreshAnnotations(); }}><Trash2 className="h-3.5 w-3.5" /></button></div>
          ))}
        </div>
      )}

      {isSearchOpen && content && (
        <div className="absolute inset-0 z-40 flex bg-black/35" role="dialog" aria-modal="true" aria-label="搜索小说正文">
          <div className="mt-auto flex max-h-[88%] w-full flex-col rounded-t-[2rem] bg-[var(--surface)] text-[var(--text-primary)] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-[var(--border)] p-4"><Search className="h-4 w-4" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索书中内容" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none" /><button type="button" onClick={() => setIsSearchOpen(false)} aria-label="关闭搜索" className="flex h-8 w-8 items-center justify-center"><X className="h-4 w-4" /></button></div>
            <div className="overflow-y-auto px-3 pb-6 pt-2">
              {!searchQuery.trim() ? <p className="p-8 text-center text-xs text-[var(--text-muted)]">输入关键词搜索当前小说</p> : searchResults.length === 0 ? <p className="p-8 text-center text-xs text-[var(--text-muted)]">没有找到相关内容</p> : searchResults.map((result) => (
                <button key={`${result.paragraph.anchor.id}:${result.matchStart}`} type="button" onClick={() => jumpToSearchResult(result)} className="w-full rounded-2xl px-3 py-3 text-left hover:bg-[var(--surface-raised)]"><p className="text-[10px] font-bold text-[var(--text-muted)]">{result.chapterTitle}</p><p className="mt-1 text-sm leading-6">{result.snippet}</p></button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="absolute inset-0 z-40 flex bg-black/35" role="dialog" aria-modal="true" aria-label="阅读排版设置">
          <div className="mt-auto max-h-[90%] w-full overflow-y-auto rounded-t-[2rem] bg-[var(--surface)] p-5 text-[var(--text-primary)] shadow-2xl">
            <div className="flex items-center justify-between"><div><h2 className="text-base font-bold">阅读设置</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">仅应用于这本书</p></div><button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="关闭阅读设置" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><X className="h-4 w-4" /></button></div>
            {[
              ["字号", "fontSize", 14, 30, 1, `${preferences.fontSize}px`],
              ["行间距", "lineHeight", 1.4, 2.8, 0.05, String(preferences.lineHeight)],
              ["段间距", "paragraphSpacing", 6, 40, 1, `${preferences.paragraphSpacing}px`],
              ["字间距", "letterSpacing", 0, 0.16, 0.005, `${preferences.letterSpacing}em`],
              ["页边距", "pageMargin", 12, 48, 1, `${preferences.pageMargin}px`],
            ].map(([label, key, min, max, step, display]) => (
              <label key={String(key)} className="mt-4 block text-xs font-bold"><span className="flex justify-between"><span>{label}</span><span className="text-[var(--text-muted)]">{display}</span></span><input type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={Number(preferences[key as keyof ReadingBookPreferences])} onChange={(event) => updatePreferences({ [key]: Number(event.target.value) })} className="mt-2 w-full" /></label>
            ))}
            <div className="mt-5"><p className="text-xs font-bold">阅读背景</p><div className="mt-2 grid grid-cols-4 gap-2">{[
              ["#f6f1e7", "#2f2b25"], ["#ffffff", "#202020"], ["#dce8d5", "#263127"], ["#171717", "#dedede"],
            ].map(([background, textColor]) => <button key={background} type="button" aria-label={`背景 ${background}`} onClick={() => updatePreferences({ background, textColor })} className="h-10 rounded-xl border-2" style={{ background, borderColor: preferences.background === background ? "var(--text-primary)" : "transparent" }} />)}</div></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => updatePreferences({ textAlign: preferences.textAlign === "justify" ? "left" : "justify" })} className="h-10 rounded-xl border border-[var(--border)] text-xs font-bold">{preferences.textAlign === "justify" ? "两端对齐" : "左对齐"}</button><button type="button" onClick={() => updatePreferences({ firstLineIndent: preferences.firstLineIndent ? 0 : 2 })} className="h-10 rounded-xl border border-[var(--border)] text-xs font-bold">首行缩进 {preferences.firstLineIndent ? "开" : "关"}</button></div>
            <label className="mt-4 flex items-center justify-between rounded-2xl border border-[var(--border)] p-3 text-xs font-bold"><span>引用全局上传字体</span><input type="checkbox" checked={preferences.fontAssetId === GLOBAL_FONT_ASSET_ID} onChange={(event) => updatePreferences({ fontAssetId: event.target.checked ? GLOBAL_FONT_ASSET_ID : undefined })} /></label>
          </div>
        </div>
      )}

      {isTocOpen && content && (
        <div className="absolute inset-0 z-40 flex bg-black/35" role="dialog" aria-modal="true" aria-label="阅读目录">
          <div className="mt-auto flex max-h-[82%] w-full flex-col rounded-t-[2rem] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h2 className="text-base font-bold">目录</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">共 {content.chapters.length} 章</p></div><button type="button" onClick={() => setIsTocOpen(false)} aria-label="关闭目录" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><X className="h-4 w-4" /></button></div>
            <div className="overflow-y-auto px-3 pb-6 pt-2">
              {content.chapters.map((chapterView, index) => (
                <button key={chapterView.chapter.id} type="button" onClick={() => jumpToChapter(index)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ${chapterView.chapter.id === currentChapterId ? "bg-[var(--surface-raised)]" : ""}`}>
                  <span className="w-8 text-[11px] tabular-nums text-[var(--text-muted)]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{chapterView.chapter.title}</span><span className="text-[10px] text-[var(--text-muted)]">{chapterView.chapter.wordCount.toLocaleString()} 字</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
