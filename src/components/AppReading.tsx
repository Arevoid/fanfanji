import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpenText, ChevronLeft, FileText, HardDrive, LoaderCircle, ShieldCheck, Upload } from "lucide-react";
import { loadReadingStore } from "../core/storage/repositories/readingRepository";
import type { ReadingBook } from "../domain/reading/types";
import { importReadingFile, ReadingImportError } from "../features/reading/import/readingImport";

interface AppReadingProps {
  userIdentityId: string;
  onClose: () => void;
}

export default function AppReading({ userIdentityId, onClose }: AppReadingProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const refreshBooks = useCallback(() => {
    setBooks(loadReadingStore().value.books
      .filter((book) => book.userIdentityId === userIdentityId && book.status !== "archived")
      .sort((left, right) => right.updatedAt - left.updatedAt));
  }, [userIdentityId]);

  useEffect(() => refreshBooks(), [refreshBooks]);

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
        refreshBooks();
        setNotice({ tone: "success", text: `《${result.book.title}》已安全保存到本地。` });
      }
    } catch (error) {
      const message = error instanceof ReadingImportError ? error.message : "导入失败，请稍后重试";
      setNotice({ tone: "error", text: message });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      data-theme-page="reading"
      className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]"
    >
      <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-1.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回桌面"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-bold tracking-tight">阅读</h1>
        <div className="h-8 w-8" aria-hidden="true" />
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
        <section className="mx-auto flex w-full max-w-md flex-col gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            onChange={handleFileSelected}
            className="hidden"
            aria-label="选择 TXT 或 Markdown 小说"
          />
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-raised)]">
                <BookOpenText className="h-5 w-5" strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">本地书架</p>
                <h2 className="mt-1 text-lg font-bold">把故事放进书架</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  支持 TXT 与 Markdown。正文只保存在当前设备，不会在导入时发送到任何 API。
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:cursor-wait disabled:opacity-60"
            >
              {isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isImporting ? "正在识别并保存" : "导入本地小说"}
            </button>
          </div>

          {notice && (
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <HardDrive className="h-4 w-4 text-[var(--text-secondary)]" />
              <p className="mt-3 text-xl font-bold">{books.length}</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">当前身份的本地书籍</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <ShieldCheck className="h-4 w-4 text-[var(--text-secondary)]" />
              <p className="mt-3 text-sm font-bold">仅保存在本地</p>
              <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">不会自动发送小说正文到 API</p>
            </div>
          </div>

          {books.length > 0 && (
            <section aria-label="本地书籍" className="space-y-2">
              <h2 className="px-1 text-xs font-bold text-[var(--text-secondary)]">本地书籍</h2>
              {books.map((book) => (
                <article key={`${book.userIdentityId}:${book.id}`} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-raised)]">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold">{book.title}</h3>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {book.wordCount.toLocaleString()} 字 · {book.format === "markdown" ? "Markdown" : "TXT"} · {book.sourceEncoding.toUpperCase()}
                    </p>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
