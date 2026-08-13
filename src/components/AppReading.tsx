import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  BookMarked,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  FileText,
  HardDrive,
  Library,
  LoaderCircle,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { loadReadingStore } from "../core/storage/repositories/readingRepository";
import type { ReadingBook, ReadingChapter, ReadingProgress } from "../domain/reading/types";
import { importReadingFile, ReadingImportError } from "../features/reading/import/readingImport";
import {
  deleteReadingBook,
  ensureReadingBookParsed,
  ReadingLibraryError,
  retryReadingAssetCleanup,
  setReadingBookArchived,
  updateReadingBookDetails,
} from "../features/reading/library/readingLibrary";
import ReadingReader from "./reading/ReadingReader";

interface AppReadingProps {
  userIdentityId: string;
  onClose: () => void;
}

type Notice = { tone: "success" | "error" | "info"; text: string };

const formatDate = (timestamp: number): string => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
}).format(new Date(timestamp));

export default function AppReading({ userIdentityId, onClose }: AppReadingProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [chapters, setChapters] = useState<ReadingChapter[]>([]);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [section, setSection] = useState<"library" | "archived">("library");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [readingBookId, setReadingBookId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const refreshLibrary = useCallback(() => {
    const store = loadReadingStore().value;
    setBooks(store.books
      .filter((book) => book.userIdentityId === userIdentityId)
      .sort((left, right) => right.updatedAt - left.updatedAt));
    setChapters(store.chapters
      .filter((chapter) => chapter.userIdentityId === userIdentityId)
      .sort((left, right) => left.order - right.order));
    setProgress(store.progress.filter((item) => item.userIdentityId === userIdentityId));
  }, [userIdentityId]);

  useEffect(() => {
    refreshLibrary();
    retryReadingAssetCleanup(userIdentityId).catch(() => undefined);
  }, [refreshLibrary, userIdentityId]);

  const visibleBooks = useMemo(() => books.filter((book) =>
    section === "archived" ? book.status === "archived" : book.status !== "archived"), [books, section]);
  const selectedBook = books.find((book) => book.id === selectedBookId) || null;
  const selectedChapters = selectedBook
    ? chapters.filter((chapter) => chapter.bookId === selectedBook.id)
    : [];
  const selectedProgress = selectedBook ? progress.find((item) => item.bookId === selectedBook.id) : null;

  const showError = (error: unknown, fallback: string) => {
    const text = error instanceof ReadingImportError || error instanceof ReadingLibraryError ? error.message : fallback;
    setNotice({ tone: "error", text });
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isImporting) return;
    setIsImporting(true);
    setNotice(null);
    try {
      let result = await importReadingFile(file, userIdentityId);
      if (result.status === "duplicate") {
        const keepBoth = window.confirm(`《${result.prepared.title}》的内容已经存在。是否仍然另存为一本新书？`);
        if (!keepBoth) {
          setNotice({ tone: "info", text: "检测到重复内容，已保留原有书籍。" });
          return;
        }
        result = await importReadingFile(file, userIdentityId, { duplicateStrategy: "keep-both" });
      }
      if (result.status === "imported") {
        refreshLibrary();
        setSection("library");
        setNotice({ tone: "success", text: `《${result.book.title}》已解析并安全保存到本地。` });
      }
    } catch (error) {
      showError(error, "导入失败，请稍后重试");
    } finally {
      setIsImporting(false);
    }
  };

  const openBookDetails = async (book: ReadingBook) => {
    setSelectedBookId(book.id);
    setIsEditing(false);
    setNotice(null);
    if (book.chapterCount > 0) return;
    setIsWorking(true);
    try {
      await ensureReadingBookParsed(userIdentityId, book.id);
      refreshLibrary();
    } catch (error) {
      showError(error, "章节解析失败");
    } finally {
      setIsWorking(false);
    }
  };

  const beginEditing = () => {
    if (!selectedBook) return;
    setTitleDraft(selectedBook.title);
    setAuthorDraft(selectedBook.author || "");
    setDescriptionDraft(selectedBook.description || "");
    setIsEditing(true);
  };

  const saveDetails = () => {
    if (!selectedBook) return;
    try {
      updateReadingBookDetails({
        userIdentityId,
        bookId: selectedBook.id,
        title: titleDraft,
        author: authorDraft,
        description: descriptionDraft,
      });
      refreshLibrary();
      setIsEditing(false);
      setNotice({ tone: "success", text: "书籍资料已保存。" });
    } catch (error) {
      showError(error, "书籍资料保存失败");
    }
  };

  const handleArchive = () => {
    if (!selectedBook) return;
    try {
      const archived = selectedBook.status !== "archived";
      setReadingBookArchived(userIdentityId, selectedBook.id, archived);
      refreshLibrary();
      setSelectedBookId(null);
      setSection(archived ? "archived" : "library");
      setNotice({ tone: "success", text: archived ? "书籍已归档，正文和标注均被保留。" : "书籍已移回书架。" });
    } catch (error) {
      showError(error, "归档状态更新失败");
    }
  };

  const handleDelete = async () => {
    if (!selectedBook || isWorking) return;
    if (!window.confirm(`确定永久删除《${selectedBook.title}》吗？本地正文、进度和标注都会被移除。`)) return;
    setIsWorking(true);
    try {
      const result = await deleteReadingBook(userIdentityId, selectedBook.id);
      refreshLibrary();
      setSelectedBookId(null);
      setNotice(result.status === "deleted"
        ? { tone: "success", text: "书籍及本地正文已删除。" }
        : { tone: "info", text: "书籍已移除，正文清理将在下次进入时自动重试。" });
    } catch (error) {
      showError(error, "删除失败，现有数据未被改动");
    } finally {
      setIsWorking(false);
    }
  };

  const renderNotice = () => notice && (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-2xl border p-3 text-xs leading-5 ${
        notice.tone === "error"
          ? "border-rose-300/40 bg-rose-500/10 text-rose-200"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"
      }`}
    >
      {notice.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{notice.text}</span>
    </div>
  );

  if (readingBookId) {
    return <ReadingReader userIdentityId={userIdentityId} bookId={readingBookId} onClose={() => { setReadingBookId(null); refreshLibrary(); }} />;
  }

  if (selectedBook) {
    return (
      <div data-theme-page="reading" className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
        <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-1.5">
          <button type="button" onClick={() => { setSelectedBookId(null); setNotice(null); }} aria-label="返回书架" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="absolute left-1/2 max-w-[65%] -translate-x-1/2 truncate text-base font-bold">书籍详情</h1>
          <button type="button" onClick={beginEditing} aria-label="编辑书籍资料" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
            <Pencil className="h-4 w-4" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
          <div className="mx-auto w-full max-w-md space-y-4">
            <section className="flex gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-2xl bg-[var(--button-primary-bg)] text-3xl font-black text-[var(--button-primary-text)]">
                {selectedBook.title.trim().slice(0, 1) || "书"}
              </div>
              <div className="min-w-0 flex-1 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{selectedBook.format === "markdown" ? "Markdown" : "TXT"}</p>
                <h2 className="mt-2 text-xl font-bold leading-7">{selectedBook.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{selectedBook.author || "作者未填写"}</p>
                <p className="mt-3 text-[11px] text-[var(--text-muted)]">{selectedBook.wordCount.toLocaleString()} 字 · {selectedBook.chapterCount} 章</p>
              </div>
            </section>

            {renderNotice()}

            {selectedBook.status !== "archived" && selectedChapters.length > 0 && (
              <button type="button" onClick={() => setReadingBookId(selectedBook.id)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--button-primary-bg)] text-sm font-bold text-[var(--button-primary-text)] shadow-sm">
                <BookOpenText className="h-4 w-4" />{selectedProgress ? `继续阅读 · ${selectedProgress.percent.toFixed(1)}%` : "开始阅读"}
              </button>
            )}

            {isEditing && (
              <section className="space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <label className="block text-xs font-semibold">书名<input value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none" /></label>
                <label className="block text-xs font-semibold">作者<input value={authorDraft} onChange={(event) => setAuthorDraft(event.target.value)} placeholder="选填" className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none" /></label>
                <label className="block text-xs font-semibold">简介<textarea value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder="选填" rows={3} className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm outline-none" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setIsEditing(false)} className="h-10 rounded-xl border border-[var(--border)] text-xs font-bold">取消</button>
                  <button type="button" onClick={saveDetails} className="h-10 rounded-xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)]">保存</button>
                </div>
              </section>
            )}

            {!isEditing && selectedBook.description && <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--text-secondary)]">{selectedBook.description}</p>}

            <section aria-label="书籍目录" className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2"><BookMarked className="h-4 w-4" /><h2 className="text-sm font-bold">目录</h2></div>
                <span className="text-[11px] text-[var(--text-muted)]">{selectedChapters.length} 章</span>
              </div>
              {isWorking ? (
                <div className="flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-muted)]"><LoaderCircle className="h-4 w-4 animate-spin" />正在解析章节</div>
              ) : selectedChapters.length > 0 ? selectedChapters.map((chapter) => (
                <div key={`${chapter.userIdentityId}:${chapter.id}`} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                  <span className="w-7 text-[11px] tabular-nums text-[var(--text-muted)]">{String(chapter.order + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{chapter.title}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{chapter.wordCount.toLocaleString()} 字</span>
                </div>
              )) : <p className="p-6 text-center text-xs text-[var(--text-muted)]">暂未识别到目录</p>}
            </section>

            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--text-secondary)]">
              <p className="font-bold text-[var(--text-primary)]">本地文件</p>
              <p className="mt-2 break-all leading-5">{selectedBook.sourceFileName}</p>
              <p className="mt-1">{selectedBook.sourceEncoding.toUpperCase()} · {(selectedBook.byteLength / 1024).toFixed(1)} KB · 导入于 {formatDate(selectedBook.createdAt)}</p>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={handleArchive} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold">
                {selectedBook.status === "archived" ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {selectedBook.status === "archived" ? "移回书架" : "归档"}
              </button>
              <button type="button" disabled={isWorking} onClick={handleDelete} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-300/40 bg-rose-500/10 text-xs font-bold text-rose-400 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />永久删除
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div data-theme-page="reading" className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-1.5">
        <button type="button" onClick={onClose} aria-label="返回桌面" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-bold tracking-tight">阅读</h1>
        <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="导入小说" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]">
          <Upload className="h-4 w-4" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
        <section className="mx-auto flex w-full max-w-md flex-col gap-4">
          <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={handleFileSelected} className="hidden" aria-label="选择 TXT 或 Markdown 小说" />
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-raised)]"><BookOpenText className="h-5 w-5" strokeWidth={1.7} /></div>
              <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">本地书架</p><h2 className="mt-1 text-lg font-bold">把故事放进书架</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">支持 TXT 与 Markdown。导入、分章和管理都只在当前设备完成。</p></div>
            </div>
            <button type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:cursor-wait disabled:opacity-60">
              {isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{isImporting ? "正在解析并保存" : "导入本地小说"}
            </button>
          </div>

          {renderNotice()}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><HardDrive className="h-4 w-4 text-[var(--text-secondary)]" /><p className="mt-3 text-xl font-bold">{books.filter((book) => book.status !== "archived").length}</p><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">当前身份的本地书籍</p></div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><ShieldCheck className="h-4 w-4 text-[var(--text-secondary)]" /><p className="mt-3 text-sm font-bold">仅保存在本地</p><p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">不会自动发送小说正文到 API</p></div>
          </div>

          <div className="grid grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
            <button type="button" onClick={() => setSection("library")} className={`flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-bold ${section === "library" ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "text-[var(--text-secondary)]"}`}><Library className="h-4 w-4" />书架</button>
            <button type="button" onClick={() => setSection("archived")} className={`flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-bold ${section === "archived" ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "text-[var(--text-secondary)]"}`}><Archive className="h-4 w-4" />归档</button>
          </div>

          <section aria-label={section === "library" ? "本地书籍" : "归档书籍"} className="space-y-2">
            {visibleBooks.length > 0 ? visibleBooks.map((book) => (
              <button key={`${book.userIdentityId}:${book.id}`} type="button" onClick={() => openBookDetails(book)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left">
                <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-raised)] text-base font-black">{book.title.trim().slice(0, 1) || <FileText className="h-4 w-4" />}</div>
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{book.title}</h3><p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{book.author || book.sourceFileName}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{progress.find((item) => item.bookId === book.id) ? `已读 ${progress.find((item) => item.bookId === book.id)?.percent.toFixed(1)}% · ` : ""}{book.wordCount.toLocaleString()} 字 · {book.chapterCount} 章</p></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              </button>
            )) : (
              <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center"><BookMarked className="mx-auto h-6 w-6 text-[var(--text-muted)]" /><p className="mt-3 text-sm font-bold">{section === "library" ? "书架还是空的" : "没有归档书籍"}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{section === "library" ? "导入一本 TXT 或 Markdown 小说开始使用" : "归档只收起书籍，不会删除正文和标注"}</p></div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
