import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, ChevronLeft, ChevronRight, List, LoaderCircle, X } from "lucide-react";
import {
  getReadingProgress,
  loadReadingBookContent,
  ReadingReaderError,
  saveReadingProgress,
  type ReadingBookContent,
  type ReadingParagraphView,
} from "../../features/reading/reader/readingReader";

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
  const [percent, setPercent] = useState(0);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    loadReadingBookContent(userIdentityId, bookId)
      .then((loaded) => {
        if (!active) return;
        setContent(loaded);
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
    <div data-theme-page="reading-reader" className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text-primary)]">
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
        <main ref={scrollRef} onScroll={handleScroll} aria-label="小说正文" className="flex-1 overflow-y-auto scroll-smooth px-6 pb-28 pt-8">
          <article className="mx-auto max-w-[42rem]">
            {content?.chapters.map((chapterView) => (
              <section key={chapterView.chapter.id} data-chapter-id={chapterView.chapter.id} className="mb-16">
                <h2 className="mb-10 mt-3 text-center text-xl font-bold tracking-wide">{chapterView.chapter.title}</h2>
                <div className="space-y-5">
                  {chapterView.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph.anchor.id}
                      ref={(element) => {
                        if (element) paragraphRefs.current.set(paragraph.anchor.id, element);
                        else paragraphRefs.current.delete(paragraph.anchor.id);
                      }}
                      data-anchor-id={paragraph.anchor.id}
                      className="text-justify text-[18px] leading-[2.05] tracking-[0.025em] [text-indent:2em]"
                    >
                      {paragraph.text}
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
        <footer className="absolute inset-x-4 bottom-4 z-20 flex h-11 items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 px-2 shadow-lg backdrop-blur">
          <button type="button" disabled={currentChapterIndex <= 0} onClick={() => jumpToChapter(currentChapterIndex - 1)} className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold disabled:opacity-30"><ChevronLeft className="h-4 w-4" />上一章</button>
          <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{percent.toFixed(1)}%</span>
          <button type="button" disabled={!content || currentChapterIndex >= content.chapters.length - 1} onClick={() => jumpToChapter(currentChapterIndex + 1)} className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold disabled:opacity-30">下一章<ChevronRight className="h-4 w-4" /></button>
        </footer>
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
