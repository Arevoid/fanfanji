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
  Globe2,
  Library,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  UsersRound,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { loadReadingStore } from "../core/storage/repositories/readingRepository";
import type { ReadingBook, ReadingChapter, ReadingProgress } from "../domain/reading/types";
import type { Character, UserSettings } from "../types";
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
import ReadingStoryView from "./reading/ReadingStoryView";
import ReadingCoStoryView from "./reading/ReadingCoStoryView";
import { buildReadingArchive, restoreReadingArchive, serializeReadingArchive } from "../features/reading/archive/readingArchive";
import { createAiReadingRoom, ReadingCoReadingError } from "../features/reading/coReading/readingCoReading";
import { getAiReadingState, listReadingRooms } from "../core/storage/repositories/readingCoReadingRepository";
import { advanceAiReadingToParagraph, AiReadingBoundaryError } from "../features/reading/coReading/aiReadingBoundary";
import { createUserReadingComment, listReadingComments, startReadingDiscussion, ReadingCoReadingContentError } from "../features/reading/coReading/readingCoReadingContent";
import { getReadingBookBible, listReadingAnalysisTasks } from "../core/storage/repositories/readingAnalysisRepository";
import { createReadingAnalysisTask, startReadingAnalysisTask, saveBookBible, ReadingAnalysisError } from "../features/reading/analysis/readingAnalysis";
import type { ReadingBookBible } from "../domain/reading/analysisTypes";
import { listReadingStories } from "../core/storage/repositories/readingStoryRepository";
import { listReadingCoStories } from "../core/storage/repositories/readingCoStoryRepository";
import type { ReadingStoryState } from "../domain/reading/storyTypes";
import type { ReadingCoStoryState } from "../domain/reading/coStoryTypes";
import {
  buildReadingActivityItems,
  buildReadingWorldItems,
  selectReadingShelfBooks,
  type ReadingRootTab,
  type ReadingShelfFilter,
  type ReadingShelfSort,
} from "../features/reading/navigation/readingNavigation";
import ReadingBookCover from "./reading/ReadingBookCover";

interface AppReadingProps {
  userIdentityId: string;
  settings?: UserSettings;
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

export default function AppReading({ userIdentityId, settings, characters = [], relationships = [], onClose }: AppReadingProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [chapters, setChapters] = useState<ReadingChapter[]>([]);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [rooms, setRooms] = useState<ReadingRoom[]>([]);
  const [stories, setStories] = useState<ReadingStoryState[]>([]);
  const [coStories, setCoStories] = useState<ReadingCoStoryState[]>([]);
  const [rootTab, setRootTab] = useState<ReadingRootTab>("shelf");
  const [shelfFilter, setShelfFilter] = useState<ReadingShelfFilter>("all");
  const [shelfSort, setShelfSort] = useState<ReadingShelfSort>("recent");
  const [shelfQuery, setShelfQuery] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [inviteBookId, setInviteBookId] = useState<string | null>(null);
  const [roomCommentDraft, setRoomCommentDraft] = useState("");
  const [roomDiscussionDraft, setRoomDiscussionDraft] = useState("");
  const [section, setSection] = useState<"library" | "archived">("library");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [readingBookId, setReadingBookId] = useState<string | null>(null);
  const [readingStoryBookId, setReadingStoryBookId] = useState<string | null>(null);
  const [readingCoStoryBookId, setReadingCoStoryBookId] = useState<string | null>(null);
  const [initialStoryId, setInitialStoryId] = useState<string | undefined>();
  const [initialCoStoryId, setInitialCoStoryId] = useState<string | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [authorDraft, setAuthorDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [analysisRefreshToken, setAnalysisRefreshToken] = useState(0);
  const [isEditingBible, setIsEditingBible] = useState(false);
  const [biblePremiseDraft, setBiblePremiseDraft] = useState("");
  const [bibleRulesDraft, setBibleRulesDraft] = useState("");
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
    setStories(listReadingStories(userIdentityId));
    setCoStories(listReadingCoStories(userIdentityId));
  }, [userIdentityId]);

  useEffect(() => {
    refreshLibrary();
    retryReadingAssetCleanup(userIdentityId).catch(() => undefined);
  }, [refreshLibrary, userIdentityId]);

  const visibleBooks = useMemo(() => selectReadingShelfBooks({ books, progress, userIdentityId, filter: shelfFilter, query: shelfQuery, sort: shelfSort }), [books, progress, shelfFilter, shelfQuery, shelfSort, userIdentityId]);
  const activityItems = useMemo(() => buildReadingActivityItems({ userIdentityId, rooms, coStories, books }), [books, coStories, rooms, userIdentityId]);
  const worldItems = useMemo(() => buildReadingWorldItems({ userIdentityId, stories, coStories }), [coStories, stories, userIdentityId]);
  const selectedBook = books.find((book) => book.id === selectedBookId) || null;
  const selectedChapters = selectedBook
    ? chapters.filter((chapter) => chapter.bookId === selectedBook.id)
    : [];
  const selectedProgress = selectedBook ? progress.find((item) => item.bookId === selectedBook.id) : null;
  const selectedAnalysisTasks = useMemo(() => selectedBook ? listReadingAnalysisTasks({ userIdentityId, bookId: selectedBook.id }) : [], [analysisRefreshToken, selectedBook, userIdentityId]);
  const selectedBookBible = useMemo(() => selectedBook ? getReadingBookBible({ userIdentityId, bookId: selectedBook.id }) : undefined, [analysisRefreshToken, selectedBook, userIdentityId]);
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

  const handleStartBookAnalysis = () => {
    if (!selectedBook || selectedChapters.length === 0) return;
    try {
      const scope = { userIdentityId, bookId: selectedBook.id };
      const task = createReadingAnalysisTask({ scope, type: "chapter_summary", inputVersion: selectedBook.contentHash, chapterIds: selectedChapters.map((chapter) => chapter.id) });
      startReadingAnalysisTask(scope, task.id);
      setAnalysisRefreshToken((value) => value + 1);
      setNotice({ tone: "success", text: "已创建章节分析任务。后续会按检查点处理，不会把整本小说一次发送给 API。" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ReadingAnalysisError ? error.message : "分析任务创建失败" });
    }
  };

  const handleRetryAnalysis = (taskId: string) => {
    try {
      if (!selectedBook) return;
      startReadingAnalysisTask({ userIdentityId, bookId: selectedBook.id }, taskId);
      setAnalysisRefreshToken((value) => value + 1);
      setNotice({ tone: "success", text: "已从最近检查点重新开始分析任务。" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ReadingAnalysisError ? error.message : "分析任务重试失败" });
    }
  };

  const beginEditingBible = () => {
    if (!selectedBook) return;
    setBiblePremiseDraft(selectedBookBible?.premise || "");
    setBibleRulesDraft((selectedBookBible?.worldRules || []).join("\n"));
    setIsEditingBible(true);
  };

  const saveBibleDetails = () => {
    if (!selectedBook || !biblePremiseDraft.trim()) return;
    const now = Date.now();
    const bible: ReadingBookBible = {
      userIdentityId,
      bookId: selectedBook.id,
      id: selectedBookBible?.id || `reading-bible-${userIdentityId}-${selectedBook.id}`,
      version: (selectedBookBible?.version || 0) + 1,
      analysisVersion: selectedBookBible?.analysisVersion || "manual-v1",
      premise: biblePremiseDraft.trim(),
      worldRules: bibleRulesDraft.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 100),
      storyLines: selectedBookBible?.storyLines || [],
      coreCharacterIds: selectedBookBible?.coreCharacterIds || [],
      keyLocationIds: selectedBookBible?.keyLocationIds || [],
      keyFactionIds: selectedBookBible?.keyFactionIds || [],
      timeline: selectedBookBible?.timeline || [],
      isUserEdited: true,
      createdAt: selectedBookBible?.createdAt || now,
      updatedAt: now,
    };
    try {
      saveBookBible(bible);
      setIsEditingBible(false);
      setAnalysisRefreshToken((value) => value + 1);
      setNotice({ tone: "success", text: "Book Bible 已保存，仅属于当前身份和这本书。" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof ReadingAnalysisError ? error.message : "Book Bible 保存失败" });
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
      setRootTab("co_reading");
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

  if (readingStoryBookId) {
    const storyBook = books.find((book) => book.id === readingStoryBookId);
    return <ReadingStoryView userIdentityId={userIdentityId} book={storyBook} initialStoryId={initialStoryId} settings={settings} onClose={() => { setReadingStoryBookId(null); setInitialStoryId(undefined); refreshLibrary(); }} />;
  }

  if (readingCoStoryBookId) {
    const storyBook = books.find((book) => book.id === readingCoStoryBookId);
    return <ReadingCoStoryView userIdentityId={userIdentityId} book={storyBook} initialCoStoryId={initialCoStoryId} friends={availableFriends} settings={settings} onClose={() => { setReadingCoStoryBookId(null); setInitialCoStoryId(undefined); refreshLibrary(); }} />;
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

            {selectedBook.status !== "archived" && selectedChapters.length > 0 && (
              <button type="button" onClick={() => setReadingStoryBookId(selectedBook.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-500/10 text-xs font-bold text-amber-200">
                <span aria-hidden="true">✦</span>穿书：进入这本小说的故事宇宙
              </button>
            )}

            {selectedBook.status !== "archived" && availableFriends.length > 0 && (
              <button type="button" onClick={() => setInviteBookId(selectedBook.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-xs font-bold"><span aria-hidden="true">👥</span>邀请一位 AI 好友共读</button>
            )}

            {selectedBook.status !== "archived" && availableFriends.length > 0 && <button type="button" onClick={() => setReadingCoStoryBookId(selectedBook.id)} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/40 bg-cyan-500/10 text-xs font-bold"><span aria-hidden="true">✦</span>和 AI 好友共同穿书</button>}

            <section aria-label="novel-analysis" className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold">小说分析</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">按章节处理 · 可恢复 · 不发送整本正文</p></div><span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-[10px] text-[var(--text-muted)]">本地任务</span></div>
              {selectedAnalysisTasks.length > 0 ? selectedAnalysisTasks.slice(0, 2).map((task) => { const percent = task.chapterIds.length ? Math.round((task.completedChapterIds.length / task.chapterIds.length) * 100) : 0; return <div key={task.id} className="mt-3 rounded-2xl bg-[var(--surface-raised)] p-3"><div className="flex items-center justify-between gap-2 text-[11px]"><span>{task.status === "completed" ? "分析完成" : task.status === "failed" ? "分析失败" : task.status === "running" ? "分析中" : "等待分析"}</span><span className="text-[var(--text-muted)]">{percent}% · {task.completedChapterIds.length}/{task.chapterIds.length} 章</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-[var(--button-primary-bg)] transition-all" style={{ width: `${percent}%` }} /></div>{task.status === "failed" && <><p className="mt-2 text-[10px] leading-4 text-rose-300">{task.lastError || "任务中断，可从检查点重试"}</p><button type="button" onClick={() => handleRetryAnalysis(task.id)} className="mt-2 h-9 w-full rounded-xl border border-[var(--border)] text-xs font-bold">从检查点重试</button></>}</div>; }) : <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">尚未分析人物、地点、势力和事件。开始后会逐章生成摘要，并保留失败检查点。</p>}
              {selectedAnalysisTasks.every((task) => task.status !== "running" && task.status !== "queued") && selectedChapters.length > 0 && <button type="button" onClick={handleStartBookAnalysis} className="mt-3 h-10 w-full rounded-2xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)]">{selectedAnalysisTasks.some((task) => task.status === "completed") ? "重新分析当前版本" : "开始小说分析"}</button>}
            </section>

            <section aria-label="Book Bible" className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold">Book Bible</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">世界规则与故事骨架 · 仅当前身份可见</p></div><button type="button" onClick={beginEditingBible} className="rounded-xl border border-[var(--border)] px-3 py-2 text-[10px] font-bold">编辑</button></div>
              {isEditingBible ? <div className="mt-3 space-y-3"><label className="block text-xs font-semibold">故事 premise<textarea value={biblePremiseDraft} onChange={(event) => setBiblePremiseDraft(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm outline-none" placeholder="故事的核心前提" /></label><label className="block text-xs font-semibold">世界规则（每行一条）<textarea value={bibleRulesDraft} onChange={(event) => setBibleRulesDraft(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-sm outline-none" /></label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setIsEditingBible(false)} className="h-10 rounded-xl border border-[var(--border)] text-xs font-bold">取消</button><button type="button" disabled={!biblePremiseDraft.trim()} onClick={saveBibleDetails} className="h-10 rounded-xl bg-[var(--button-primary-bg)] text-xs font-bold text-[var(--button-primary-text)] disabled:opacity-40">保存 Book Bible</button></div></div> : selectedBookBible ? <div className="mt-3 space-y-3"><p className="rounded-2xl bg-[var(--surface-raised)] p-3 text-xs leading-5 text-[var(--text-secondary)]">{selectedBookBible.premise}</p>{selectedBookBible.worldRules.length > 0 && <div><p className="text-[10px] font-bold text-[var(--text-muted)]">世界规则</p><ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--text-secondary)]">{selectedBookBible.worldRules.slice(0, 5).map((rule) => <li key={rule}>· {rule}</li>)}</ul></div>}<p className="text-[10px] text-[var(--text-muted)]">版本 {selectedBookBible.version}{selectedBookBible.isUserEdited ? " · 已手动编辑" : " · AI 分析"}</p></div> : <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">分析完成后会在这里形成可编辑的故事圣经，也可以先手动创建 premise。</p>}
            </section>

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
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-bold tracking-tight">{rootTab === "shelf" ? "书架" : rootTab === "co_reading" ? "共读" : "世界"}</h1>
        <button type="button" onClick={() => rootTab === "shelf" && fileInputRef.current?.click()} aria-label={rootTab === "shelf" ? "导入小说" : "当前栏目"} className={`flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] ${rootTab === "shelf" ? "" : "invisible"}`}>
          <Upload className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <section className="mx-auto flex w-full max-w-md flex-col gap-4">
          <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={handleFileSelected} className="hidden" aria-label="选择 TXT 或 Markdown 小说" />
          <input ref={archiveInputRef} type="file" accept=".json,.fanfan-reading.json,application/json,application/vnd.fanfanji.reading+json" onChange={handleImportArchive} className="hidden" aria-label="选择阅读归档" />
          {renderNotice()}
          {rootTab === "shelf" && <>
            <div className="flex items-end justify-between"><div><p className="text-2xl font-black tracking-tight">我的书架</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{books.filter((book) => book.status !== "archived").length} 本书 · 正文仅保存在本地</p></div><SlidersHorizontal className="h-5 w-5 text-[var(--text-muted)]" /></div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label="书架筛选">{([['all','全部'],['reading','阅读中'],['unread','未读'],['finished','已读完'],['archived','归档']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setShelfFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${shelfFilter === value ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"}`}>{label}</button>)}</div>
            <div className="flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3"><Search className="h-4 w-4 text-[var(--text-muted)]" /><input value={shelfQuery} onChange={(event) => setShelfQuery(event.target.value)} placeholder={`搜索 ${books.length} 本书`} className="h-11 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label><select aria-label="书架排序" value={shelfSort} onChange={(event) => setShelfSort(event.target.value as ReadingShelfSort)} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-bold outline-none"><option value="recent">最近</option><option value="title">书名</option><option value="progress">进度</option></select></div>
            {visibleBooks.length > 0 ? <section aria-label="封面书架" className="grid grid-cols-3 gap-x-3 gap-y-5">{visibleBooks.map((book) => { const bookProgress = progress.find((item) => item.bookId === book.id)?.percent || 0; return <button key={`${book.userIdentityId}:${book.id}`} type="button" onClick={() => openBookDetails(book)} className="min-w-0 text-left"><ReadingBookCover book={book} className="aspect-[3/4] w-full rounded-xl shadow-md" /><h3 className="mt-2 line-clamp-2 text-xs font-bold leading-4">{book.title}</h3><p className="mt-1 truncate text-[10px] text-[var(--text-muted)]">{book.status === "archived" ? "已归档" : bookProgress > 0 ? `${bookProgress.toFixed(1)}%` : book.author || "未读"}</p></button>; })}</section> : <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center"><BookMarked className="mx-auto h-6 w-6 text-[var(--text-muted)]" /><p className="mt-3 text-sm font-bold">{books.length ? "没有符合条件的书" : "把故事放进书架"}</p><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">支持 TXT 与 Markdown，导入和分章都在当前设备完成。</p><button type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--button-primary-bg)] px-5 text-xs font-bold text-[var(--button-primary-text)]">{isImporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}导入本地小说</button></div>}
            <div className="grid grid-cols-2 gap-2"><button type="button" disabled={isWorking || books.length === 0} onClick={handleExportArchive} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[10px] font-bold disabled:opacity-40"><Download className="h-3.5 w-3.5" />导出阅读归档</button><button type="button" disabled={isWorking} onClick={() => archiveInputRef.current?.click()} className="flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[10px] font-bold disabled:opacity-40"><Upload className="h-3.5 w-3.5" />恢复阅读归档</button></div>
          </>}

          {rootTab === "co_reading" && <section aria-label="共读活动" className="space-y-3"><div><h2 className="text-xl font-black">和 TA 一起</h2><p className="mt-1 text-xs text-[var(--text-muted)]">同一本书与不同好友拥有完全独立的进度、评论和记忆。</p></div>{activityItems.length ? activityItems.map((item) => <button key={item.id} type="button" onClick={() => { if (item.kind === "co_reading") setSelectedRoomId(item.sourceId); else { setInitialCoStoryId(item.sourceId); setReadingCoStoryBookId(item.bookId || "custom-world"); } }} className="relative flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left"><div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-raised)] font-black">{item.friendAvatar ? <img src={item.friendAvatar} alt="" className="h-full w-full object-cover" /> : item.bookTitle.slice(0,1)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${item.kind === "co_story" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{item.kind === "co_story" ? "穿书" : "共读"}</span><span className="text-[10px] text-[var(--text-muted)]">{item.status}</span></div><h3 className="mt-1 truncate text-sm font-bold">{item.bookTitle}</h3><p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">和 {item.friendName} · 独立空间</p></div><ChevronRight className="h-4 w-4 text-[var(--text-muted)]" /></button>) : <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center"><UsersRound className="mx-auto h-6 w-6 text-[var(--text-muted)]" /><p className="mt-3 text-sm font-bold">还没有共读活动</p><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">下一轮可从书籍封面长按邀请一位 AI 好友。</p></div>}</section>}

          {rootTab === "world" && <section aria-label="故事世界" className="space-y-3"><div><h2 className="text-xl font-black">故事世界</h2><p className="mt-1 text-xs text-[var(--text-muted)]">单人和共同穿书都使用独立宇宙记忆，不写入现实关系事实。</p></div>{worldItems.length ? worldItems.map((item) => <button key={item.id} type="button" onClick={() => { if (item.kind === "solo_story") { setInitialStoryId(item.sourceId); setReadingStoryBookId(item.bookId || "custom-world"); } else { setInitialCoStoryId(item.sourceId); setReadingCoStoryBookId(item.bookId || "custom-world"); } }} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-raised)]"><Globe2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-bold">{item.title}</h3>{item.kind === "co_story" && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-300">双人</span>}</div><p className="mt-1 text-[10px] text-[var(--text-muted)]">第 {item.currentChapter}/{item.targetChapters} 章{item.friendName ? ` · ${item.friendName}` : " · 单人"}</p></div><ChevronRight className="h-4 w-4 text-[var(--text-muted)]" /></button>) : <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center"><Globe2 className="mx-auto h-6 w-6 text-[var(--text-muted)]" /><p className="mt-3 text-sm font-bold">还没有故事世界</p><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">书籍穿书与自建世界入口将在后续轮次完善。</p></div>}</section>}
        </section>
      </main>
      <nav aria-label="阅读主导航" className="grid shrink-0 grid-cols-3 border-t border-[var(--border)] bg-[var(--surface)]/95 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">{([['shelf','书架',Library],['co_reading','共读',UsersRound],['world','世界',Globe2]] as const).map(([value,label,Icon]) => <button key={value} type="button" onClick={() => setRootTab(value)} aria-current={rootTab === value ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-bold ${rootTab === value ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}><Icon className="h-5 w-5" strokeWidth={rootTab === value ? 2.2 : 1.6} />{label}</button>)}</nav>
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
