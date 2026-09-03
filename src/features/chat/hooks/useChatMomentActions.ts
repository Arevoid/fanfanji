import { useCallback, type Dispatch, type MouseEvent, type MutableRefObject, type PointerEvent, type SetStateAction } from "react";
import type { MomentComment, Sticker, UserSettings } from "../../../types";
import type { CommentContextMenuState, MomentContextMenuState, MomentFavorite } from "./useChatMomentsInteractionState";
import { apiTranslate } from "../../../utils/apiHelper";

interface UseChatMomentActionsOptions {
  settings: Pick<UserSettings, "apiKey" | "selectedModel" | "apiEndpoint">;
  momentTranslations: Record<string, string>;
  commentTranslations: Record<string, string>;
  momentFavorites: MomentFavorite[];
  commentDeleteTarget: { momentId: string; commentId: string } | null;
  onDeleteMoment?: (momentId: string) => void;
  onDeleteCommentFromMoment?: (momentId: string, commentId: string) => void;
  showToast: (message: string) => void;
  getMomentCommentTranslationKey: (momentId: string, commentId: string) => string;
  setMomentContextMenu: Dispatch<SetStateAction<MomentContextMenuState | null>>;
  setCommentContextMenu: Dispatch<SetStateAction<CommentContextMenuState | null>>;
  setCommentDeleteTarget: Dispatch<SetStateAction<{ momentId: string; commentId: string } | null>>;
  setMomentTranslations: Dispatch<SetStateAction<Record<string, string>>>;
  setCommentTranslations: Dispatch<SetStateAction<Record<string, string>>>;
  setMomentFavorites: Dispatch<SetStateAction<MomentFavorite[]>>;
  setReplyingToCommentMap: Dispatch<SetStateAction<Record<string, MomentComment>>>;
  setShowCommentInputMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  longPressTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  longPressOriginRef: MutableRefObject<{ x: number; y: number } | null>;
  commentLongPressTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  commentLongPressOriginRef: MutableRefObject<{ x: number; y: number } | null>;
  suppressCommentClickRef: MutableRefObject<boolean>;
}

/** Owns Moments gesture/menu actions while keeping persistence state in its companion hook. */
export function useChatMomentActions({
  settings,
  momentTranslations,
  commentTranslations,
  momentFavorites,
  commentDeleteTarget,
  onDeleteMoment,
  onDeleteCommentFromMoment,
  showToast,
  getMomentCommentTranslationKey,
  setMomentContextMenu,
  setCommentContextMenu,
  setCommentDeleteTarget,
  setMomentTranslations,
  setCommentTranslations,
  setMomentFavorites,
  setReplyingToCommentMap,
  setShowCommentInputMap,
  longPressTimerRef,
  longPressOriginRef,
  commentLongPressTimerRef,
  commentLongPressOriginRef,
  suppressCommentClickRef,
}: UseChatMomentActionsOptions) {
  const handleMomentTextPointerDown = useCallback((
    event: PointerEvent,
    momentId: string,
    text: string,
    authorName: string,
    authorAvatar: string,
    isOwn: boolean,
    timestamp: number,
  ) => {
    const clientX = event.clientX;
    const clientY = event.clientY;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressOriginRef.current = { x: clientX, y: clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* older mobile browsers may not support capture */ }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressOriginRef.current = null;
      setMomentContextMenu({ momentId, text, x: clientX, y: clientY, authorName, authorAvatar, isOwn, timestamp });
    }, 500);
  }, [longPressOriginRef, longPressTimerRef, setMomentContextMenu]);

  const handleMomentTextPointerUpOrLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, [longPressOriginRef, longPressTimerRef]);

  const handleMomentTextPointerMove = useCallback((event: PointerEvent) => {
    const origin = longPressOriginRef.current;
    if (longPressTimerRef.current && origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      longPressOriginRef.current = null;
    }
  }, [longPressOriginRef, longPressTimerRef]);

  const handleMomentCommentPointerDown = useCallback((event: PointerEvent, momentId: string, comment: MomentComment) => {
    const clientX = event.clientX;
    const clientY = event.clientY;
    suppressCommentClickRef.current = false;
    if (commentLongPressTimerRef.current) clearTimeout(commentLongPressTimerRef.current);
    commentLongPressOriginRef.current = { x: clientX, y: clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* older mobile browsers may not support capture */ }
    commentLongPressTimerRef.current = setTimeout(() => {
      suppressCommentClickRef.current = true;
      commentLongPressTimerRef.current = null;
      commentLongPressOriginRef.current = null;
      setCommentContextMenu({ momentId, commentId: comment.id, text: comment.content, x: clientX, y: clientY });
    }, 550);
  }, [commentLongPressOriginRef, commentLongPressTimerRef, setCommentContextMenu, suppressCommentClickRef]);

  const clearMomentCommentLongPress = useCallback(() => {
    if (commentLongPressTimerRef.current) {
      clearTimeout(commentLongPressTimerRef.current);
      commentLongPressTimerRef.current = null;
    }
    commentLongPressOriginRef.current = null;
  }, [commentLongPressOriginRef, commentLongPressTimerRef]);

  const handleMomentCommentPointerMove = useCallback((event: PointerEvent) => {
    const origin = commentLongPressOriginRef.current;
    if (commentLongPressTimerRef.current && origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) clearMomentCommentLongPress();
  }, [clearMomentCommentLongPress, commentLongPressOriginRef, commentLongPressTimerRef]);

  const handleMomentCommentClick = useCallback((momentId: string, comment: MomentComment) => {
    if (suppressCommentClickRef.current) {
      suppressCommentClickRef.current = false;
      return;
    }
    setReplyingToCommentMap((previous) => ({ ...previous, [momentId]: comment }));
    setShowCommentInputMap((previous) => ({ ...previous, [momentId]: true }));
  }, [setReplyingToCommentMap, setShowCommentInputMap, suppressCommentClickRef]);

  const confirmDeleteMomentComment = useCallback(() => {
    if (!commentDeleteTarget || !onDeleteCommentFromMoment) return;
    onDeleteCommentFromMoment(commentDeleteTarget.momentId, commentDeleteTarget.commentId);
    setCommentDeleteTarget(null);
    showToast("评论已删除");
  }, [commentDeleteTarget, onDeleteCommentFromMoment, setCommentDeleteTarget, showToast]);

  const handleMomentTextContextMenu = useCallback((event: MouseEvent, momentId: string, text: string, authorName: string, authorAvatar: string, isOwn: boolean, timestamp: number) => {
    event.preventDefault();
    setMomentContextMenu({ momentId, text, x: event.clientX, y: event.clientY, authorName, authorAvatar, isOwn, timestamp });
  }, [setMomentContextMenu]);

  const handleCopyMomentText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
    setMomentContextMenu(null);
  }, [setMomentContextMenu, showToast]);

  const handleFavoriteMoment = useCallback((momentId: string, text: string, authorName: string, authorAvatar: string, timestamp: number) => {
    const isAlreadyFaved = momentFavorites.some((favorite) => favorite.momentId === momentId && favorite.content === text);
    if (isAlreadyFaved) {
      setMomentFavorites((previous) => previous.filter((favorite) => !(favorite.momentId === momentId && favorite.content === text)));
      showToast("已取消收藏");
    } else {
      setMomentFavorites((previous) => [{ id: `fav-moment-${Date.now()}`, momentId, authorName, authorAvatar, content: text, timestamp: timestamp || Date.now() }, ...previous]);
      showToast("已收藏");
    }
    setMomentContextMenu(null);
  }, [momentFavorites, setMomentContextMenu, setMomentFavorites, showToast]);

  const handleTranslateMoment = useCallback(async (momentId: string, text: string) => {
    setMomentContextMenu(null);
    if (momentTranslations[momentId]) {
      setMomentTranslations((previous) => { const next = { ...previous }; delete next[momentId]; return next; });
      return;
    }
    showToast("正在翻译中...");
    try {
      const result = await apiTranslate({ text, apiKey: settings.apiKey || "", model: settings.selectedModel || "gemini-3.5-flash", apiEndpoint: settings.apiEndpoint });
      if (result?.text) { setMomentTranslations((previous) => ({ ...previous, [momentId]: result.text })); showToast("翻译完成"); }
      else showToast("翻译无结果");
    } catch (error) {
      console.error("Translate moment failed:", error);
      showToast(error instanceof Error ? error.message : "翻译失败，请检查 API 配置");
    }
  }, [momentTranslations, setMomentContextMenu, setMomentTranslations, settings.apiEndpoint, settings.apiKey, settings.selectedModel, showToast]);

  const handleTranslateMomentComment = useCallback(async (momentId: string, commentId: string, text: string) => {
    setCommentContextMenu(null);
    const translationKey = getMomentCommentTranslationKey(momentId, commentId);
    if (commentTranslations[translationKey]) {
      setCommentTranslations((previous) => { const next = { ...previous }; delete next[translationKey]; return next; });
      return;
    }
    showToast("正在翻译中...");
    try {
      const result = await apiTranslate({ text, apiKey: settings.apiKey || "", model: settings.selectedModel || "gemini-3.5-flash", apiEndpoint: settings.apiEndpoint });
      if (result?.text) { setCommentTranslations((previous) => ({ ...previous, [translationKey]: result.text })); showToast("翻译完成"); }
      else showToast("翻译无结果");
    } catch (error) {
      console.error("Translate moment comment failed:", error);
      showToast(error instanceof Error ? error.message : "翻译失败，请检查 API 配置");
    }
  }, [commentTranslations, getMomentCommentTranslationKey, setCommentContextMenu, setCommentTranslations, settings.apiEndpoint, settings.apiKey, settings.selectedModel, showToast]);

  const handleDeleteMomentClick = useCallback((momentId: string) => {
    setMomentContextMenu(null);
    if (!confirm("确定要删除这条朋友圈吗？")) return;
    if (onDeleteMoment) { onDeleteMoment(momentId); showToast("已删除朋友圈"); }
    else showToast("删除失败：未提供删除接口");
  }, [onDeleteMoment, setMomentContextMenu, showToast]);

  return { handleMomentTextPointerDown, handleMomentTextPointerUpOrLeave, handleMomentTextPointerMove, handleMomentCommentPointerDown, clearMomentCommentLongPress, handleMomentCommentPointerMove, handleMomentCommentClick, confirmDeleteMomentComment, handleMomentTextContextMenu, handleCopyMomentText, handleFavoriteMoment, handleTranslateMoment, handleTranslateMomentComment, handleDeleteMomentClick };
}
