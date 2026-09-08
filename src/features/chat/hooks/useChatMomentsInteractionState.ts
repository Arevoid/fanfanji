import { useEffect, useState } from "react";
import type { Moment } from "../../../types";
import { readJson, readString, writeJson, writeString } from "../../../core/storage/storageAdapter";
import { readArray } from "../../../core/storage/repositories/repositoryUtils";

export interface MomentContextMenuState {
  momentId: string;
  text: string;
  x: number;
  y: number;
  authorName: string;
  authorAvatar: string;
  isOwn: boolean;
  timestamp: number;
}

export interface CommentContextMenuState {
  momentId: string;
  commentId: string;
  text: string;
  x: number;
  y: number;
}

export interface MomentFavorite {
  id: string;
  momentId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  timestamp: number;
}

export function useChatMomentsInteractionState(activeTab: string, moments: Moment[]) {
  const [lastViewedMomentsTime, setLastViewedMomentsTime] = useState(() => Number(readString("phone_last_viewed_moments_time").value || "0"));
  const [momentContextMenu, setMomentContextMenu] = useState<MomentContextMenuState | null>(null);
  const [commentDeleteTarget, setCommentDeleteTarget] = useState<{ momentId: string; commentId: string } | null>(null);
  const [commentContextMenu, setCommentContextMenu] = useState<CommentContextMenuState | null>(null);
  const [momentTranslations, setMomentTranslations] = useState<Record<string, string>>(() => readJson<Record<string, string>>("phone_moment_translations", {}).value);
  const [commentTranslations, setCommentTranslations] = useState<Record<string, string>>(() => readJson<Record<string, string>>("phone_moment_comment_translations", {}).value);
  const [momentFavorites, setMomentFavorites] = useState<MomentFavorite[]>(() => readArray<MomentFavorite>("phone_moment_favorites", []).value);
  const [favedTab, setFavedTab] = useState<"chats" | "moments">("chats");

  useEffect(() => { writeJson("phone_moment_translations", momentTranslations); }, [momentTranslations]);
  useEffect(() => { writeJson("phone_moment_comment_translations", commentTranslations); }, [commentTranslations]);
  useEffect(() => { writeJson("phone_moment_favorites", momentFavorites); }, [momentFavorites]);
  useEffect(() => {
    if (activeTab !== "moments") return;
    const now = Date.now();
    setLastViewedMomentsTime(now);
    writeString("phone_last_viewed_moments_time", now.toString());
  }, [activeTab, moments]);

  return {
    lastViewedMomentsTime, setLastViewedMomentsTime,
    momentContextMenu, setMomentContextMenu, commentDeleteTarget, setCommentDeleteTarget,
    commentContextMenu, setCommentContextMenu, momentTranslations, setMomentTranslations,
    commentTranslations, setCommentTranslations, momentFavorites, setMomentFavorites, favedTab, setFavedTab,
  };
}
