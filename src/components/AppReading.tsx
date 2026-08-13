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
  Download,
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
import type { Character } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import type { ReadingRoom } from "../domain/reading/coReadingTypes";
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
import { buildReadingArchive, restoreReadingArchive, serializeReadingArchive } from "../features/reading/archive/readingArchive";
import { createAiReadingRoom, ReadingCoReadingError } from "../features/reading/coReading/readingCoReading";
import { getAiReadingState, listReadingRooms } from "../core/storage/repositories/readingCoReadingRepository";
import { advanceAiReadingToParagraph, AiReadingBoundaryError } from "../features/reading/coReading/aiReadingBoundary";
import { createUserReadingComment, listReadingComments, startReadingDiscussion, ReadingCoReadingContentError } from "../features/reading/coReading/readingCoReadingContent";

interface AppReadingProps {
  userIdentityId: string;
  characters?: Character[];
  relationships?: CharacterRelationship[];
  onClose: () => void;
}

type Notice = { tone: "success" | "error" | "info"; text: string };

const formatDate = (timestamp: number): string => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
}).format(new Date(timestamp));

export default function AppReading({ userIdentityId, characters = [], relationships = [], onClose }: AppReadingProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [chapters, setChapters] = useState<ReadingChapter[]>([]);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [rooms, setRooms] = useState<ReadingRoom[]>([]);
  const [readingView, setReadingView] = useState<"library" | "rooms">("library");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [inviteBookId, setInviteBookId] = useState<string | null>(null);
  const [roomCommentDraft, setRoomCommentDraft] = useState("");
  const [roomDiscussionDraft, setRoomDiscussionDraft] = useState("");
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
    setRooms(listReadingRooms(userIdentityId));
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
  const selectedRoom = rooms.find((room) => room.readingRoomId === selectedRoomId) || null;
  const inviteBook = books.find((book) => book.id === inviteBookId) || null;
  const availableFriends = relationships
    .filter((relationship) => relationship.userIdentityId === userIdentityId)
    .map((relationship) => ({ relationship, character: characters.find((character) => character.id === relationship.characterId) }))
    .filter((entry): entry is { relationship: CharacterRelationship; character: Character } => Boolean(entry.character));

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

  const handleExportArchive = async () => {
    setIsWorking(true);
    try {
      const archive = await buildReadingArchive(userIdentityId);
      const url = URL.createObjectURL(serializeReadingArchive(archive));
      const link = document.createElement("a");
      link.href = url;
      link.download = `fanfanji-reading-${new Date().toISOString().slice(0, 10)}.fanfan-reading.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({ tone: "success", text: `已导出 ${archive.store.books.length} 本书及其本地正文。` });
    } catch (error) {
      showError(error, "阅读归档导出失败");
    } finally { setIsWorking(false); }
  };

  const handleImportArchive = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsWorking(true);
    try {
      const restored = await restoreReadingArchive(JSON.parse(await file.text()), userIdentityId);
      refreshLibrary();
      setSection("library");
      setNotice({ tone: "success", text: `已恢复 ${restored.restoredBooks} 本书，正文、进度和标注均已写回本地。` });
    } catch (error) {
      showError(error, "阅读归档恢复失败");
    } finally { setIsWorking(false); }
  };

  const handleInviteFriend = (relationship: CharacterRelationship, character: Character) => {
    if (!inviteBook) return;
    try {
      createAiReadingRoom({ userIdentityId, book: inviteBook, relationship, character });
      refreshLibrary();
      setInviteBookId(null);
      setReadingView("rooms");
      setNotice({ tone: "success", text: `已向 ${character.name} 发出共读邀请。等待 TA 根据人设回应。` });
    } catch (error) {
      const text = error instanceof ReadingCoReadingError ? error.message : "共读邀请保存失败";
      setNotice({ tone: "error", text });
    }
  };

  const submitRoomComment = (room: ReadingRoom) => {
    try {
      createUserReadingComment({ scope: room, authorName: "我", kind: "book", body: roomCommentDraft });
      setRoomCommentDraft("");
      refreshLibrary();
      setNotice({ tone: "success", text: "评论已保存到当前共读房间。" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ReadingCoReadingContentError ? error.message : "评论保存失败" });
    }
  };

  const summonRoomFriend = (room: ReadingRoom) => {
    try {
      startReadingDiscussion({ scope: room, authorName: "我", userPrompt: roomDiscussionDraft });
      setRoomDiscussionDraft("");
      refreshLibrary();
      setNotice({ tone: "success", text: "召唤已记录，等待 AI 好友按人设回应。" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ReadingCoReadingContentError ? error.message : "召唤保存失败" });
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

  if (selectedRoom) {
    const roomBook = books.find((book) => book.id === selectedRoom.bookId);
    const aiReadingState = getAiReadingState(selectedRoom);
    const personalPosition = progress.find((item) => item.bookId === selectedRoom.bookId);
    const roomComments = listReadingComments(selectedRoom);
    const advanceAiToPersonalPosition = () => {
      if (!personalPosition) return;
      try {
        advanceAiReadingToParagraph({ scope: selectedRoom, paragraphAnchorId: personalPosition.paragraphAnchorId });
        refreshLibrary();
        setNotice({ tone: "success", text: "已明确告诉 TA 读到你的当前位置；这不会把私人笔记或其他房间内容分享出去。" });
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof AiReadingBoundaryError ? error.message : "AI 阅读进度更新失败" });
      }
    };
    return (
      <div data-theme-page="reading-co-reading-room" className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
        <header className="relative z-10 flex shrink-0 items-center justify-between px-4 py-1.5">
          <button type="button" onClick={() => setSelectedRoomId(null)} aria-label="返回共读列表" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"><ChevronLeft className="h-4 w-4" /></button>
          <h1 className="absolute left-1/2 max-w-[65%] -translate-x-1/2 truncate text-base font-bold">共读房间</h1>
          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)]">AI 好友</span>
        </header>
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
          <div className="mx-auto w-full max-w-md space-y-4">
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-raised)] text-xl font-black">
                  {selectedRoom.characterSnapshot.avatar ? <img src={selectedRoom.characterSnapshot.avatar} alt="" className="h-full w-full object-cover" /> : selectedRoom.characterSnapshot.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1"><p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">与 TA 共读</p><h2 className="mt-1 truncate text-xl font-bold">{selectedRoom.characterSnapshot.name}</h2><p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{roomBook?.title || "书籍已不在当前书架"}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${selectedRoom.status === "active" ? "bg-emerald-500/15 text-emerald-300" : selectedRoom.status === "declined" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-200"}`}>{selectedRoom.status === "active" ? "共读中" : selectedRoom.status === "declined" ? "已拒绝" : selectedRoom.status === "invited" ? "等待回应" : selectedRoom.status === "paused" ? "已暂停" : "已结束"}</span>
              </div>
            </section>
            {renderNotice()}
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="text-sm font-bold">共读边界</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">这是一个只属于当前身份与 {selectedRoom.characterSnapshot.name} 的独立房间。同一本书与其他好友的进度、评论、召唤和讨论不会合并。</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[var(--text-muted)]"><span className="rounded-xl bg-[var(--surface-raised)] p-2">房间：{selectedRoom.readingRoomId.slice(-8)}</span><span className="rounded-xl bg-[var(--surface-raised)] p-2">剧透：严格保护</span></div>
            </section>
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold">AI 阅读状态</h2><span className="text-[10px] text-[var(--text-muted)]">独立保存</span></div>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">AI 只能评论已经读到的段落；整本书的后续内容不会因为分析存在就自动泄露。</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><span className="rounded-xl bg-[var(--surface-raised)] p-2">已知章节：{aiReadingState?.aiKnownChapterIds.length || 0}</span><span className="rounded-xl bg-[var(--surface-raised)] p-2">已知段落：{aiReadingState ? Object.values(aiReadingState.aiKnownParagraphRange).reduce((sum, range) => sum + Math.max(0, range.end - range.start + 1), 0) : 0}</span></div>
              <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-[10px]">{aiReadingState?.aiReadingPace === "persona_driven" ? "人设驱动速度" : aiReadingState?.aiReadingPace || "未设置速度"}</span><span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-[10px]">剧透：严格保护</span></div>
              {personalPosition && selectedRoom.status === "active" && <button type="button" onClick={advanceAiToPersonalPosition} className="mt-3 h-10 w-full rounded-2xl border border-[var(--border)] text-xs font-bold">让 TA 读到我的当前位置</button>}
            </section>
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold">共读评价</h2><span className="text-[10px] text-[var(--text-muted)]">仅当前房间可见</span></div>
              {roomComments.length > 0 ? <div className="mt-3 space-y-2">{roomComments.slice(-4).map((comment) => <div key={comment.id} className="rounded-2xl bg-[var(--surface-raised)] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold">{comment.authorName}{comment.author === "ai" ? " · AI" : ""}</span><span className="text-[10px] text-[var(--text-muted)]">{comment.kind === "book" ? "全书评价" : comment.kind === "chapter" ? "章评" : "段评"}</span></div><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{comment.body}</p></div>)}</div> : <p className="mt-2 text-xs text-[var(--text-muted)]">还没有评价。你的私人笔记不会自动出现在这里。</p>}
              <textarea value={roomCommentDraft} onChange={(event) => setRoomCommentDraft(event.target.value)} placeholder="写下你对这本书的感受……" rows={2} className="mt-3 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs outline-none" />
              <button type="button" disabled={!roomCommentDraft.trim()} onClick={() => submitRoomComment(selectedRoom)} className="mt-2 h-10 w-full rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:opacity-40">保存全书评价</button>
            </section>
            <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold">召唤 TA 讨论</h2><span className="text-[10px] text-[var(--text-muted)]">应用内讨论室</span></div>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">召唤只带当前房间允许的内容；不会跳转聊天，也不会读取其他关系的记忆。</p>
              <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">AI 回复会优先服从 TA 的角色卡与关系人设；未确认的记忆只会作为候选，不会自动写入主记忆。</p>
              <textarea value={roomDiscussionDraft} onChange={(event) => setRoomDiscussionDraft(event.target.value)} placeholder="你想和 TA 讨论什么？" rows={2} className="mt-3 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs outline-none" />
              <button type="button" disabled={!roomDiscussionDraft.trim() || selectedRoom.status !== "active"} onClick={() => summonRoomFriend(selectedRoom)} className="mt-2 h-10 w-full rounded-2xl border border-[var(--border)] text-xs font-bold disabled:opacity-40">召唤 TA</button>
            </section>
            {roomBook && roomBook.status !== "archived" && <button type="button" onClick={() => setReadingBookId(roomBook.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)]"><BookOpenText className="h-4 w-4" />继续阅读这本书</button>}
          </div>
        </main>
      </div>
    );
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

            {selectedBook.status !== "archived" && availableFriends.length > 0 && (
              <button type="button" onClick={() => setInviteBookId(selectedBook.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold"><span aria-hidden="true">👥</span>邀请一位 AI 好友共读</button>
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
          <div className="grid grid-cols-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
            <button type="button" onClick={() => setReadingView("library")} className={`h-9 rounded-xl text-xs font-bold ${readingView === "library" ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "text-[var(--text-secondary)]"}`}>书架</button>
            <button type="button" onClick={() => setReadingView("rooms")} className={`h-9 rounded-xl text-xs font-bold ${readingView === "rooms" ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "text-[var(--text-secondary)]"}`}>共读 {rooms.length ? `· ${rooms.length}` : ""}</button>
          </div>
          {readingView === "rooms" && (
            <section aria-label="共读房间" className="space-y-2">
              {rooms.length > 0 ? rooms.map((room) => {
                const roomBook = books.find((book) => book.id === room.bookId);
                return <button key={room.readingRoomId} type="button" onClick={() => setSelectedRoomId(room.readingRoomId)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-raised)] text-base font-black">{room.characterSnapshot.avatar ? <img src={room.characterSnapshot.avatar} alt="" className="h-full w-full object-cover" /> : room.characterSnapshot.name.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{room.characterSnapshot.name}</h3><p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{roomBook?.title || "书籍已移除"}</p><p className="mt-1 text-[10px] text-[var(--text-muted)]">{room.status === "active" ? "共读中" : room.status === "declined" ? "已拒绝" : "等待 TA 回应"} · 独立房间</p></div><ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                </button>;
              }) : <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center"><p className="text-sm font-bold">还没有共读房间</p><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">打开一本书，在详情页邀请一位 AI 好友。每位好友都会建立独立房间。</p></div>}
            </section>
          )}
          <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={handleFileSelected} className="hidden" aria-label="选择 TXT 或 Markdown 小说" />
          <input ref={archiveInputRef} type="file" accept=".json,.fanfan-reading.json,application/json,application/vnd.fanfanji.reading+json" onChange={handleImportArchive} className="hidden" aria-label="选择阅读归档" />
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

          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={isWorking || books.length === 0} onClick={handleExportArchive} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold disabled:opacity-40"><Download className="h-4 w-4" />导出阅读归档</button>
            <button type="button" disabled={isWorking} onClick={() => archiveInputRef.current?.click()} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold disabled:opacity-40"><Upload className="h-4 w-4" />恢复阅读归档</button>
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
      {inviteBook && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="邀请 AI 好友共读">
          <div className="w-full max-w-md space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">建立独立关系空间</p><h2 className="mt-1 text-lg font-bold">邀请谁来共读《{inviteBook.title}》？</h2></div><button type="button" onClick={() => setInviteBookId(null)} aria-label="关闭邀请" className="h-8 w-8 rounded-full border border-[var(--border)] text-lg">×</button></div>
            <p className="text-xs leading-5 text-[var(--text-secondary)]">好友是 AI 角色。邀请会先进入明确的邀请状态，由 TA 根据角色卡与关系作出接受、犹豫或拒绝；不会等待真人上线，也不会与其他好友共享房间。</p>
            <div className="space-y-2">{availableFriends.map(({ relationship, character }) => <button key={relationship.id} type="button" onClick={() => handleInviteFriend(relationship, character)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-left"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface)] font-bold">{character.avatar ? <img src={character.avatar} alt="" className="h-full w-full object-cover" /> : character.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{character.name}</p><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">关系：{relationship.relationship} · 独立共读记忆</p></div><ChevronRight className="h-4 w-4 text-[var(--text-muted)]" /></button>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
