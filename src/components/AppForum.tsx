import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createId as createApplicationId } from "../core/id/createId";
import {
  ChevronLeft,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
  Reply,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
  User,
  Pencil,
  X,
  Download,
  Upload,
} from "lucide-react";
import type {
  Character,
  ForumCommunityNpc,
  ForumGenerationTask,
  ForumReply,
  ForumThread,
  ForumThreadPublicSnapshot,
  MemoryItem,
  Message,
  UserIdentity,
  UserSettings,
  WorldBookEntry,
} from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import {
  appendForumReply,
  createForumReply,
  createForumThread,
  deleteForumThread,
  getForumLikeCount,
  listForumRepliesForThread,
  listForumThreadsForIdentity,
  selectForumThreadMetrics,
  toggleForumReplyLike,
  toggleForumThreadLike,
  tombstoneForumReply,
} from "../domain/forum/forumData";
import {
  loadForumActivityTasks,
  loadForumActorStates,
  loadForumGenerationTasks,
  loadForumDataSafely,
  loadForumReplies,
  loadForumThreads,
  commitForumMutation,
  getForumSnapshotForIdentity,
  subscribeForumState,
  subscribeForumMutation,
} from "../core/storage/repositories/forumRepository";
import {
  createForumTranslationHash,
  deleteForumTranslationForReply,
  deleteForumTranslationsForThread,
  getForumTranslation,
  touchForumTranslation,
} from "../core/storage/repositories/forumTranslationRepository";
import { getForumTranslationTargetLanguage, translateForumContent } from "../features/forum/services/forumTranslationService";
import { forceForumThreadActivity, scheduleForumUserInteraction, scheduleInitialForumReplies } from "../features/forum/services/forumActivityRuntime";
import { BottomSheet, Button, ConfirmDialog, PopoverMenu } from "./ui";
import { ForumAvatar } from "../features/forum/components/ForumAvatar";
import { ForumThreadCard } from "../features/forum/components/ForumThreadCard";
import { ForumSnapshotDetail } from "../features/forum/components/ForumSnapshotDetail";
import { appendForumShareOnce, listForumShareTargets } from "../domain/forum/forumShare";
import { createForumShareOperation } from "../features/forum/services/forumShareService";
import {
  buildForumGenerationTaskKey,
  beginForumGenerationTask,
  finishForumGenerationTask,
  hasEvaluatedLikeEngagement,
  removeForumGenerationTasksByThread,
  releaseForumGenerationTask,
} from "../domain/forum/forumGenerationGuard";
import {
  generateForumThreads,
  generateInitialRepliesForUserThread,
  generateThreadActivity,
  mapForumGenerationError,
} from "../features/forum/services/forumGenerationService";
import {
  buildForumProtectedNames,
} from "../domain/forum/forumContentSafety";
import { appendForumNotification, createForumNotification, createForumProfile, recordForumVisit, resolveForumPublicAuthor, updateForumLikeHistory } from "../domain/forum/forumProfileData";
import { imageAssetDb } from "../utils/imageAssetDb";
import {
  listForumCommunityNpcsForIdentity,
  removeForumCommunityNpc,
} from "../core/storage/repositories/forumCommunityNpcRepository";
import { listForumStoryUiItems } from "../features/forumStory/forumStoryUiData";
import { ForumStoryList } from "../features/forumStory/components/ForumStoryList";
import { ForumStoryThreadView } from "../features/forumStory/components/ForumStoryThreadView";
import {
  advanceForumStoryOnManualRefresh,
  generateForumStoryOnManualRefresh,
} from "../features/forumStory/services/forumStoryRefreshService";
import { ForumStoryEngagementService } from "../features/forumStory/services/forumStoryEngagementService";
import { getForumStoryUiThread } from "../features/forumStory/forumStoryUiData";
import type { ForumStoryUiReply } from "../features/forumStory/forumStoryUiData";
import { useForumStoryReaderActions } from "../features/forumStory/hooks/useForumStoryReaderActions";
import { FORUM_HOME_PAGE_SIZE, FORUM_REPLY_PAGE_SIZE } from "../domain/forum/forumCapacity";
import { useForumActivityEngine } from "../features/forum/hooks/useForumActivityEngine";
import { useForumCommunityNpcActions } from "../features/forum/hooks/useForumCommunityNpcActions";
import { useForumProfileActions } from "../features/forum/hooks/useForumProfileActions";
import { useForumStoryScheduler } from "../features/forumStory/hooks/useForumStoryScheduler";
import { useForumStoryUpdateAction } from "../features/forumStory/hooks/useForumStoryUpdateAction";

interface AppForumProps {
  activeIdentity: UserIdentity;
  characters: Character[];
  relationships: CharacterRelationship[];
  messages: Message[];
  memories: MemoryItem[];
  worldBookEntries: WorldBookEntry[];
  settings: UserSettings;
  openForumShareId?: string | null;
  onOpenForumShareHandled?: () => void;
  onSendMessage: (message: Message) => void;
  onOpenChat: (characterId: string, relationId: string) => void;
  onClose: () => void;
}

type DeleteTarget =
  | { kind: "thread"; threadId: string }
  | { kind: "reply"; replyId: string }
  | null;

const createId = (prefix: string): string => {
  return createApplicationId(prefix);
};

const formatForumTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
};

const truncateQuote = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized;
};

function HistoryList({ title, empty, items, onOpen }: { title: string; empty: string; items: Array<{ id: string; publicSnapshot?: { thread?: ForumThreadPublicSnapshot; title?: string; publicAuthor?: { displayName: string }; body?: string; }; lastVisitedAt?: number; likedAt?: number; occurredAt?: number; preview?: string; actorPublicSnapshot?: { displayName: string } }>; onOpen: (item: any) => void }) {
  if (!items.length) return <p className="py-16 text-center text-sm text-slate-400">{empty}</p>;
  return <section className="overflow-hidden rounded-2xl bg-white shadow-sm"><h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold">{title}</h2>{items.map((item) => {
    const snapshot = item.publicSnapshot?.thread || item.publicSnapshot || {};
    return <button key={item.id} type="button" onClick={() => onOpen(item)} className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0"><p className="truncate text-sm font-semibold text-slate-800">{snapshot.title || item.actorPublicSnapshot?.displayName || "论坛动态"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.preview || snapshot.body || ""}</p></button>;
  })}</section>;
}

export default function AppForum({
  activeIdentity,
  characters,
  relationships,
  messages,
  memories,
  worldBookEntries,
  settings,
  openForumShareId,
  onOpenForumShareHandled,
  onSendMessage,
  onOpenChat,
  onClose,
}: AppForumProps) {
  const forumProtectedNames = useMemo(
    () => buildForumProtectedNames({
      ownerIdentity: activeIdentity,
      characters,
    }),
    [activeIdentity, characters],
  );
  const forumSnapshot = useSyncExternalStore(
    subscribeForumState,
    () => getForumSnapshotForIdentity(activeIdentity.id),
    () => getForumSnapshotForIdentity(activeIdentity.id),
  );
  const { threads, replies, shares, generationTasks, profiles, visitHistory, likeHistory, notifications } = forumSnapshot;
  const [rootTab, setRootTab] = useState<"home" | "mine">("home");
  const [secondaryPage, setSecondaryPage] = useState<"history" | "likes" | "profile" | "community-npcs" | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [readonlySnapshot, setReadonlySnapshot] = useState<ForumThreadPublicSnapshot | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showHomeActions, setShowHomeActions] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [selectedShareRelationId, setSelectedShareRelationId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postAnonymously, setPostAnonymously] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<ForumReply | null>(null);
  const [replyAnonymously, setReplyAnonymously] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isThreadRefreshing, setIsThreadRefreshing] = useState(false);
  const [waitingReplyThreadIds, setWaitingReplyThreadIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [visibleThreadCount, setVisibleThreadCount] = useState(FORUM_HOME_PAGE_SIZE);
  const [visibleReplyCount, setVisibleReplyCount] = useState(FORUM_REPLY_PAGE_SIZE);
  const [translatedContentIds, setTranslatedContentIds] = useState<Record<string, boolean>>({});
  const [translationLoadingIds, setTranslationLoadingIds] = useState<Record<string, boolean>>({});
  const [communityNpcRevision, setCommunityNpcRevision] = useState(0);
  const [showCommunityNpcComposer, setShowCommunityNpcComposer] = useState(false);
  const [communityNpcName, setCommunityNpcName] = useState("");
  const [communityNpcAvatar, setCommunityNpcAvatar] = useState("");
  const [communityNpcPersona, setCommunityNpcPersona] = useState("");
  const [showCommunityNpcMenu, setShowCommunityNpcMenu] = useState(false);
  const [showCommunityNpcExport, setShowCommunityNpcExport] = useState(false);
  const [selectedCommunityNpcIds, setSelectedCommunityNpcIds] = useState<string[]>([]);
  const [forumStoryRevision, setForumStoryRevision] = useState(0);
  const [isStoryUpdating, setIsStoryUpdating] = useState(false);
  const storyLikeNoticeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const replyLockRef = useRef(false);
  const postLockRef = useRef(false);
  const shareLockRef = useRef(false);
  const refreshLockRef = useRef(false);
  const threadRefreshLockRef = useRef(false);
  const homeMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const communityNpcMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const communityNpcImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (storyLikeNoticeTimerRef.current !== null) window.clearTimeout(storyLikeNoticeTimerRef.current);
  }, []);
  const newestReplyRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const identityThreads = useMemo(
    () => listForumThreadsForIdentity(threads, activeIdentity.id, replies),
    [threads, replies, activeIdentity.id],
  );
  const forumStoryItems = useMemo(() => listForumStoryUiItems(), [forumStoryRevision]);
  const activeThread = identityThreads.find((thread) => thread.id === activeThreadId);
  const activeProfile = profiles.find((profile) => profile.ownerIdentityId === activeIdentity.id) || createForumProfile(activeIdentity, 0);
  const forumProfileAvatarOverrides = useMemo(
    () => profileAvatarUrl ? { [activeIdentity.id]: profileAvatarUrl } : {},
    [activeIdentity.id, profileAvatarUrl],
  );
  const activeThreadAuthor = activeThread ? resolveForumPublicAuthor(activeThread, profiles, forumProfileAvatarOverrides) : undefined;
  const forumIdentity = useMemo(() => ({ ...activeIdentity, name: activeProfile.displayName, avatar: profileAvatarUrl || activeProfile.avatar || activeIdentity.avatar }), [activeIdentity, activeProfile.avatar, activeProfile.displayName, profileAvatarUrl]);
  const activeReplies = useMemo(
    () => activeThread ? listForumRepliesForThread(replies, activeThread) : [],
    [replies, activeThread],
  );
  const visibleThreads = identityThreads.slice(0, visibleThreadCount);
  const visibleReplies = activeReplies.slice(0, visibleReplyCount);
  const shareTargets = useMemo(
    () => listForumShareTargets(relationships || [], characters || [], activeIdentity.id),
    [relationships, characters, activeIdentity.id],
  );
  const selectedShareTarget = shareTargets.find((target) => target.relationship.id === selectedShareRelationId);
  const communityNpcs = useMemo(
    () => listForumCommunityNpcsForIdentity(activeIdentity.id),
    [activeIdentity.id, communityNpcRevision],
  );

  useForumActivityEngine({
    ownerIdentityId: activeIdentity.id,
    relationships,
    characters,
    messages,
    memories,
    worldBookEntries,
    settings,
  });
  useForumStoryScheduler({
    settings,
    onChanged: () => setForumStoryRevision((revision) => revision + 1),
  });

  useEffect(() => {
    loadForumDataSafely({
      validRelationIds: new Set(relationships.map((relationship) => relationship.id)),
      protectedNames: forumProtectedNames,
    });
  }, [forumProtectedNames, relationships]);

  useEffect(() => {
    if (!profiles.some((profile) => profile.ownerIdentityId === activeIdentity.id)) {
      commitForumMutation({ profiles: [...profiles, createForumProfile(activeIdentity)] });
    }
  }, [activeIdentity, profiles]);

  useEffect(() => {
    setRootTab("home"); setSecondaryPage(null); setActiveThreadId(null); setActiveStoryId(null); setReadonlySnapshot(null);
    setProfileName(activeProfile.displayName); setProfileBio(activeProfile.bio || "");
  }, [activeIdentity.id]);

  useEffect(() => { setVisibleThreadCount(FORUM_HOME_PAGE_SIZE); }, [activeIdentity.id]);
  useEffect(() => { setVisibleReplyCount(FORUM_REPLY_PAGE_SIZE); }, [activeThreadId]);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (!activeProfile.avatarAssetId) { setProfileAvatarUrl(null); return undefined; }
    void imageAssetDb.getImage(activeProfile.avatarAssetId).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob); setProfileAvatarUrl(objectUrl);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activeProfile.avatarAssetId]);

  useEffect(() => subscribeForumMutation((event) => {
    if (event.ownerIdentityId !== activeIdentity.id || event.type !== "reply-created" || !event.replyId) return;
    const snapshot = getForumSnapshotForIdentity(activeIdentity.id);
    const reply = snapshot.replies.find((item) => item.id === event.replyId);
    const thread = snapshot.threads.find((item) => item.id === event.threadId);
    if (!reply || !thread) return;
    const targetReply = reply.replyToReplyId ? snapshot.replies.find((item) => item.id === reply.replyToReplyId) : undefined;
    const notification = createForumNotification({ ownerIdentityId: activeIdentity.id, thread, reply, targetReply });
    if (!notification) return;
    const open = activeThreadId === thread.id;
    commitForumMutation({ notifications: appendForumNotification(snapshot.notifications, open ? { ...notification, readAt: Date.now() } : notification) });
  }), [activeIdentity.id, activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) return;
    const unread = notifications.filter((item) => item.threadId === activeThreadId && !item.readAt);
    if (unread.length) commitForumMutation({ notifications: notifications.map((item) => item.threadId === activeThreadId ? { ...item, readAt: Date.now() } : item) });
  }, [activeThreadId, notifications]);

  useEffect(() => {
    setTranslatedContentIds({});
    setTranslationLoadingIds({});
  }, [activeIdentity.id]);

  useEffect(() => {
    if (activeThreadId && !activeThread) {
      setActiveThreadId(null);
      setReplyingTo(null);
      setReplyBody("");
      setReplyAnonymously(false);
    }
  }, [activeIdentity.id, activeThreadId, activeThread]);

  useEffect(() => {
    if (!openForumShareId) return;
    const share = shares.find((item) =>
      item.id === openForumShareId && item.ownerIdentityId === activeIdentity.id);
    if (share) {
      const original = identityThreads.find((thread) => thread.id === share.threadId);
      if (original) {
        setReadonlySnapshot(null);
        setActiveThreadId(original.id);
      } else {
        setActiveThreadId(null);
        setReadonlySnapshot(share.publicSnapshot);
      }
    }
    onOpenForumShareHandled?.();
  }, [openForumShareId, activeIdentity.id, identityThreads, onOpenForumShareHandled, shares]);

  const reportStorageError = () => setError("保存失败，请检查浏览器存储空间后重试。");

  const { saveProfile, uploadProfileAvatar } = useForumProfileActions({
    activeIdentityId: activeIdentity.id,
    activeProfile,
    profiles,
    profileName,
    profileBio,
    onProfileSaved: () => { setSecondaryPage(null); setNotice("资料已保存"); },
    onStorageError: reportStorageError,
    setError,
  });

  const persistTasks = (nextTasks: ForumGenerationTask[]) => {
    if (!commitForumMutation({ generationTasks: nextTasks }).success) {
      reportStorageError();
      return false;
    }
    return true;
  };

  const runRefreshGeneration = async () => {
    if (refreshLockRef.current) return;
    refreshLockRef.current = true;
    setIsRefreshing(true);
    setError("");
    setShowHomeActions(false);
    const now = Date.now();
    const operationId = createId("forum-refresh-operation");
    const taskKey = buildForumGenerationTaskKey({
      ownerIdentityId: activeIdentity.id,
      trigger: "refresh",
      windowKey: operationId,
    });
    const currentTasks = loadForumGenerationTasks(
      new Set(relationships.map((relationship) => relationship.id)),
      now,
    ).value;
    if (currentTasks.some((task) =>
      task.ownerIdentityId === activeIdentity.id && task.status === "running")) {
      setError("已有论坛生成任务正在进行，请稍候。");
      setIsRefreshing(false);
      refreshLockRef.current = false;
      return;
    }
    const begun = beginForumGenerationTask({
      tasks: currentTasks,
      id: createId("forum-generation-task"),
      taskKey,
      ownerIdentityId: activeIdentity.id,
      trigger: "refresh",
      now,
    });
    if (!begun.task || !persistTasks(begun.tasks)) {
      releaseForumGenerationTask(taskKey);
      setIsRefreshing(false);
      refreshLockRef.current = false;
      return;
    }
    try {
      const plannedCount = 1 + Math.floor(Math.random() * 5);
      // Root content is generated only by this explicit refresh action. A
      // refresh may reserve one of its 1–5 slots for a forum-story thread.
      const shouldGenerateStory = plannedCount >= 2 && Math.random() < 0.45;
      const normalThreadCount = plannedCount - (shouldGenerateStory ? 1 : 0);
      const currentThreads = loadForumThreads().value;
      const currentReplies = loadForumReplies().value;
      const generated = normalThreadCount > 0 ? await generateForumThreads({
        ownerIdentityId: activeIdentity.id,
        count: normalThreadCount,
        trigger: "refresh",
        relationships,
        characters,
        messages,
        memories,
        worldBookEntries,
        existingThreads: currentThreads,
        settings,
        now,
        communityNpcs,
      }) : { threads: [], replies: [] };
      let storyCreated = false;
      if (shouldGenerateStory) {
        try {
          await generateForumStoryOnManualRefresh({ settings, now });
          storyCreated = true;
          setForumStoryRevision((revision) => revision + 1);
        } catch (storyError) {
          // A story uses a separate AI request; normal refresh remains usable
          // if that optional story request cannot produce valid content.
          console.warn("Forum story refresh skipped", storyError);
        }
      }
      let storyAdvanced = false;
      if (!shouldGenerateStory && Math.random() < 0.35) {
        try {
          storyAdvanced = Boolean(await advanceForumStoryOnManualRefresh({ settings, now }));
          if (storyAdvanced) setForumStoryRevision((revision) => revision + 1);
        } catch (storyError) {
          console.warn("Forum story continuation skipped", storyError);
        }
      }
      if (generated.threads.length === 0 && !storyCreated && !storyAdvanced) {
        throw new Error("生成内容无效：没有可写入的新帖子。");
      }
      const nextThreads = [...generated.threads, ...currentThreads];
      const nextReplies = [...currentReplies, ...generated.replies];
      if (generated.threads.length > 0 && !commitForumMutation({ threads: nextThreads, replies: nextReplies }).success) throw new Error("storage");
      if (storyCreated) setNotice("已加入一条可继续阅读的论坛体故事。");
      else if (storyAdvanced) setNotice("一条论坛体故事有了新的楼主更新和讨论。");
      persistTasks(finishForumGenerationTask(
        loadForumGenerationTasks(new Set(relationships.map((relationship) => relationship.id))).value,
        begun.task.id,
        "succeeded",
        Date.now(),
      ));
    } catch (generationError) {
      persistTasks(finishForumGenerationTask(
        loadForumGenerationTasks(new Set(relationships.map((relationship) => relationship.id))).value,
        begun.task.id,
        "failed",
        Date.now(),
      ));
      setError(generationError instanceof Error && generationError.message === "storage"
        ? "保存失败，请检查浏览器存储空间后重试。"
        : mapForumGenerationError(generationError));
    } finally {
      releaseForumGenerationTask(taskKey);
      setIsRefreshing(false);
      refreshLockRef.current = false;
    }
  };

  const storyReaderToken = (storyId: string) => `${storyId}:reader:${activeIdentity.id}`;

  const showStoryLikeNotice = () => {
    const message = "点赞过的帖子更大几率收到楼主的更新提醒哦";
    setNotice(message);
    if (storyLikeNoticeTimerRef.current !== null) window.clearTimeout(storyLikeNoticeTimerRef.current);
    storyLikeNoticeTimerRef.current = window.setTimeout(() => {
      setNotice((current) => current === message ? "" : current);
      storyLikeNoticeTimerRef.current = null;
    }, 3_000);
  };

  const likeForumStory = (storyId: string) => {
    const view = getForumStoryUiThread(storyId);
    if (!view) return;
    const readerToken = storyReaderToken(storyId);
    if (view.thread.likedByIdentityIds?.includes(readerToken)) return;
    try {
      ForumStoryEngagementService.addLike({ storyId, threadId: view.thread.id, readerToken, markReaderInterest: true });
      setForumStoryRevision((revision) => revision + 1);
      showStoryLikeNotice();
    } catch (storyError) {
      setError(storyError instanceof Error ? storyError.message : "故事点赞失败，请重试。");
    }
  };

  const { requestForumStoryUpdate } = useForumStoryUpdateAction({
    isStoryUpdating,
    settings,
    setIsStoryUpdating,
    setError,
    setNotice,
    setForumStoryRevision,
  });

  const { submitForumStoryComment, handleForumStoryUtility } = useForumStoryReaderActions({
    settings,
    replyingTo,
    setActiveStoryId,
    setReplyingTo,
    setError,
    setNotice,
    setForumStoryRevision,
  });

  const likeForumStoryReply = (storyId: string, replyId: string) => {
    const view = getForumStoryUiThread(storyId);
    if (!view) return;
    const readerToken = storyReaderToken(storyId);
    const reply = view.replies.find((candidate) => candidate.id === replyId);
    if (reply?.likedByIdentityIds.includes(readerToken)) return;
    try {
      ForumStoryEngagementService.addLike({ storyId, threadId: view.thread.id, replyId, readerToken });
      setForumStoryRevision((revision) => revision + 1);
    } catch (storyError) {
      setError(storyError instanceof Error ? storyError.message : "故事评论点赞失败");
    }
  };


  const generateInitialReplies = async (thread: ForumThread) => {
    setWaitingReplyThreadIds((ids) => [...new Set([...ids, thread.id])]);
    try {
      await scheduleInitialForumReplies({
        ownerIdentityId: activeIdentity.id,
        relationships,
        characters,
        messages,
        memories,
        worldBookEntries,
        settings,
      }, thread.id);
    } catch (generationError) {
      setError(mapForumGenerationError(generationError));
    } finally {
      setWaitingReplyThreadIds((ids) => ids.filter((idValue) => idValue !== thread.id));
    }
    return;
    const now = Date.now();
    const taskKey = buildForumGenerationTaskKey({
      ownerIdentityId: thread.ownerIdentityId,
      trigger: "initial-replies",
      threadId: thread.id,
    });
    const currentTasks = loadForumGenerationTasks(
      new Set(relationships.map((relationship) => relationship.id)),
      now,
    ).value;
    const begun = beginForumGenerationTask({
      tasks: currentTasks,
      id: createId("forum-generation-task"),
      taskKey,
      ownerIdentityId: thread.ownerIdentityId,
      threadId: thread.id,
      trigger: "initial-replies",
      now,
    });
    if (!begun.task || !persistTasks(begun.tasks)) {
      releaseForumGenerationTask(taskKey);
      return;
    }
    setWaitingReplyThreadIds((ids) => [...new Set([...ids, thread.id])]);
    try {
      const currentReplies = loadForumReplies().value;
      const generatedReplies = await generateInitialRepliesForUserThread({
        thread,
        existingReplies: currentReplies,
        relationships,
        characters,
        messages,
        memories,
        worldBookEntries,
        settings,
        now,
      });
      const currentThreads = loadForumThreads().value;
      const threadStillExists = currentThreads.some((item) =>
        item.id === thread.id && item.ownerIdentityId === thread.ownerIdentityId);
      if (threadStillExists && generatedReplies.length > 0) {
        const nextReplies = [...currentReplies, ...generatedReplies];
        const nextThreads = currentThreads.map((item) =>
          item.id === thread.id
            ? {
                ...item,
                replyCount: item.replyCount + generatedReplies.length,
                updatedAt: Math.max(item.updatedAt, ...generatedReplies.map((reply) => reply.updatedAt)),
                lastActivityAt: Math.max(item.lastActivityAt || item.createdAt, ...generatedReplies.map((reply) => reply.occurredAt)),
              }
            : item);
        if (!commitForumMutation({ threads: nextThreads, replies: nextReplies }).success) throw new Error("storage");
      }
      persistTasks(finishForumGenerationTask(
        loadForumGenerationTasks(new Set(relationships.map((relationship) => relationship.id))).value,
        begun.task.id,
        "succeeded",
        Date.now(),
      ));
    } catch (generationError) {
      persistTasks(finishForumGenerationTask(
        loadForumGenerationTasks(new Set(relationships.map((relationship) => relationship.id))).value,
        begun.task.id,
        "failed",
        Date.now(),
      ));
      if (generationError instanceof Error && generationError.message !== "storage") {
        setError(mapForumGenerationError(generationError));
      }
    } finally {
      releaseForumGenerationTask(taskKey);
      setWaitingReplyThreadIds((ids) => ids.filter((idValue) => idValue !== thread.id));
    }
  };

  const runThreadActivity = async (
    trigger: "like-engagement" | "manual-thread-refresh",
    thread: ForumThread,
  ) => {
    if (trigger === "manual-thread-refresh" && threadRefreshLockRef.current) return;
    if (trigger === "manual-thread-refresh") {
      threadRefreshLockRef.current = true;
      setIsThreadRefreshing(true);
      setError("");
      setNotice("");
      try {
        const result = await forceForumThreadActivity({
          ownerIdentityId: activeIdentity.id,
          relationships,
          characters,
          messages,
          memories,
          worldBookEntries,
          settings,
        }, thread.id);
        if (result.outcome === "no-update" || result.released.length === 0) {
          setNotice("暂时没有新的回复");
        } else {
          setNotice("发现了新的回复");
          requestAnimationFrame(() => {
            document.getElementById(`forum-reply-${result.released[0].id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }
      } catch (activityError) {
        setError(mapForumGenerationError(activityError));
      } finally {
        setIsThreadRefreshing(false);
        threadRefreshLockRef.current = false;
      }
      return;
    }
    const now = Date.now();
    const validRelationIds = new Set(relationships.map((relationship) => relationship.id));
    const currentTasks = loadForumGenerationTasks(validRelationIds, now).value;
    if (trigger === "like-engagement"
      && hasEvaluatedLikeEngagement(currentTasks, activeIdentity.id, thread.id)) return;
    setError("");
    setNotice("");
    const taskKey = buildForumGenerationTaskKey({
      ownerIdentityId: activeIdentity.id,
      threadId: thread.id,
      trigger,
      windowKey: "once",
    });
    const begun = beginForumGenerationTask({
      tasks: currentTasks,
      id: createId("forum-generation-task"),
      taskKey,
      ownerIdentityId: activeIdentity.id,
      threadId: thread.id,
      trigger,
      now,
    });
    if (!begun.task || !persistTasks(begun.tasks)) {
      releaseForumGenerationTask(taskKey);
      return;
    }
    try {
      const result = await generateThreadActivity({
        trigger,
        ownerIdentityId: activeIdentity.id,
        thread,
        existingReplies: loadForumReplies().value,
        relationships,
        characters,
        messages,
        memories,
        worldBookEntries,
        settings,
        now,
      });
      if (result.outcome === "no-update" || result.replies.length === 0) {
      } else {
        const currentThreads = loadForumThreads(validRelationIds).value;
        const currentReplies = loadForumReplies().value;
        if (!currentThreads.some((item) =>
          item.id === thread.id && item.ownerIdentityId === activeIdentity.id)) {
          throw new Error("生成内容无效：原帖已删除。");
        }
        const nextReplies = [...currentReplies, ...result.replies];
        const nextThreads = currentThreads.map((item) =>
          item.id === thread.id
            ? {
                ...item,
                replyCount: item.replyCount + result.replies.length,
                updatedAt: Math.max(item.updatedAt, ...result.replies.map((reply) => reply.updatedAt)),
                lastActivityAt: Math.max(item.lastActivityAt || item.createdAt, ...result.replies.map((reply) => reply.occurredAt)),
              }
            : item);
        if (!commitForumMutation({ threads: nextThreads, replies: nextReplies }).success) throw new Error("storage");
        setNotice(result.outcome === "author-update" ? "楼主发布了新动态" : "发现了新的回复");
        requestAnimationFrame(() => {
          document.getElementById(`forum-reply-${result.replies[0].id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      const latestTasks = loadForumGenerationTasks(validRelationIds).value;
      persistTasks(finishForumGenerationTask(latestTasks, begun.task.id, "succeeded", Date.now()));
    } catch (activityError) {
      const latestTasks = loadForumGenerationTasks(validRelationIds).value;
      persistTasks(finishForumGenerationTask(latestTasks, begun.task.id, "failed", Date.now()));
      setError(activityError instanceof Error && activityError.message === "storage"
        ? "保存失败，请检查浏览器存储空间后重试。"
        : mapForumGenerationError(activityError));
    } finally {
      releaseForumGenerationTask(taskKey);
    }
  };

  const handleBack = () => {
    if (activeStoryId) { setActiveStoryId(null); setError(""); setNotice(""); return; }
    if (activeThreadId || readonlySnapshot) {
      setActiveThreadId(null);
      setReadonlySnapshot(null);
      setReplyingTo(null);
      setReplyBody("");
      setReplyAnonymously(false);
      setError("");
      setNotice("");
      return;
    }
    if (secondaryPage) { setSecondaryPage(null); return; }
    if (rootTab === "mine") { setRootTab("home"); return; }
    onClose();
  };

  const openThread = (thread: ForumThread) => {
    setActiveThreadId(thread.id); setReplyingTo(null); setReplyBody(""); setReplyAnonymously(false); setError(""); setNotice("");
    commitForumMutation({ visitHistory: recordForumVisit(visitHistory, activeIdentity.id, thread, replies) });
    setVisibleReplyCount(FORUM_REPLY_PAGE_SIZE); requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  };

  const resetShareSheet = () => {
    setShowShareSheet(false);
    setSelectedShareRelationId(null);
  };

  const handleShareThread = () => {
    if (!activeThread || !selectedShareTarget || shareLockRef.current) return;
    if (selectedShareTarget.relationship.userIdentityId !== activeIdentity.id) {
      setError("该好友不属于当前身份，无法转发。");
      return;
    }
    shareLockRef.current = true;
    setIsSharing(true);
    setError("");
    const now = Date.now();
    const operation = createForumShareOperation({
      shareId: createId("forum-share"),
      messageId: createId("forum-share-message"),
      ownerIdentityId: activeIdentity.id,
      thread: activeThread,
      replies,
      targetRelationship: selectedShareTarget.relationship,
      characterId: selectedShareTarget.character.id,
      now,
    });
    const existingShares = shares;
    const nextShares = appendForumShareOnce(existingShares, operation.share);
    if (nextShares.length === existingShares.length || !commitForumMutation({ shares: nextShares }).success) {
      reportStorageError();
      setIsSharing(false);
      shareLockRef.current = false;
      return;
    }
    onSendMessage(operation.message);
    resetShareSheet();
    setIsSharing(false);
    shareLockRef.current = false;
    onOpenChat(selectedShareTarget.character.id, selectedShareTarget.relationship.id);
  };

  const resetComposer = () => {
    setPostTitle("");
    setPostBody("");
    setPostAnonymously(false);
    setShowComposer(false);
  };

  const {
    resetCommunityNpcComposer,
    saveCommunityNpc,
    updateCommunityNpc,
    toggleCommunityNpcExport,
    exportCommunityNpcs,
    importCommunityNpcs,
  } = useForumCommunityNpcActions({
    activeIdentityId: activeIdentity.id,
    communityNpcs,
    selectedCommunityNpcIds,
    communityNpcName,
    communityNpcAvatar,
    communityNpcPersona,
    setCommunityNpcName,
    setCommunityNpcAvatar,
    setCommunityNpcPersona,
    setShowCommunityNpcComposer,
    setSelectedCommunityNpcIds,
    setCommunityNpcRevision,
    setShowCommunityNpcExport,
    setError,
    setNotice,
  });

  const handleCreateThread = () => {
    const title = postTitle.trim();
    const body = postBody.trim();
    if (!title || !body || postLockRef.current) return;
    postLockRef.current = true;
    setIsPosting(true);
    setError("");
    const thread = createForumThread({
      id: createId("forum-thread"),
      identity: forumIdentity,
      title,
      body,
      anonymous: postAnonymously,
      now: Date.now(),
    });
    const nextThreads = [thread, ...threads];
    if (commitForumMutation({ threads: nextThreads }).success) {
      resetComposer();
      void generateInitialReplies(thread);
    } else {
      reportStorageError();
    }
    setIsPosting(false);
    postLockRef.current = false;
  };

  const handleToggleThreadLike = (threadId: string) => {
    const thread = threads.find((item) =>
      item.id === threadId && item.ownerIdentityId === activeIdentity.id);
    const wasLiked = Boolean(thread?.likedByIdentityIds.includes(activeIdentity.id));
    const next = toggleForumThreadLike(threads, threadId, activeIdentity.id);
    const changed = next.find((item) => item.id === threadId);
    if (thread && changed && commitForumMutation({ threads: next, likeHistory: updateForumLikeHistory(likeHistory, { ownerIdentityId: activeIdentity.id, thread, replies, liked: changed.likedByIdentityIds.includes(activeIdentity.id) }) }).success) {
      if (thread && !wasLiked) void runThreadActivity("like-engagement", thread);
    } else reportStorageError();
  };

  const handleToggleReplyLike = (replyId: string) => {
    const reply = replies.find((item) => item.id === replyId && item.ownerIdentityId === activeIdentity.id);
    const thread = reply ? threads.find((item) => item.id === reply.threadId) : undefined;
    const next = toggleForumReplyLike(replies, replyId, activeIdentity.id);
    const changed = next.find((item) => item.id === replyId);
    if (!reply || !thread || !changed || !commitForumMutation({ replies: next, likeHistory: updateForumLikeHistory(likeHistory, { ownerIdentityId: activeIdentity.id, thread, replies, reply, liked: changed.likedByIdentityIds.includes(activeIdentity.id) }) }).success) reportStorageError();
  };

  const handleSubmitReply = () => {
    const body = replyBody.trim();
    if (!activeThread || !body || replyLockRef.current) return;
    replyLockRef.current = true;
    setIsReplying(true);
    setError("");
    const reply = createForumReply({
      id: createId("forum-reply"),
      thread: activeThread,
      existingReplies: replies,
      identity: forumIdentity,
      body,
      anonymous: replyAnonymously,
      now: Date.now(),
      replyTo: replyingTo || undefined,
    });
    const next = appendForumReply(threads, replies, reply);
    const result = commitForumMutation({ threads: next.threads, replies: next.replies });
    if (result.success) {
      setReplyBody("");
      setReplyingTo(null);
      setReplyAnonymously(false);
      void scheduleForumUserInteraction({
        ownerIdentityId: activeIdentity.id,
        relationships,
        characters,
        messages,
        memories,
        worldBookEntries,
        settings,
      }, activeThread.id, reply.floor).catch(() => undefined);
      requestAnimationFrame(() => {
        newestReplyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    } else {
      reportStorageError();
    }
    setIsReplying(false);
    replyLockRef.current = false;
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "thread") {
      const next = deleteForumThread(threads, replies, deleteTarget.threadId, activeIdentity.id);
      const nextTasks = removeForumGenerationTasksByThread(
        generationTasks,
        deleteTarget.threadId,
      );
      const result = commitForumMutation({
        threads: next.threads,
        replies: next.replies,
        generationTasks: nextTasks,
        actorStates: loadForumActorStates().value.filter((state) => state.threadId !== deleteTarget.threadId),
        activityTasks: loadForumActivityTasks().value.filter((task) => task.threadId !== deleteTarget.threadId),
        visitHistory: visitHistory.filter((item) => item.threadId !== deleteTarget.threadId),
        likeHistory: likeHistory.filter((item) => item.threadId !== deleteTarget.threadId),
        notifications: notifications.filter((item) => item.threadId !== deleteTarget.threadId),
      }, [], { replaceReplies: true });
      if (result.success) {
        deleteForumTranslationsForThread(
          activeIdentity.id,
          deleteTarget.threadId,
          replies.filter((reply) => reply.threadId === deleteTarget.threadId).map((reply) => reply.id),
        );
        setActiveThreadId(null);
        setReplyingTo(null);
        setReplyBody("");
        setReplyAnonymously(false);
        setNotice("");
      } else {
        reportStorageError();
      }
    } else {
      const nextReplies = tombstoneForumReply(replies, deleteTarget.replyId, activeIdentity.id);
      if (commitForumMutation({ replies: nextReplies, likeHistory: likeHistory.filter((item) => item.replyId !== deleteTarget.replyId), notifications: notifications.filter((item) => item.replyId !== deleteTarget.replyId && item.targetReplyId !== deleteTarget.replyId) }).success) {
        deleteForumTranslationForReply(activeIdentity.id, deleteTarget.replyId);
        if (replyingTo?.id === deleteTarget.replyId) setReplyingTo(null);
      } else {
        reportStorageError();
      }
    }
    setDeleteTarget(null);
  };

  const getTranslationKey = (contentType: "thread" | "reply", contentId: string) =>
    `${contentType}:${contentId}`;

  const getCachedTranslation = (input: {
    contentType: "thread" | "reply";
    contentId: string;
    title?: string;
    body: string;
  }) => getForumTranslation({
    ownerIdentityId: activeIdentity.id,
    contentType: input.contentType,
    contentId: input.contentId,
    sourceContentHash: createForumTranslationHash(input.contentType === "thread"
      ? `${input.title || ""}\n${input.body}`
      : input.body),
    targetLanguage: getForumTranslationTargetLanguage(settings),
  });

  const toggleTranslation = async (input: {
    contentType: "thread" | "reply";
    contentId: string;
    title?: string;
    body: string;
  }) => {
    if (!input.body.trim()) return;
    const key = getTranslationKey(input.contentType, input.contentId);
    if (translatedContentIds[key]) {
      setTranslatedContentIds((current) => ({ ...current, [key]: false }));
      return;
    }
    const cached = getCachedTranslation(input);
    if (cached) {
      touchForumTranslation(cached);
      setTranslatedContentIds((current) => ({ ...current, [key]: true }));
      return;
    }
    if (translationLoadingIds[key]) return;
    setTranslationLoadingIds((current) => ({ ...current, [key]: true }));
    try {
      await translateForumContent({
        ownerIdentityId: activeIdentity.id,
        contentType: input.contentType,
        contentId: input.contentId,
        ...(input.title ? { title: input.title } : {}),
        body: input.body,
        targetLanguage: getForumTranslationTargetLanguage(settings),
        settings,
      });
      setTranslatedContentIds((current) => ({ ...current, [key]: true }));
    } catch (translationError) {
      const message = translationError instanceof Error ? translationError.message : "翻译失败，请检查 API 配置后重试。";
      setError(message || "翻译失败，请检查 API 配置后重试。");
    } finally {
      setTranslationLoadingIds((current) => ({ ...current, [key]: false }));
    }
  };

  return (
    <div data-theme-page="forum" className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-700 active:bg-slate-100"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-bold">
          {activeStoryId ? "帖子详情" : activeThread || readonlySnapshot ? "帖子详情" : secondaryPage === "profile" ? "编辑资料" : secondaryPage === "history" ? "浏览历史" : secondaryPage === "likes" ? "我的点赞" : secondaryPage === "community-npcs" ? "NPC角色" : rootTab === "mine" ? "我的" : "论坛"}
        </h1>
        {!activeThread && !activeStoryId && !readonlySnapshot && !secondaryPage && rootTab === "home" ? (
          <button
            ref={homeMenuAnchorRef}
            type="button"
            onClick={() => setShowHomeActions(true)}
            disabled={isRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-950 text-white active:scale-95"
            aria-label="论坛操作"
          >
            {isRefreshing
              ? <LoaderCircle className="h-4 w-4 animate-spin" />
              : <Plus className="h-4 w-4" />}
          </button>
        ) : secondaryPage === "community-npcs" ? (
          <button
            ref={communityNpcMenuAnchorRef}
            type="button"
            onClick={() => setShowCommunityNpcMenu(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-950 text-white active:scale-95"
            aria-label="NPC角色操作"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : activeThread ? (
          <button
            type="button"
            onClick={() => void runThreadActivity("manual-thread-refresh", activeThread)}
            disabled={isThreadRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-600 active:bg-slate-100 disabled:text-slate-300"
            aria-label="刷新帖子动态"
          >
            <RefreshCw className={`h-4 w-4 ${isThreadRefreshing ? "animate-spin" : ""}`} />
          </button>
        ) : activeStoryId ? (
          <button
            type="button"
            onClick={() => void requestForumStoryUpdate(activeStoryId)}
            disabled={isStoryUpdating}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-600 active:bg-slate-100 disabled:text-slate-300"
            aria-label="刷新帖子动态"
          >
            <RefreshCw className={`h-4 w-4 ${isStoryUpdating ? "animate-spin" : ""}`} />
          </button>
        ) : (
          <span className="h-9 w-9" aria-hidden="true" />
        )}
      </header>

      <PopoverMenu
        open={showHomeActions}
        onClose={() => setShowHomeActions(false)}
        anchorRef={homeMenuAnchorRef}
        placement="bottom-end"
        ariaLabel="论坛操作"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => void runRefreshGeneration()}
          disabled={isRefreshing}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:text-[var(--button-disabled-text)] disabled:opacity-100"
        >
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>{isRefreshing ? "正在生成…" : "刷新论坛"}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowHomeActions(false);
            setShowComposer(true);
          }}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>我要发帖</span>
        </button>
      </PopoverMenu>

      <PopoverMenu
        open={showCommunityNpcMenu}
        onClose={() => setShowCommunityNpcMenu(false)}
        anchorRef={communityNpcMenuAnchorRef}
        placement="bottom-end"
        ariaLabel="NPC角色操作"
      >
        <button type="button" role="menuitem" onClick={() => { setShowCommunityNpcMenu(false); setShowCommunityNpcComposer(true); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" />新建角色卡</button>
        <button type="button" role="menuitem" onClick={() => { setShowCommunityNpcMenu(false); communityNpcImportRef.current?.click(); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" />导入角色卡</button>
        <button type="button" role="menuitem" disabled={communityNpcs.length === 0} onClick={() => { setShowCommunityNpcMenu(false); setSelectedCommunityNpcIds(communityNpcs.map((npc) => npc.id)); setShowCommunityNpcExport(true); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Download className="h-3.5 w-3.5" />导出角色卡</button>
      </PopoverMenu>
      <input ref={communityNpcImportRef} type="file" accept="application/json,.json" multiple className="hidden" onChange={(event) => { void importCommunityNpcs(event.target.files); event.target.value = ""; }} />

      {error && (
        <div role="alert" className="mx-4 mt-3 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mx-4 mt-3 shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
          {notice}
        </div>
      )}

      {readonlySnapshot ? (
        <ForumSnapshotDetail snapshot={readonlySnapshot} />
      ) : activeStoryId ? (
        <ForumStoryThreadView
          storyId={activeStoryId}
          readerToken={storyReaderToken(activeStoryId)}
          onLike={likeForumStory}
          onLikeReply={likeForumStoryReply}
          onUtilityAction={handleForumStoryUtility}
          onSubmitComment={submitForumStoryComment}
          submitting={isStoryUpdating}
        />
      ) : !activeThread && secondaryPage ? (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-4">
          {secondaryPage === "profile" && <section className="rounded-2xl bg-white p-4 shadow-sm">
            <label className="mx-auto flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100">
              {profileAvatarUrl || activeProfile.avatar ? <img src={profileAvatarUrl || activeProfile.avatar} alt="" className="h-full w-full object-cover" /> : <User className="h-8 w-8 text-slate-400" />}
              <input className="hidden" type="file" accept="image/*" onChange={(event) => void uploadProfileAvatar(event.target.files?.[0])} />
            </label>
            <p className="mt-2 text-center text-xs text-slate-400">点击更换头像</p>
            <label className="mt-5 block text-xs font-semibold text-slate-600">论坛昵称<input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label>
            <label className="mt-4 block text-xs font-semibold text-slate-600">简介<textarea value={profileBio} onChange={(event) => setProfileBio(event.target.value)} className="mt-2 min-h-24 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400" /></label>
            <Button className="mt-5 w-full" onClick={saveProfile}>保存资料</Button>
          </section>}
          {secondaryPage === "history" && <><HistoryList title="浏览历史" empty="暂无浏览记录" items={visitHistory} onOpen={(item) => { const thread = threads.find((value) => value.id === item.threadId); if (thread) openThread(thread); else setReadonlySnapshot(item.publicSnapshot); }} /><button type="button" onClick={() => { if (window.confirm("清空全部浏览历史？")) commitForumMutation({ visitHistory: [] }); }} className="mt-4 w-full text-xs text-rose-500">清空浏览历史</button></>}
          {secondaryPage === "likes" && <><HistoryList title="我的点赞" empty="暂无点赞记录" items={likeHistory} onOpen={(item) => { const thread = threads.find((value) => value.id === item.threadId); if (thread) openThread(thread); else setReadonlySnapshot(item.publicSnapshot.thread); }} /><button type="button" onClick={() => { if (window.confirm("清空全部点赞记录？")) commitForumMutation({ likeHistory: [] }); }} className="mt-4 w-full text-xs text-rose-500">清空点赞记录</button></>}
          {secondaryPage === "community-npcs" && <>
            {communityNpcs.length === 0 ? (
              <section className="rounded-2xl bg-white px-5 py-10 text-center shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><User className="h-5 w-5 text-slate-400" /></div>
                <p className="mt-3 text-sm font-semibold text-slate-700">还没有 NPC 角色</p>
                <p className="mt-1 text-xs text-slate-400">可通过右上角 + 新建或导入角色卡。</p>
                <Button className="mt-5" size="sm" onClick={() => setShowCommunityNpcComposer(true)}>新建角色卡</Button>
              </section>
            ) : (
              <section className="grid gap-3">
                {communityNpcs.map((npc) => (
                  <article key={npc.id} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      {npc.avatar ? <img src={npc.avatar} alt="" className="h-12 w-12 rounded-full bg-slate-100 object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100"><User className="h-5 w-5 text-slate-400" /></span>}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><h3 className="truncate text-sm font-bold text-slate-800">{npc.displayName}</h3><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${npc.enabled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>{npc.enabled ? "活跃" : "停用"}</span></div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{npc.personaSummary}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-4 border-t border-slate-100 pt-3 text-xs font-medium">
                      <button type="button" onClick={() => updateCommunityNpc(npc, { enabled: !npc.enabled })} className={npc.enabled ? "text-slate-600" : "text-emerald-600"}>{npc.enabled ? "设为停用" : "恢复活跃"}</button>
                      <button type="button" onClick={() => { if (window.confirm(`删除论坛 NPC「${npc.displayName}」？`)) { removeForumCommunityNpc(activeIdentity.id, npc.id); setCommunityNpcRevision((value) => value + 1); } }} className="text-rose-500">删除</button>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>}
        </main>
      ) : !activeThread && rootTab === "mine" ? (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setSecondaryPage("profile")} className="flex w-full items-center gap-3 text-left">
              {profileAvatarUrl || activeProfile.avatar ? <img src={profileAvatarUrl || activeProfile.avatar} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><User className="h-6 w-6 text-slate-400" /></span>}
              <span className="min-w-0 flex-1"><strong className="block truncate text-base">{activeProfile.displayName}</strong><small className="mt-1 block truncate text-slate-400">{activeProfile.bio || "点击完善论坛资料"}</small></span><Pencil className="h-4 w-4 text-slate-400" />
            </button>
          </section>
          <section className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <button type="button" onClick={() => setSecondaryPage("community-npcs")} className="flex h-[52px] w-full items-center px-4 text-left text-base text-slate-900 active:bg-slate-50">
              <span className="flex-1">NPC角色</span>
              <span className="mr-2 text-xs text-slate-400">{communityNpcs.length}</span><span className="text-xl leading-none text-slate-300">›</span>
            </button>
            <button type="button" onClick={() => setSecondaryPage("history")} className="flex h-[52px] w-full items-center border-t border-slate-100 px-4 text-left text-base text-slate-900 active:bg-slate-50">
              <span className="flex-1">浏览历史</span><span className="text-xl leading-none text-slate-300">›</span>
            </button>
            <button type="button" onClick={() => setSecondaryPage("likes")} className="flex h-[52px] w-full items-center border-t border-slate-100 px-4 text-left text-base text-slate-900 active:bg-slate-50">
              <span className="flex-1">我的点赞</span><span className="text-xl leading-none text-slate-300">›</span>
            </button>
          </section>
        </main>
      ) : !activeThread ? (
        <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24">
          {identityThreads.length === 0 && forumStoryItems.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-8 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                <MessageCircle className="h-7 w-7 text-slate-300" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-700">还没有帖子</p>
              <p className="mt-1 text-xs text-slate-400">发布第一条帖子吧</p>
              <Button className="mt-5" size="sm" onClick={() => setShowComposer(true)}>
                发布帖子
              </Button>
            </div>
          ) : identityThreads.length > 0 || forumStoryItems.length > 0 ? (
            <div className="forum-thread-feed mt-3 overflow-hidden border-y border-slate-100 bg-white">
              <ForumStoryList
                items={forumStoryItems}
                onOpen={(storyId) => { setActiveStoryId(storyId); setError(""); setNotice(""); }}
              />
              {visibleThreads.map((thread) => {
                const metrics = selectForumThreadMetrics(
                  thread,
                  replies,
                  visitHistory.find((visit) => visit.threadId === thread.id)?.lastVisitedAt,
                );
                return (
                  <div key={thread.id}>
                    <ForumThreadCard
                      thread={thread}
                      author={resolveForumPublicAuthor(thread, profiles, forumProfileAvatarOverrides)}
                      metrics={metrics}
                      formattedTime={formatForumTime(metrics.updatedAt)}
                      liked={thread.likedByIdentityIds.includes(activeIdentity.id)}
                      onOpen={() => openThread(thread)}
                      onToggleLike={() => handleToggleThreadLike(thread.id)}
                    />
                  {waitingReplyThreadIds.includes(thread.id) && (
                    <div className="flex items-center gap-1.5 border-t border-slate-50 px-4 py-2 text-[10px] text-slate-400">
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      正在等待回复…
                    </div>
                  )}
                  </div>
                );
              })}
              {identityThreads.length > visibleThreads.length && <button type="button" onClick={() => setVisibleThreadCount((count) => count + FORUM_HOME_PAGE_SIZE)} className="w-full border-t border-slate-100 py-4 text-xs font-medium text-slate-500">加载更多</button>}
            </div>
          ) : null}
        </main>
      ) : (
        <>
          <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-3">
            <article className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <ForumAvatar author={activeThreadAuthor || activeThread.publicAuthor} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-slate-800">
                      {(activeThreadAuthor || activeThread.publicAuthor).displayName}
                    </span>
                    <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      楼主
                    </span>
                    {(activeThreadAuthor || activeThread.publicAuthor).isAnonymous && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">匿名</span>
                    )}
                  </div>
                  <time className="mt-0.5 block text-[10px] text-slate-400">
                    {formatForumTime(activeThread.occurredAt)}
                  </time>
                </div>
                <span className="text-[10px] font-medium text-slate-300">1 楼</span>
              </div>
              {(() => {
                const translationKey = getTranslationKey("thread", activeThread.id);
                const translated = translatedContentIds[translationKey]
                  ? getCachedTranslation({ contentType: "thread", contentId: activeThread.id, title: activeThread.title, body: activeThread.body })
                  : undefined;
                return <>
              <h2 className="mt-4 break-words text-[18px] font-bold leading-7 text-slate-950">
                {translated?.translatedTitle || activeThread.title}
              </h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">
                {translated?.translatedBody || activeThread.body}
              </p>
                </>;
              })()}
                <div className="mt-4 grid grid-cols-4 items-center gap-1 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => handleToggleThreadLike(activeThread.id)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1 text-[11px] font-medium ${
                    activeThread.likedByIdentityIds.includes(activeIdentity.id) ? "text-rose-500" : "text-slate-500"
                  }`}
                >
                  <ThumbsUp className={`h-4 w-4 ${activeThread.likedByIdentityIds.includes(activeIdentity.id) ? "fill-current" : ""}`} />
                  {getForumLikeCount(activeThread)}
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById("forum-reply-input")?.focus()}
                  className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] text-slate-500"
                >
                  <MessageCircle className="h-4 w-4" />
                  {selectForumThreadMetrics(activeThread, replies).effectiveReplyCount}
                </button>
                <button
                  type="button"
                  onClick={() => setShowShareSheet(true)}
                  className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] font-medium text-slate-500"
                >
                  <Share2 className="h-4 w-4" />
                  转发
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ kind: "thread", threadId: activeThread.id })}
                  className="inline-flex min-w-0 items-center justify-center gap-1 text-[11px] font-medium text-rose-400 active:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            </article>

            <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-[13px] font-bold text-slate-800">全部回复</h3>
                {waitingReplyThreadIds.includes(activeThread.id) && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-400">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    正在等待回复…
                  </p>
                )}
              </div>
              {activeReplies.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-slate-400">还没有回复，来说点什么吧</p>
              ) : (
                visibleReplies.map((reply, index) => (
                  <div
                    key={reply.id}
                    id={`forum-reply-${reply.id}`}
                    ref={index === visibleReplies.length - 1 ? newestReplyRef : undefined}
                    className="border-b border-slate-100 px-4 py-4 last:border-b-0"
                  >
                    <div className="flex items-start gap-2.5">
                      <ForumAvatar author={resolveForumPublicAuthor(reply, profiles, forumProfileAvatarOverrides)} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-[12px] font-semibold ${reply.isDeleted ? "text-slate-400" : "text-slate-700"}`}>
                            {reply.isDeleted ? "已删除用户" : resolveForumPublicAuthor(reply, profiles, forumProfileAvatarOverrides).displayName}
                          </span>
                          {resolveForumPublicAuthor(reply, profiles, forumProfileAvatarOverrides).isAnonymous && !reply.isDeleted && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">匿名</span>
                          )}
                          {!reply.isDeleted && reply.kind === "author-update" && (
                            <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                              楼主更新
                            </span>
                          )}
                          {!reply.isDeleted
                            && reply.kind !== "author-update"
                            && (activeThread.source === "user" || activeThread.source === "user-anonymous")
                            && (reply.source === "user" || reply.source === "user-anonymous") && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                                楼主
                              </span>
                            )}
                        </div>
                        <time className="text-[9px] text-slate-400">{formatForumTime(reply.occurredAt)}</time>
                      </div>
                      <span className="text-[10px] font-medium text-slate-300">{reply.floor} 楼</span>
                    </div>

                    {reply.replyToFloor && (
                      <div className="ml-10 mt-2 rounded-lg border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
                        <div className="mb-0.5 font-medium text-slate-600">
                          回复 {reply.replyToFloor} 楼 · {reply.replyToAuthorName}
                        </div>
                        <p className="break-words">{truncateQuote(reply.quotedText || "该回复已删除")}</p>
                      </div>
                    )}

                    {(() => {
                      const translationKey = getTranslationKey("reply", reply.id);
                      const translated = !reply.isDeleted && translatedContentIds[translationKey]
                        ? getCachedTranslation({ contentType: "reply", contentId: reply.id, body: reply.body })
                        : undefined;
                      return <p className={`ml-10 mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 ${
                        reply.isDeleted ? "italic text-slate-400" : "text-slate-700"
                      }`}>
                        {reply.isDeleted ? "该回复已删除" : translated?.translatedBody || reply.body}
                      </p>;
                    })()}

                    {!reply.isDeleted && (
                      <div className="ml-10 mt-3 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => handleToggleReplyLike(reply.id)}
                          className={`inline-flex items-center gap-1 text-[11px] ${
                            reply.likedByIdentityIds.includes(activeIdentity.id) ? "text-rose-500" : "text-slate-400"
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${reply.likedByIdentityIds.includes(activeIdentity.id) ? "fill-current" : ""}`} />
                          {getForumLikeCount(reply)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ kind: "reply", replyId: reply.id })}
                          className="text-[11px] text-slate-300 active:text-red-500"
                        >
                          删除
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingTo(reply);
                            requestAnimationFrame(() => document.getElementById("forum-reply-input")?.focus());
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-slate-400"
                        >
                          <Reply className="h-3.5 w-3.5" />
                          回复此楼
                        </button>
                        {(() => {
                          const key = getTranslationKey("reply", reply.id);
                          return <button
                            type="button"
                            disabled={translationLoadingIds[key]}
                            onClick={() => void toggleTranslation({
                              contentType: "reply",
                              contentId: reply.id,
                              body: reply.body,
                            })}
                            className="text-[11px] text-slate-400 disabled:text-slate-300"
                          >
                            {translationLoadingIds[key] ? "翻译中…" : translatedContentIds[key] ? "查看原文" : "翻译"}
                          </button>;
                        })()}
                      </div>
                    )}
                  </div>
                ))
              )}
              {activeReplies.length > visibleReplies.length && <button type="button" onClick={() => setVisibleReplyCount((count) => count + FORUM_REPLY_PAGE_SIZE)} className="w-full border-t border-slate-100 py-4 text-xs font-medium text-slate-500">加载更多回复</button>}
            </section>
          </main>

          <footer className="shrink-0 border-t border-slate-100 bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2" data-keyboard-safe-composer>
            {replyingTo && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyAnonymously(false);
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm active:bg-slate-100"
                  aria-label="取消回复指定楼层"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-0 flex-1 truncate">
                  回复 {replyingTo.floor} 楼 · {replyingTo.publicAuthor.displayName}
                </span>
              </div>
            )}
            <div className="mb-2 flex items-center justify-end gap-2 px-1">
              <span className="text-[10px] text-slate-400">匿名回复</span>
              <button
                type="button"
                role="switch"
                aria-label="匿名回复"
                aria-checked={replyAnonymously}
                onClick={() => setReplyAnonymously((current) => !current)}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  replyAnonymously ? "bg-neutral-950" : "bg-slate-200"
                }`}
              >
                <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  replyAnonymously ? "translate-x-4" : "translate-x-0"
                }`} />
              </button>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                id="forum-reply-input"
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={1}
                maxLength={2000}
                placeholder={replyingTo ? `回复 ${replyingTo.floor} 楼…` : "写下你的回复…"}
                className="forum-composer-input max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] leading-5 outline-none focus:border-slate-400"
              />
              <button
                type="button"
                disabled={!replyBody.trim() || isReplying}
                onClick={handleSubmitReply}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white disabled:bg-slate-200 disabled:text-slate-400"
                aria-label="发布回复"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </>
      )}

      {!activeThread && !activeStoryId && !readonlySnapshot && !secondaryPage && (
        <nav className="flex shrink-0 border-t border-slate-100 bg-white pb-[max(8px,env(safe-area-inset-bottom))] pt-2" aria-label="论坛导航">
          <button type="button" onClick={() => setRootTab("home")} className={`flex flex-1 flex-col items-center gap-1 text-[10px] ${rootTab === "home" ? "text-neutral-950" : "text-slate-400"}`}><MessageCircle className="h-5 w-5" />论坛</button>
          <button type="button" onClick={() => setRootTab("mine")} className={`flex flex-1 flex-col items-center gap-1 text-[10px] ${rootTab === "mine" ? "text-neutral-950" : "text-slate-400"}`}><User className="h-5 w-5" />我的</button>
        </nav>
      )}

      <BottomSheet
        open={showComposer}
        title="发布帖子"
        description="内容只会显示在当前身份的论坛中。"
        onClose={resetComposer}
        showCloseButton
        footer={(
          <>
            <Button variant="secondary" onClick={resetComposer} disabled={isPosting}>取消</Button>
            <Button
              onClick={handleCreateThread}
              loading={isPosting}
              disabled={!postTitle.trim() || !postBody.trim()}
            >
              发布
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">标题</span>
            <input
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
              maxLength={80}
              placeholder="输入帖子标题"
              className="forum-composer-input h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400"
            />
            <span className="mt-1 block text-right text-[10px] text-slate-300">{postTitle.length}/80</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">正文</span>
            <textarea
              value={postBody}
              onChange={(event) => setPostBody(event.target.value)}
              maxLength={5000}
              rows={7}
              placeholder="分享你想讨论的内容"
              className="forum-composer-input w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-6 outline-none focus:border-slate-400"
            />
            <span className="mt-1 block text-right text-[10px] text-slate-300">{postBody.length}/5000</span>
          </label>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">匿名发布</p>
              <p className="mt-0.5 text-[11px] text-slate-400">公开页面不会显示你的头像和昵称</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={postAnonymously}
              onClick={() => setPostAnonymously((current) => !current)}
              className={`relative h-7 w-12 rounded-full transition-colors ${postAnonymously ? "bg-neutral-950" : "bg-slate-200"}`}
            >
              <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${postAnonymously ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={showCommunityNpcComposer}
        title="新建角色卡"
        description="这是仅在论坛中使用的虚拟网友身份，不会写入角色、关系或聊天记忆。"
        onClose={resetCommunityNpcComposer}
        showCloseButton
        footer={<><Button variant="secondary" onClick={resetCommunityNpcComposer}>取消</Button><Button onClick={saveCommunityNpc} disabled={!communityNpcName.trim() || !communityNpcPersona.trim()}>保存</Button></>}
      >
        <div className="space-y-4">
          <label className="block text-xs font-semibold text-slate-600">名字<input value={communityNpcName} onChange={(event) => setCommunityNpcName(event.target.value)} maxLength={32} placeholder="例如：热心网友" className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none" /></label>
          <label className="block text-xs font-semibold text-slate-600">头像 URL（可选）<input value={communityNpcAvatar} onChange={(event) => setCommunityNpcAvatar(event.target.value)} maxLength={1000} placeholder="https://..." className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none" /></label>
          <label className="block text-xs font-semibold text-slate-600">简单人设<textarea value={communityNpcPersona} onChange={(event) => setCommunityNpcPersona(event.target.value)} maxLength={300} rows={4} placeholder="例如：爱帮新人答疑的夜猫子，开头常说“谢邀”" className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none" /></label>
        </div>
      </BottomSheet>

      <BottomSheet
        open={showCommunityNpcExport}
        title="导出论坛 NPC 角色卡"
        description="可多选角色卡导出；导出文件仅包含论坛专属身份与人设。"
        onClose={() => setShowCommunityNpcExport(false)}
        showCloseButton
        footer={<><Button variant="secondary" onClick={() => setShowCommunityNpcExport(false)}>取消</Button><Button onClick={exportCommunityNpcs} disabled={selectedCommunityNpcIds.length === 0}>导出 {selectedCommunityNpcIds.length || ""} 个角色卡</Button></>}
      >
        <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={communityNpcs.length > 0 && selectedCommunityNpcIds.length === communityNpcs.length}
            onChange={(event) => setSelectedCommunityNpcIds(event.target.checked ? communityNpcs.map((npc) => npc.id) : [])}
            className="h-4 w-4 rounded border-slate-300"
          />
          全选
        </label>
        <div className="mt-2 space-y-1">
          {communityNpcs.map((npc) => (
            <label key={npc.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
              <input type="checkbox" checked={selectedCommunityNpcIds.includes(npc.id)} onChange={() => toggleCommunityNpcExport(npc.id)} className="h-4 w-4 rounded border-slate-300" />
              {npc.avatar ? <img src={npc.avatar} alt="" className="h-9 w-9 rounded-full bg-slate-100 object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><User className="h-4 w-4 text-slate-400" /></span>}
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-700">{npc.displayName}</strong><small className="mt-0.5 block truncate text-[10px] text-slate-400">{npc.personaSummary}</small></span>
            </label>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={showShareSheet}
        title="转发给好友"
        description="只显示当前身份下的单聊好友。"
        onClose={resetShareSheet}
        showCloseButton
        footer={(
          <>
            <Button variant="secondary" onClick={resetShareSheet} disabled={isSharing}>取消</Button>
            <Button
              onClick={handleShareThread}
              loading={isSharing}
              disabled={!selectedShareTarget}
            >
              {selectedShareTarget
                ? `转发给 ${selectedShareTarget.character.remark || selectedShareTarget.character.name}`
                : "请选择好友"}
            </Button>
          </>
        )}
      >
        {shareTargets.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">当前身份还没有可转发的好友</p>
            <p className="mt-1 text-[11px] text-slate-400">请先在通讯录添加一个单聊好友。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {shareTargets.map(({ relationship, character }) => {
              const selected = relationship.id === selectedShareRelationId;
              return (
                <button
                  key={relationship.id}
                  type="button"
                  onClick={() => setSelectedShareRelationId(relationship.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    selected ? "border-neutral-950 bg-slate-50" : "border-slate-100 bg-white"
                  }`}
                  aria-pressed={selected}
                >
                  <img
                    src={character.avatar}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full bg-slate-100 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {character.remark || character.name}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {activeIdentity.name} 的好友
                    </p>
                  </div>
                  <span className={`h-4 w-4 rounded-full border-2 ${
                    selected ? "border-neutral-950 bg-neutral-950 shadow-[inset_0_0_0_3px_white]" : "border-slate-200"
                  }`} />
                </button>
              );
            })}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === "thread" ? "删除这篇帖子？" : "删除这条回复？"}
        description={deleteTarget?.kind === "thread"
          ? "帖子及其全部回复会被永久删除。"
          : "楼层会保留，并显示为“该回复已删除”以避免引用错乱。"}
        tone="danger"
        confirmLabel="删除"
        cancelLabel="取消"
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
