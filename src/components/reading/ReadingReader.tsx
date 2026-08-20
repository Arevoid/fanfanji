import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookOpenText, ChevronLeft, ChevronRight, Copy, Highlighter, List, LoaderCircle, MessageCircle, Pencil, Search, Send, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { fontAssetDb } from "../../utils/fontAssetDb";
import { GLOBAL_FONT_ASSET_ID } from "../../features/theme/globalTypography";
import {
  getScopedReadingProgress,
  loadReadingBookContent,
  ReadingReaderError,
  saveReadingProgress,
  saveReadingRoomPosition,
  type ReadingBookContent,
  type ReadingParagraphView,
} from "../../features/reading/reader/readingReader";
import {
  createReadingAnnotation,
  applyReadingParagraphEdits,
  deleteReadingAnnotation,
  getReadingAnnotations,
  getReadingBookPreferences,
  saveReadingBookPreferences,
  saveReadingParagraphEdit,
  searchReadingContent,
  toggleReadingBookmark,
  type ReadingSearchResult,
} from "../../features/reading/tools/readingTools";
import type { ReadingAnnotation, ReadingBookPreferences } from "../../domain/reading/types";
import type { ReadingComment, ReadingDiscussionMessage, ReadingRoom } from "../../domain/reading/coReadingTypes";
import type { Character, UserSettings } from "../../types";
import type { CharacterRelationship } from "../../domain/relationship/characterRelationship";
import { appendReadingDiscussionMessage, createAiReadingComment, createUserReadingComment, listDiscussionMessages, listReadingComments, listReadingDiscussions, startReadingDiscussion } from "../../features/reading/coReading/readingCoReadingContent";
import { advanceAiReadingToParagraph } from "../../features/reading/coReading/aiReadingBoundary";
import { getAiReadingState } from "../../core/storage/repositories/readingCoReadingRepository";
import { requestReadingCompanionResponse } from "../../features/reading/coReading/readingCompanionService";

interface ReadingReaderProps {
  userIdentityId: string;
  bookId: string;
  room?: ReadingRoom;
  settings?: UserSettings;
  character?: Character;
  relationship?: CharacterRelationship;
  worldBookContext?: string;
  initialAnchorId?: string;
  onClose: () => void;
}

interface VisiblePosition {
  paragraph: ReadingParagraphView;
  chapterId: string;
  characterOffset: number;
  scrollOffsetHint: number;
}

export default function ReadingReader({ userIdentityId, bookId, room, settings, character, relationship, worldBookContext, initialAnchorId, onClose }: ReadingReaderProps) {
  const scrollRef = useRef<HTMLElement>(null);
  const discussionScrollRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef(new Map<string, HTMLParagraphElement>());
  const progressTimerRef = useRef<number | null>(null);
  const horizontalSnapTimerRef = useRef<number | null>(null);
  const selectionSyncTimerRef = useRef<number | null>(null);
  const aiSyncTimerRef = useRef<number | null>(null);
  const aiRequestInFlightRef = useRef(false);
  const lastAiSyncAnchorRef = useRef<string | null>(null);
  const currentPositionRef = useRef<VisiblePosition | null>(null);
  const modeSwitchPositionRef = useRef<VisiblePosition | null>(null);
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
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<{ left: number; top: number } | null>(null);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ReadingBookPreferences>(() => getReadingBookPreferences(userIdentityId, bookId));
  const [customFontFamily, setCustomFontFamily] = useState<string | undefined>();
  const [percent, setPercent] = useState(0);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [roomComments, setRoomComments] = useState(() => room ? listReadingComments(room) : []);
  const [commentThreadAnchorId, setCommentThreadAnchorId] = useState<string | null>(null);
  const [replyToComment, setReplyToComment] = useState<ReadingComment | null>(null);
  const [commentReplyDraft, setCommentReplyDraft] = useState("");
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);
  const [discussionId, setDiscussionId] = useState<string | null>(null);
  const [discussionMessages, setDiscussionMessages] = useState<ReadingDiscussionMessage[]>([]);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [isAiResponding, setIsAiResponding] = useState(false);

  const refreshRoomComments = useCallback(() => setRoomComments(room ? listReadingComments(room) : []), [room]);

  useEffect(() => {
    if (!isDiscussionOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const container = discussionScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [discussionMessages, isAiResponding, isDiscussionOpen]);

  useEffect(() => {
    refreshRoomComments();
    const refresh = () => refreshRoomComments();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshRoomComments]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    loadReadingBookContent(userIdentityId, bookId)
      .then((loaded) => {
        if (!active) return;
        setContent(loaded);
        setAnnotations(getReadingAnnotations(userIdentityId, bookId));
        setPreferences(getReadingBookPreferences(userIdentityId, bookId));
        const progress = getScopedReadingProgress(userIdentityId, bookId, room);
        setPercent(progress?.percent || 0);
        setCurrentChapterId(progress?.chapterId || loaded.chapters[0]?.chapter.id || null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof ReadingReaderError ? reason.message : "正文读取失败");
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [bookId, room, userIdentityId]);

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

  const displayContent = useMemo(() => content ? applyReadingParagraphEdits(content, annotations) : null, [annotations, content]);
  const flatParagraphs = useMemo(() => displayContent?.chapters.flatMap((chapterView) =>
    chapterView.paragraphs.map((paragraph) => ({ paragraph, chapterId: chapterView.chapter.id }))) || [], [displayContent]);

  const maybeSyncAiCompanion = useCallback((position: VisiblePosition) => {
    if (!room || room.status === "ended" || room.status === "declined" || room.status === "paused") return;
    try {
      advanceAiReadingToParagraph({ scope: room, paragraphAnchorId: position.paragraph.anchor.id });
    } catch {
      return;
    }
    if (!settings || !character || !relationship || aiRequestInFlightRef.current || lastAiSyncAnchorRef.current === position.paragraph.anchor.id) return;
    const state = getAiReadingState(room);
    if (!state || state.autonomousCommentFrequency === "off") return;
    const currentIndex = flatParagraphs.findIndex((item) => item.paragraph.anchor.id === position.paragraph.anchor.id);
    const lastIndex = state.lastCommentedAnchor ? flatParagraphs.findIndex((item) => item.paragraph.anchor.id === state.lastCommentedAnchor?.id) : -1;
    const gap = currentIndex - lastIndex;
    const threshold = state.autonomousCommentFrequency === "active" ? 3 : state.autonomousCommentFrequency === "moderate" ? 7 : 15;
    if (currentIndex < 0 || gap < threshold) return;
    lastAiSyncAnchorRef.current = position.paragraph.anchor.id;
    aiRequestInFlightRef.current = true;
    void requestReadingCompanionResponse({ room, character, relationship, settings, paragraph: position.paragraph, kind: "comment", autonomous: true, worldBookContext })
      .then((response) => {
        if (!response) return;
        createAiReadingComment({ scope: room, authorName: room.characterSnapshot.name, targetChapterId: position.chapterId, targetParagraphAnchorId: position.paragraph.anchor.id, textSnapshot: position.paragraph.text, body: response.body, isSpoiler: response.isSpoiler });
        refreshRoomComments();
      })
      .catch(() => undefined)
      .finally(() => { aiRequestInFlightRef.current = false; });
  }, [character, flatParagraphs, refreshRoomComments, relationship, room, settings, worldBookContext]);

  const persistPosition = useCallback((position: VisiblePosition | null) => {
    if (!content || !position) return;
    try {
      const saved = room
        ? saveReadingRoomPosition({
            ...room,
            chapterId: position.chapterId,
            paragraphAnchorId: position.paragraph.anchor.id,
            characterOffset: position.characterOffset,
            scrollOffsetHint: position.scrollOffsetHint,
            sourceCharacterLength: content.sourceCharacterLength,
          })
        : saveReadingProgress({
            userIdentityId,
            bookId,
            chapterId: position.chapterId,
            paragraphAnchorId: position.paragraph.anchor.id,
            characterOffset: position.characterOffset,
            scrollOffsetHint: position.scrollOffsetHint,
            sourceCharacterLength: content.sourceCharacterLength,
          });
      setPercent(saved.percent);
      if (room) {
        if (aiSyncTimerRef.current !== null) window.clearTimeout(aiSyncTimerRef.current);
        aiSyncTimerRef.current = window.setTimeout(() => maybeSyncAiCompanion(position), 450);
      }
    } catch {
      // Reading stays available when local progress persistence is temporarily unavailable.
    }
  }, [bookId, content, maybeSyncAiCompanion, room, userIdentityId]);

  const scrollToAnchor = useCallback((anchorId: string, behavior: ScrollBehavior = "smooth", characterOffset = 0): boolean => {
    const container = scrollRef.current;
    const element = paragraphRefs.current.get(anchorId);
    if (!container || !element) return false;
    const ratio = element.textContent?.length ? characterOffset / element.textContent.length : 0;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (preferences.pageMode === "horizontal") {
      const left = elementRect.left - containerRect.left + container.scrollLeft;
      const pageWidth = Math.max(container.clientWidth, 1);
      container.scrollTo({ left: Math.floor(Math.max(0, left) / pageWidth) * pageWidth, behavior });
      return true;
    }
    const elementTop = elementRect.top - containerRect.top + container.scrollTop;
    const top = elementTop - 48 + elementRect.height * Math.min(Math.max(ratio, 0), 1);
    container.scrollTo({ top, behavior });
    return true;
  }, [preferences.pageMode]);

  useEffect(() => {
    if (!content || restoredRef.current) return;
    const progress = getScopedReadingProgress(userIdentityId, bookId, room);
    const target = initialAnchorId || progress?.paragraphAnchorId || content.chapters[0]?.paragraphs[0]?.anchor.id;
    if (!target) return;
    let attempts = 0;
    let cancelled = false;
    const restore = () => {
      if (cancelled || restoredRef.current) return;
      attempts += 1;
      if (scrollToAnchor(target, "auto", initialAnchorId ? 0 : progress?.characterOffset || 0)) {
        restoredRef.current = true;
        if (initialAnchorId && room && roomComments.some((comment) => comment.targetParagraphAnchorId === initialAnchorId)) setCommentThreadAnchorId(initialAnchorId);
        return;
      }
      if (attempts < 5) window.requestAnimationFrame(restore);
    };
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore);
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [bookId, content, initialAnchorId, room, roomComments, scrollToAnchor, userIdentityId]);

  useEffect(() => {
    const position = modeSwitchPositionRef.current;
    if (!position) return;
    modeSwitchPositionRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToAnchor(position.paragraph.anchor.id, "auto", position.characterOffset));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [preferences.pageMode, scrollToAnchor]);

  const captureVisiblePosition = useCallback(() => {
    const container = scrollRef.current;
    if (!container || flatParagraphs.length === 0) return null;
    const containerRect = container.getBoundingClientRect();
    const horizontal = preferences.pageMode === "horizontal";
    const threshold = horizontal ? containerRect.left + 24 : containerRect.top + 48;
    let chosen = flatParagraphs[0];
    let chosenElement = paragraphRefs.current.get(chosen.paragraph.anchor.id) || null;
    for (const candidate of flatParagraphs) {
      const element = paragraphRefs.current.get(candidate.paragraph.anchor.id);
      if (!element) continue;
      const candidateRect = element.getBoundingClientRect();
      if ((horizontal ? candidateRect.left : candidateRect.top) <= threshold + 2) {
        chosen = candidate;
        chosenElement = element;
      } else {
        break;
      }
    }
    if (!chosenElement) return null;
    const rect = chosenElement.getBoundingClientRect();
    const atEnd = horizontal
      ? container.scrollLeft + container.clientWidth >= container.scrollWidth - 4
      : container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
    const ratio = atEnd && chosen === flatParagraphs.at(-1)
      ? 1
      : Math.min(Math.max((threshold - (horizontal ? rect.left : rect.top)) / Math.max(horizontal ? rect.width : rect.height, 1), 0), 1);
    return {
      paragraph: chosen.paragraph,
      chapterId: chosen.chapterId,
      characterOffset: Math.round(chosen.paragraph.text.length * ratio),
      scrollOffsetHint: Math.round((horizontal ? rect.left - containerRect.left : rect.top - containerRect.top)),
    } satisfies VisiblePosition;
  }, [flatParagraphs, preferences.pageMode]);

  const snapToHorizontalPage = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollRef.current;
    if (!container || preferences.pageMode !== "horizontal") return;
    const pageWidth = Math.max(container.clientWidth, 1);
    const maximum = Math.max(0, container.scrollWidth - container.clientWidth);
    const target = Math.min(maximum, Math.max(0, Math.round(container.scrollLeft / pageWidth) * pageWidth));
    if (Math.abs(container.scrollLeft - target) > 1) container.scrollTo({ left: target, behavior });
  }, [preferences.pageMode]);

  const handleScroll = () => {
    const position = captureVisiblePosition();
    if (!position) return;
    currentPositionRef.current = position;
    setCurrentChapterId(position.chapterId);
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    progressTimerRef.current = window.setTimeout(() => persistPosition(currentPositionRef.current), 220);
    if (preferences.pageMode === "horizontal") {
      if (horizontalSnapTimerRef.current !== null) window.clearTimeout(horizontalSnapTimerRef.current);
      horizontalSnapTimerRef.current = window.setTimeout(() => snapToHorizontalPage(), 140);
    }
  };

  useEffect(() => () => {
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    if (horizontalSnapTimerRef.current !== null) window.clearTimeout(horizontalSnapTimerRef.current);
    if (aiSyncTimerRef.current !== null) window.clearTimeout(aiSyncTimerRef.current);
    persistPosition(currentPositionRef.current);
  }, [persistPosition]);

  const closeReader = () => {
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
    persistPosition(currentPositionRef.current || (() => {
      const progress = getScopedReadingProgress(userIdentityId, bookId, room);
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
  const searchResults = useMemo(() => displayContent ? searchReadingContent(displayContent, searchQuery) : [], [displayContent, searchQuery]);
  const refreshAnnotations = () => setAnnotations(getReadingAnnotations(userIdentityId, bookId));
  const updatePreferences = (patch: Partial<ReadingBookPreferences>) => {
    try {
      if (patch.pageMode && patch.pageMode !== preferences.pageMode) {
        modeSwitchPositionRef.current = captureVisiblePosition() || currentPositionRef.current;
        persistPosition(modeSwitchPositionRef.current);
      }
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

  const editActiveText = () => {
    if (!activeParagraph) return;
    const selectedText = activeParagraph.paragraph.text.slice(activeParagraph.start, activeParagraph.end);
    const replacement = window.prompt("编辑选中的正文（清空内容即可删除这段文字）：", selectedText);
    if (replacement === null || replacement === selectedText) return;
    try {
      const revisedText = `${activeParagraph.paragraph.text.slice(0, activeParagraph.start)}${replacement}${activeParagraph.paragraph.text.slice(activeParagraph.end)}`;
      saveReadingParagraphEdit({ userIdentityId, bookId, chapterId: activeParagraph.chapterId, paragraph: activeParagraph.paragraph, replacementText: revisedText });
      refreshAnnotations();
      window.getSelection()?.removeAllRanges();
      setActiveParagraph(null);
      setSelectionToolbarPosition(null);
      setToolMessage("正文修改已保存到本地");
    } catch { setToolMessage("正文修改保存失败"); }
  };

  const requestAiCommentReply = async (parent: ReadingComment, paragraph: ReadingParagraphView, chapterId: string) => {
    if (!room || !settings || !character || !relationship) return;
    setIsAiResponding(true);
    try {
      advanceAiReadingToParagraph({ scope: room, paragraphAnchorId: paragraph.anchor.id });
      const response = await requestReadingCompanionResponse({
        room,
        character,
        relationship,
        settings,
        paragraph,
        kind: "discussion_reply",
        userPrompt: `回应我的这条共读评论：${parent.body}`,
        recentMessages: [{ author: "user", body: parent.body }],
        worldBookContext,
      });
      if (response) createAiReadingComment({ scope: room, authorName: room.characterSnapshot.name, targetChapterId: chapterId, targetParagraphAnchorId: paragraph.anchor.id, textSnapshot: paragraph.text, body: response.body, parentCommentId: parent.id, isSpoiler: response.isSpoiler });
      refreshRoomComments();
    } catch (reason) {
      setToolMessage(reason instanceof Error ? reason.message : "好友暂时无法回复段评");
    } finally {
      setIsAiResponding(false);
    }
  };

  const addParagraphComment = () => {
    if (!activeParagraph) return;
    const body = window.prompt(room ? `写给共读房间的段评（${room.characterSnapshot.name} 可见）：` : "写下这段文字的段评：", "");
    if (!body?.trim()) return;
    try {
      if (!room) {
        createReadingAnnotation({ userIdentityId, bookId, chapterId: activeParagraph.chapterId, paragraph: activeParagraph.paragraph, kind: "note", note: body, start: activeParagraph.start, end: activeParagraph.end });
        refreshAnnotations();
        setToolMessage("段评已保存到本书");
        return;
      }
      const comment = createUserReadingComment({ scope: room, authorName: "我", kind: "paragraph", body, targetChapterId: activeParagraph.chapterId, targetParagraphAnchorId: activeParagraph.paragraph.anchor.id, textSnapshot: activeParagraph.paragraph.text.slice(activeParagraph.start, activeParagraph.end) });
      refreshRoomComments();
      setToolMessage("段评已保存到当前共读房间");
      void requestAiCommentReply(comment, activeParagraph.paragraph, activeParagraph.chapterId);
    } catch { setToolMessage("段评保存失败"); }
  };

  const jumpToSearchResult = (result: ReadingSearchResult) => {
    setCurrentChapterId(result.chapterId);
    setIsSearchOpen(false);
    scrollToAnchor(result.paragraph.anchor.id, "smooth", result.matchStart);
  };

  const getDiscussionParagraph = () => activeParagraph
    ? { paragraph: activeParagraph.paragraph, chapterId: activeParagraph.chapterId }
    : currentPositionRef.current
      ? { paragraph: currentPositionRef.current.paragraph, chapterId: currentPositionRef.current.chapterId }
      : flatParagraphs.find((item) => item.chapterId === currentChapterId) || flatParagraphs[0];

  const openRoomDiscussion = () => {
    if (!room) return;
    const context = getDiscussionParagraph();
    if (!context) return;
    const openDiscussions = listReadingDiscussions(room).filter((item) => item.status !== "closed");
    const byLatestUpdate = (left: typeof openDiscussions[number], right: typeof openDiscussions[number]) => right.updatedAt - left.updatedAt;
    const existing = openDiscussions
      .filter((item) => item.targetParagraphAnchorId === context.paragraph.anchor.id)
      .sort(byLatestUpdate)[0]
      || [...openDiscussions].sort(byLatestUpdate)[0];
    setDiscussionId(existing?.id || null);
    setDiscussionMessages(existing ? listDiscussionMessages(room, existing.id) : []);
    setDiscussionDraft("");
    setIsDiscussionOpen(true);
  };

  const sendDiscussionMessage = async () => {
    const prompt = discussionDraft.trim();
    const activeDiscussion = room && discussionId ? listReadingDiscussions(room).find((item) => item.id === discussionId) : undefined;
    const anchoredContext = activeDiscussion?.targetParagraphAnchorId
      ? flatParagraphs.find((item) => item.paragraph.anchor.id === activeDiscussion.targetParagraphAnchorId)
      : undefined;
    const context = anchoredContext || getDiscussionParagraph();
    if (!room || !context || !prompt || isAiResponding) return;
    setDiscussionDraft("");
    setIsAiResponding(true);
    let activeDiscussionId = discussionId;
    try {
      advanceAiReadingToParagraph({ scope: room, paragraphAnchorId: context.paragraph.anchor.id });
      if (!activeDiscussionId) {
        const discussion = startReadingDiscussion({ scope: room, authorName: "我", userPrompt: prompt, targetChapterId: context.chapterId, targetParagraphAnchorId: context.paragraph.anchor.id, frozenFragment: context.paragraph.text });
        activeDiscussionId = discussion.id;
        setDiscussionId(discussion.id);
      } else {
        appendReadingDiscussionMessage({ scope: room, discussionId: activeDiscussionId, author: "user", authorName: "我", body: prompt });
      }
      setDiscussionMessages(listDiscussionMessages(room, activeDiscussionId));
      if (!settings || !character || !relationship) throw new Error("请先配置 API，并确认该共读好友仍有可用人设");
      const beforeReply = listDiscussionMessages(room, activeDiscussionId);
      const response = await requestReadingCompanionResponse({
        room,
        character,
        relationship,
        settings,
        paragraph: context.paragraph,
        kind: "discussion_reply",
        userPrompt: prompt,
        recentMessages: beforeReply.map((message) => ({ author: message.author, body: message.body })),
        worldBookContext,
      });
      if (response) appendReadingDiscussionMessage({ scope: room, discussionId: activeDiscussionId, author: "ai", authorName: room.characterSnapshot.name, body: response.body, source: response.source });
      setDiscussionMessages(listDiscussionMessages(room, activeDiscussionId));
    } catch (reason) {
      if (room && activeDiscussionId) {
        setDiscussionMessages(listDiscussionMessages(room, activeDiscussionId));
      }
      setToolMessage(reason instanceof Error ? reason.message : "实时讨论暂时失败");
    } finally {
      setIsAiResponding(false);
    }
  };

  const submitCommentReply = () => {
    if (!room || !replyToComment || !commentReplyDraft.trim()) return;
    const paragraph = flatParagraphs.find((item) => item.paragraph.anchor.id === replyToComment.targetParagraphAnchorId);
    if (!paragraph) return;
    try {
      const reply = createUserReadingComment({ scope: room, authorName: "我", kind: "reply", body: commentReplyDraft, targetChapterId: paragraph.chapterId, targetParagraphAnchorId: paragraph.paragraph.anchor.id, textSnapshot: replyToComment.textSnapshot || paragraph.paragraph.text, parentCommentId: replyToComment.id });
      setCommentReplyDraft("");
      setReplyToComment(null);
      refreshRoomComments();
      void requestAiCommentReply(reply, paragraph.paragraph, paragraph.chapterId);
    } catch { setToolMessage("评论回复保存失败"); }
  };

  const turnHorizontalPage = (direction: -1 | 1) => {
    const container = scrollRef.current;
    if (!container || preferences.pageMode !== "horizontal") return;
    const pageWidth = Math.max(container.clientWidth, 1);
    const maximum = Math.max(0, container.scrollWidth - container.clientWidth);
    const currentPage = Math.round(container.scrollLeft / pageWidth);
    container.scrollTo({ left: Math.min(maximum, Math.max(0, (currentPage + direction) * pageWidth)), behavior: "smooth" });
  };

  const handleReaderEdgeClick = (event: React.MouseEvent<HTMLElement>) => {
    if (preferences.pageMode !== "horizontal" || !window.getSelection()?.isCollapsed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    if (ratio <= 0.24) turnHorizontalPage(-1);
    else if (ratio >= 0.76) turnHorizontalPage(1);
  };

  const clearTextSelection = useCallback(() => {
    setActiveParagraph(null);
    setSelectionToolbarPosition(null);
    setToolMessage(null);
  }, []);

  const syncTextSelection = useCallback((paragraph: ReadingParagraphView, chapterId: string, element: HTMLParagraphElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.toString().trim()) {
      clearTextSelection();
      return;
    }
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
      clearTextSelection();
      return;
    }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(range.startContainer, range.startOffset);
    const suffix = range.cloneRange();
    suffix.selectNodeContents(element);
    suffix.setEnd(range.endContainer, range.endOffset);
    const start = Math.min(prefix.toString().length, paragraph.text.length);
    const end = Math.min(suffix.toString().length, paragraph.text.length);
    if (end <= start) {
      clearTextSelection();
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelectionToolbarPosition({
      left: Math.min(Math.max(rect.left + rect.width / 2, 168), window.innerWidth - 168),
      top: Math.max(8, rect.top - 70),
    });
    setActiveParagraph({ paragraph, chapterId, start, end });
    setToolMessage(null);
  }, [clearTextSelection]);

  const syncSelectionFromDocument = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
    const paragraphElement = startElement?.closest<HTMLParagraphElement>("p[data-anchor-id]");
    if (!paragraphElement || !scrollRef.current?.contains(paragraphElement) || !paragraphElement.contains(range.endContainer)) return;
    const anchorId = paragraphElement.dataset.anchorId;
    const item = flatParagraphs.find((candidate) => candidate.paragraph.anchor.id === anchorId);
    if (item) syncTextSelection(item.paragraph, item.chapterId, paragraphElement);
  }, [flatParagraphs, syncTextSelection]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (selectionSyncTimerRef.current !== null) window.clearTimeout(selectionSyncTimerRef.current);
      selectionSyncTimerRef.current = window.setTimeout(syncSelectionFromDocument, 60);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionSyncTimerRef.current !== null) window.clearTimeout(selectionSyncTimerRef.current);
    };
  }, [syncSelectionFromDocument]);

  useEffect(() => {
    const dismissSelection = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-reading-selection-toolbar]")) return;
      window.getSelection()?.removeAllRanges();
      clearTextSelection();
    };
    document.addEventListener("pointerdown", dismissSelection, true);
    return () => document.removeEventListener("pointerdown", dismissSelection, true);
  }, [clearTextSelection]);

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
        <div className="min-w-0 px-3 text-center"><h1 className="max-w-56 truncate text-sm font-bold">{content?.book.title || "阅读"}</h1><p className="mt-0.5 max-w-56 truncate text-[10px] text-[var(--text-muted)]">{room ? `与 ${room.characterSnapshot.name} 共读 · ` : ""}{content?.chapters[currentChapterIndex]?.chapter.title || "正在打开正文"}</p></div>
        <button type="button" onClick={() => setIsTocOpen(true)} aria-label="打开目录" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><List className="h-4 w-4" /></button>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><LoaderCircle className="h-5 w-5 animate-spin" />正在加载正文</div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><BookOpenText className="h-8 w-8 text-[var(--text-muted)]" /><p className="mt-4 text-sm font-bold">无法打开这本书</p><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{error}</p></div>
      ) : (
        <main ref={scrollRef} onScroll={handleScroll} onClick={handleReaderEdgeClick} onPointerUp={() => { if (preferences.pageMode === "horizontal") window.setTimeout(() => snapToHorizontalPage(), 20); }} aria-label="小说正文" className={`flex-1 ${preferences.pageMode === "horizontal" ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto pb-28 pt-8"}`} style={{ paddingLeft: preferences.pageMargin, paddingRight: preferences.pageMargin, scrollSnapType: preferences.pageMode === "horizontal" ? "x mandatory" : undefined, overscrollBehaviorX: preferences.pageMode === "horizontal" ? "contain" : undefined }}>
          <article
            className={preferences.pageMode === "horizontal" ? "h-full py-8" : "mx-auto max-w-[42rem]"}
            style={preferences.pageMode === "horizontal" ? {
              columnWidth: `calc(100vw - ${(preferences.pageMargin || 24) * 2}px)`,
              columnGap: `${(preferences.pageMargin || 24) * 2}px`,
              columnFill: "auto",
              height: "100%",
            } : undefined}
          >
            {displayContent?.chapters.map((chapterView) => (
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
                      onMouseUp={(event) => { const element = event.currentTarget; window.setTimeout(() => syncTextSelection(paragraph, chapterView.chapter.id, element), 0); }}
                      onTouchEnd={(event) => { const element = event.currentTarget; window.setTimeout(() => syncTextSelection(paragraph, chapterView.chapter.id, element), 100); }}
                      onContextMenu={(event) => { if (!window.getSelection()?.isCollapsed) event.preventDefault(); }}
                      className={`relative select-text rounded-md transition-colors ${annotations.some((item) => item.paragraphAnchorId === paragraph.anchor.id && item.kind === "note") ? "border-b border-dashed border-current" : ""}`}
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: "0 96px",
                        userSelect: "text",
                        WebkitUserSelect: "text",
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
                      {room && roomComments.some((item) => item.targetParagraphAnchorId === paragraph.anchor.id) && <button type="button" data-reading-selection-toolbar onClick={(event) => { event.stopPropagation(); setCommentThreadAnchorId(paragraph.anchor.id); }} aria-label={`查看 ${roomComments.filter((item) => item.targetParagraphAnchorId === paragraph.anchor.id).length} 条段评`} className="absolute -right-5 bottom-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-current px-1 text-[8px] opacity-70">{roomComments.filter((item) => item.targetParagraphAnchorId === paragraph.anchor.id).length}</button>}
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
          {room ? <button type="button" onClick={openRoomDiscussion} aria-label={`和 ${room.characterSnapshot.name} 讨论当前内容`} className="flex max-w-24 items-center gap-1 rounded-xl px-1.5 py-1 text-[10px] font-bold text-[var(--text-muted)]">{room.characterSnapshot.avatar ? <img src={room.characterSnapshot.avatar} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-cyan-400/40" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-raised)] ring-2 ring-cyan-400/40">{room.characterSnapshot.name.slice(0,1)}</span>}<span className="truncate">讨论</span></button> : <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{percent.toFixed(1)}%</span>}
          <button type="button" onClick={() => setIsSettingsOpen(true)} aria-label="阅读设置" className="flex h-8 w-8 items-center justify-center rounded-xl"><SlidersHorizontal className="h-4 w-4" /></button>
          <button type="button" disabled={!content || currentChapterIndex >= content.chapters.length - 1} onClick={() => jumpToChapter(currentChapterIndex + 1)} className="flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-bold disabled:opacity-30">下一章<ChevronRight className="h-4 w-4" /></button>
        </footer>
      )}

      {activeParagraph && selectionToolbarPosition && !isTocOpen && !isSearchOpen && !isSettingsOpen && (
        <div data-reading-selection-toolbar className="fixed z-[70] w-[336px] max-w-[calc(100vw-16px)] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--text-primary)] shadow-xl" style={{ left: selectionToolbarPosition.left, top: selectionToolbarPosition.top }}>
          <div className="grid grid-cols-5 gap-0.5">
            <button type="button" onClick={copyActiveParagraph} className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[9px]"><Copy className="h-4 w-4" />复制</button>
            <button type="button" onClick={toggleHighlight} className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[9px]"><Highlighter className="h-4 w-4" />高亮</button>
            <button type="button" onClick={addParagraphComment} className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[9px]"><MessageCircle className="h-4 w-4" />段评</button>
            <button type="button" onClick={toggleBookmark} className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[9px]"><Bookmark className="h-4 w-4" />书签</button>
            <button type="button" onClick={editActiveText} className="flex flex-col items-center gap-1 rounded-lg py-1.5 text-[9px]"><Pencil className="h-4 w-4" />编辑</button>
          </div>
          {toolMessage && <p className="border-t border-[var(--border)] px-2 pt-2 text-center text-[10px] text-[var(--text-muted)]">{toolMessage}</p>}
          {annotations.filter((item) => item.paragraphAnchorId === activeParagraph.paragraph.anchor.id && item.kind === "note").map((item) => (
            <div key={item.id} className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--surface-raised)] p-2 text-xs"><p className="min-w-0 flex-1 leading-5">{item.note}</p><button type="button" aria-label="删除笔记" onClick={() => { deleteReadingAnnotation(userIdentityId, item.id); refreshAnnotations(); }}><Trash2 className="h-3.5 w-3.5" /></button></div>
          ))}
        </div>
      )}

      {commentThreadAnchorId && room && (
        <div className="absolute inset-0 z-[75] flex bg-black/40" role="dialog" aria-modal="true" aria-label="共读段评">
          <div className="mt-auto flex max-h-[76%] w-full flex-col rounded-t-[2rem] bg-[var(--surface)] text-[var(--text-primary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div><h2 className="text-base font-bold">共读段评</h2><p className="mt-1 text-[11px] text-[var(--text-muted)]">只属于你与 {room.characterSnapshot.name} 的共读房间</p></div>
              <button type="button" onClick={() => { setCommentThreadAnchorId(null); setReplyToComment(null); }} aria-label="关闭段评" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {roomComments.filter((comment) => comment.targetParagraphAnchorId === commentThreadAnchorId).map((comment) => (
                <div key={comment.id} className={`rounded-2xl border border-[var(--border)] p-3 ${comment.author === "ai" ? "ml-5 bg-cyan-500/5" : "mr-5 bg-[var(--surface-raised)]"}`}>
                  <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold">{comment.authorName}</span><span className="text-[9px] text-[var(--text-muted)]">{comment.parentCommentId ? "回复" : "段评"}</span></div>
                  {comment.textSnapshot && !comment.parentCommentId && <p className="mt-2 line-clamp-2 border-l-2 border-current/20 pl-2 text-[10px] leading-4 text-[var(--text-muted)]">{comment.textSnapshot}</p>}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
                  <button type="button" onClick={() => { setReplyToComment(comment); setCommentReplyDraft(""); }} className="mt-2 text-[10px] font-bold text-cyan-600">回复</button>
                </div>
              ))}
              {isAiResponding && <p className="py-2 text-center text-xs text-[var(--text-muted)]">{room.characterSnapshot.name} 正在读这段并回复…</p>}
            </div>
            {replyToComment && (
              <div className="border-t border-[var(--border)] p-3">
                <p className="mb-2 truncate text-[10px] text-[var(--text-muted)]">回复 {replyToComment.authorName}：{replyToComment.body}</p>
                <div className="flex gap-2"><input autoFocus value={commentReplyDraft} onChange={(event) => setCommentReplyDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitCommentReply(); }} placeholder="继续讨论这条段评…" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm outline-none" /><button type="button" onClick={submitCommentReply} disabled={!commentReplyDraft.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--text-primary)] text-[var(--surface)] disabled:opacity-30"><Send className="h-4 w-4" /></button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {isDiscussionOpen && room && (
        <div className="absolute inset-0 z-[75] flex bg-black/40" role="dialog" aria-modal="true" aria-label={`和 ${room.characterSnapshot.name} 讨论当前内容`}>
          <div className="mt-auto flex max-h-[82%] w-full flex-col rounded-t-[2rem] bg-[var(--surface)] text-[var(--text-primary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">{room.characterSnapshot.avatar ? <img src={room.characterSnapshot.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)]">{room.characterSnapshot.name.slice(0,1)}</span>}<div className="min-w-0"><h2 className="truncate text-base font-bold">和 {room.characterSnapshot.name} 聊当前内容</h2><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">TA 只会读取当前已读范围与本次讨论</p></div></div>
              <button type="button" onClick={() => setIsDiscussionOpen(false)} aria-label="关闭实时讨论" className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><X className="h-4 w-4" /></button>
            </div>
            <div ref={discussionScrollRef} className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {discussionMessages.length === 0 && <div className="rounded-2xl bg-[var(--surface-raised)] p-4 text-xs leading-5 text-[var(--text-muted)]">可以直接问 TA 对当前情节、人物或细节的看法。当前片段会被冻结在这个共读房间，不会串到其他好友。</div>}
              {discussionMessages.map((message) => <div key={message.id} className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.author === "user" ? "ml-auto bg-[var(--text-primary)] text-[var(--surface)]" : "mr-auto bg-[var(--surface-raised)]"}`}><p className="mb-0.5 text-[9px] opacity-60">{message.authorName}</p><p className="whitespace-pre-wrap">{message.body}</p></div>)}
              {isAiResponding && <div className="mr-auto flex items-center gap-2 rounded-2xl bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-muted)]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />{room.characterSnapshot.name} 正在回应…</div>}
            </div>
            <div className="flex gap-2 border-t border-[var(--border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><textarea value={discussionDraft} onChange={(event) => setDiscussionDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendDiscussionMessage(); } }} placeholder="讨论当前内容…" rows={1} className="h-10 min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm leading-5 outline-none" /><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => void sendDiscussionMessage()} disabled={!discussionDraft.trim() || isAiResponding} className="flex h-10 w-10 items-center justify-center self-end rounded-xl bg-[var(--text-primary)] text-[var(--surface)] disabled:opacity-30"><Send className="h-4 w-4" /></button></div>
          </div>
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
            <div className="mt-3 grid grid-cols-2 gap-2" aria-label="翻页方式"><button type="button" onClick={() => updatePreferences({ pageMode: "scroll" })} className={`h-10 rounded-xl border text-xs font-bold ${preferences.pageMode !== "horizontal" ? "border-[var(--text-primary)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}>上下滚动</button><button type="button" onClick={() => updatePreferences({ pageMode: "horizontal" })} className={`h-10 rounded-xl border text-xs font-bold ${preferences.pageMode === "horizontal" ? "border-[var(--text-primary)] bg-[var(--surface-raised)]" : "border-[var(--border)]"}`}>左右翻页</button></div>
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
