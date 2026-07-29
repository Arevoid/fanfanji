import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  Bell,
  Mail,
  History,
  Pencil,
  X,
} from "lucide-react";
import type {
  Character,
  ForumActivityTask,
  ForumRootTab,
  ForumDmConversation as ForumDmConversationType,
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
import { useForumActivityEngine } from "../features/forum/hooks/useForumActivityEngine";
import { forceForumThreadActivity, scheduleInitialForumReplies } from "../features/forum/services/forumActivityRuntime";
import { BottomSheet, Button, ConfirmDialog, PopoverMenu } from "./ui";
import { ForumAvatar } from "../features/forum/components/ForumAvatar";
import { getForumVirtualProfile } from "../domain/forum/forumVirtualProfiles";
import { ForumThreadCard } from "../features/forum/components/ForumThreadCard";
import { ForumSnapshotDetail } from "../features/forum/components/ForumSnapshotDetail";
import { appendForumShareOnce, listForumShareTargets } from "../domain/forum/forumShare";
import { createForumShareOperation } from "../features/forum/services/forumShareService";
import {
  buildForumGenerationTaskKey,
  beginForumGenerationTask,
  finishForumGenerationTask,
  getThreadRefreshCooldownRemaining,
  hasEvaluatedLikeEngagement,
  hasRecentSuccessfulLazyTask,
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
import { appendForumNotification, createForumNotification, createForumProfile, recordForumVisit, toPublicThreadSnapshot, updateForumLikeHistory } from "../domain/forum/forumProfileData";
import { imageAssetDb } from "../utils/imageAssetDb";
import { compressImage } from "../utils/stickerDb";
import { ForumDmList } from "../features/forum/components/ForumDmList";
import { ForumDmConversation } from "../features/forum/components/ForumDmConversation";
import { appendForumDmMessage, deleteForumDmConversation, markForumDmRead, openForumDmConversation, resolveForumDmActorFromPublicRecord } from "../domain/forum/forumDmData";
import { requestForumDmReply } from "../features/forum/services/forumDmService";
import { FORUM_HOME_PAGE_SIZE, FORUM_REPLY_PAGE_SIZE } from "../domain/forum/forumCapacity";

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
  onOpenChat: (characterId: string, relationId: string, sourceMessageId: string) => void;
  onClose: () => void;
}

type DeleteTarget =
  | { kind: "thread"; threadId: string }
  | { kind: "reply"; replyId: string }
  | null;

const createId = (prefix: string): string => {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
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
  const { threads, replies, shares, generationTasks, profiles, visitHistory, likeHistory, notifications, dmConversations, dmMessages, dmTasks } = forumSnapshot;
  const [rootTab, setRootTab] = useState<ForumRootTab>("home");
  const [secondaryPage, setSecondaryPage] = useState<"history" | "likes" | "notifications" | "profile" | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
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
  const [activeDmConversationId, setActiveDmConversationId] = useState<string | null>(null);
  const [dmBody, setDmBody] = useState("");
  const [isDmSending, setIsDmSending] = useState(false);
  const [showDeleteDmConfirmation, setShowDeleteDmConfirmation] = useState(false);
  const [visibleThreadCount, setVisibleThreadCount] = useState(FORUM_HOME_PAGE_SIZE);
  const [visibleReplyCount, setVisibleReplyCount] = useState(FORUM_REPLY_PAGE_SIZE);
  const [translatedContentIds, setTranslatedContentIds] = useState<Record<string, boolean>>({});
  const [translationLoadingIds, setTranslationLoadingIds] = useState<Record<string, boolean>>({});
  const replyLockRef = useRef(false);
  const postLockRef = useRef(false);
  const shareLockRef = useRef(false);
  const refreshLockRef = useRef(false);
  const threadRefreshLockRef = useRef(false);
  const lazyAttemptedIdentityRef = useRef<string | null>(null);
  const homeMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const newestReplyRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const identityThreads = useMemo(
    () => listForumThreadsForIdentity(threads, activeIdentity.id),
    [threads, activeIdentity.id],
  );
  const activeThread = identityThreads.find((thread) => thread.id === activeThreadId);
  const activeDmConversation = dmConversations.find((conversation) => conversation.id === activeDmConversationId);
  const activeProfile = profiles.find((profile) => profile.ownerIdentityId === activeIdentity.id) || createForumProfile(activeIdentity, 0);
  const forumIdentity = useMemo(() => ({ ...activeIdentity, name: activeProfile.displayName, avatar: activeProfile.avatar || activeIdentity.avatar }), [activeIdentity, activeProfile.avatar, activeProfile.displayName]);
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

  useForumActivityEngine({
    ownerIdentityId: activeIdentity.id,
    relationships,
    characters,
    messages,
    memories,
    worldBookEntries,
    settings,
  });

  useEffect(() => {
    const safe = loadForumDataSafely({
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
    setRootTab("home"); setSecondaryPage(null); setActiveThreadId(null); setReadonlySnapshot(null);
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
    if (activeDmConversationId) commitForumMutation({ dmConversations: markForumDmRead(dmConversations, activeDmConversationId) });
  }, [activeDmConversationId]);

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

  useEffect(() => {
    if (lazyAttemptedIdentityRef.current === activeIdentity.id) return;
    lazyAttemptedIdentityRef.current = activeIdentity.id;
    const now = Date.now();
    const validRelations = shareTargets.map((target) => target.relationship);
    const currentTasks = loadForumGenerationTasks(
      new Set(relationships.map((relationship) => relationship.id)),
      now,
    ).value;
    if (currentTasks.some((task) =>
      task.ownerIdentityId === activeIdentity.id && task.status === "running")) return;
    const eligible = validRelations.find((relationship) =>
      !hasRecentSuccessfulLazyTask(currentTasks, activeIdentity.id, relationship.id, now));
    if (!eligible || !settings.apiKey?.trim() || !settings.selectedModel?.trim()) return;
    const windowKey = new Date(now).toISOString().slice(0, 10);
    const taskKey = buildForumGenerationTaskKey({
      ownerIdentityId: activeIdentity.id,
      relationId: eligible.id,
      trigger: "lazy",
      windowKey,
    });
    const begun = beginForumGenerationTask({
      tasks: currentTasks,
      id: createId("forum-generation-task"),
      taskKey,
      ownerIdentityId: activeIdentity.id,
      relationId: eligible.id,
      characterId: eligible.characterId,
      trigger: "lazy",
      now,
    });
    if (!begun.task || !commitForumMutation({ generationTasks: begun.tasks }).success) {
      releaseForumGenerationTask(taskKey);
      return;
    }
    void generateForumThreads({
      ownerIdentityId: activeIdentity.id,
      count: 1,
      trigger: "lazy",
      preferredRelationId: eligible.id,
      relationships,
      characters,
      messages,
      memories,
      worldBookEntries,
      existingThreads: loadForumThreads().value,
      settings,
      now,
    }).then((generated) => {
      if (generated.threads.length === 0) throw new Error("生成内容无效");
      const currentThreads = loadForumThreads().value;
      const nextThreads = [...generated.threads, ...currentThreads];
      const refreshActivityTasks: ForumActivityTask[] = generated.threads.flatMap((thread) => {
        const generatedReplies = generated.replies.filter((reply) => reply.threadId === thread.id);
        if (!generatedReplies.length) return [];
        return [{
          id: createId("forum-refresh-activity"),
          ownerIdentityId: activeIdentity.id,
          threadId: thread.id,
          trigger: "automatic" as const,
          status: "succeeded" as const,
          startedAt: now,
          completedAt: now,
          pendingEvents: generatedReplies.map((reply, index) => {
            const profile = getForumVirtualProfile(thread.id, index);
            return {
              id: createId("forum-refresh-pending"), ownerIdentityId: activeIdentity.id, threadId: thread.id,
              batchId: `refresh-${thread.id}`, localId: `e${index + 1}`,
              actorSlotSnapshot: { slotId: `virtual-${index + 1}`, publicAuthor: reply.publicAuthor, actor: { kind: "virtual" as const, virtualProfileId: profile.id }, safePublicStyle: profile.publicStyle },
              privateActor: { kind: "virtual" as const, virtualProfileId: profile.id }, kind: "reply" as const, body: reply.body,
              replyTarget: { type: "thread" as const }, scheduledAt: now + index * 45_000, status: "pending" as const,
              createdAt: now, updatedAt: now,
            };
          }),
          createdAt: now,
          updatedAt: now,
        }];
      });
      if (!commitForumMutation({
        threads: nextThreads,
        activityTasks: [...loadForumActivityTasks().value, ...refreshActivityTasks],
      }).success) throw new Error("storage");
      const latestTasks = loadForumGenerationTasks(
        new Set(relationships.map((relationship) => relationship.id)),
      ).value;
      const finished = finishForumGenerationTask(latestTasks, begun.task.id, "succeeded", Date.now());
      commitForumMutation({ generationTasks: finished });
    }).catch(() => {
      const latestTasks = loadForumGenerationTasks(
        new Set(relationships.map((relationship) => relationship.id)),
      ).value;
      const finished = finishForumGenerationTask(latestTasks, begun.task.id, "failed", Date.now());
      commitForumMutation({ generationTasks: finished });
    }).finally(() => releaseForumGenerationTask(taskKey));
  }, [
    activeIdentity.id,
    characters,
    memories,
    messages,
    relationships,
    settings,
    shareTargets,
    worldBookEntries,
  ]);

  const reportStorageError = () => setError("保存失败，请检查浏览器存储空间后重试。");

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
      const currentThreads = loadForumThreads().value;
      const currentReplies = loadForumReplies().value;
      const generated = await generateForumThreads({
        ownerIdentityId: activeIdentity.id,
        count: plannedCount,
        trigger: "refresh",
        relationships,
        characters,
        messages,
        memories,
        worldBookEntries,
        existingThreads: currentThreads,
        settings,
        now,
      });
      if (generated.threads.length === 0) {
        throw new Error("生成内容无效：没有可写入的新帖子。");
      }
      const nextThreads = [...generated.threads, ...currentThreads];
      const nextReplies = [...currentReplies, ...generated.replies];
      if (!commitForumMutation({ threads: nextThreads, replies: nextReplies }).success) throw new Error("storage");
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
    if (activeDmConversationId) { setActiveDmConversationId(null); setDmBody(""); return; }
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

  const openDmFromRecord = (thread?: ForumThread, reply?: ForumReply) => {
    const resolved = resolveForumDmActorFromPublicRecord({ ownerIdentityId: activeIdentity.id, thread, reply, relationships, characters });
    if (!resolved) { setError("该作者暂不支持论坛私信"); return; }
    const opened = openForumDmConversation({ ownerIdentityId: activeIdentity.id, conversations: dmConversations, actor: resolved.actor, publicAuthor: resolved.publicAuthor, ...(thread ? { originThreadId: thread.id } : {}), ...(reply ? { originReplyId: reply.id } : {}) });
    if (!commitForumMutation({ dmConversations: opened.conversations }).success) { reportStorageError(); return; }
    setActiveDmConversationId(opened.conversation.id); setRootTab("dm");
  };

  const sendDm = async () => {
    if (!activeDmConversation || !dmBody.trim() || isDmSending) return;
    const appended = appendForumDmMessage({ messages: dmMessages, conversations: dmConversations, conversationId: activeDmConversation.id, ownerIdentityId: activeIdentity.id, sender: "user", body: dmBody });
    if (!commitForumMutation({ dmConversations: appended.conversations, dmMessages: appended.messages }).success) { reportStorageError(); return; }
    setDmBody(""); setIsDmSending(true); setError("");
    try {
      await requestForumDmReply({ conversation: activeDmConversation, conversations: appended.conversations, messages: appended.messages, tasks: dmTasks, threads, notifications, relationships, characters, settings, profileName: activeProfile.displayName, activeConversationId: activeDmConversation.id, isConversationCurrent: (conversationId, revision) => {
        const current = getForumSnapshotForIdentity(activeIdentity.id).dmConversations.find((item) => item.id === conversationId);
        return Boolean(current && current.revision === revision);
      }, commit: (mutation) => commitForumMutation(mutation).success });
    } catch (dmError) { setError(dmError instanceof Error ? dmError.message : "论坛私信回复失败，请稍后重试"); }
    finally { setIsDmSending(false); }
  };

  const confirmDeleteDmConversation = () => {
    if (!activeDmConversation) return;
    const next = deleteForumDmConversation({
      conversationId: activeDmConversation.id,
      ownerIdentityId: activeIdentity.id,
      conversations: dmConversations,
      messages: dmMessages,
      tasks: dmTasks,
      notifications,
    });
    if (!commitForumMutation({ dmConversations: next.conversations, dmMessages: next.messages, dmTasks: next.tasks, notifications: next.notifications }).success) { reportStorageError(); return; }
    setShowDeleteDmConfirmation(false);
    setActiveDmConversationId(null);
    setDmBody("");
    setIsDmSending(false);
    setNotice("私信会话已删除");
  };

  const openThread = (thread: ForumThread) => {
    setActiveThreadId(thread.id); setReplyingTo(null); setReplyBody(""); setReplyAnonymously(false); setError(""); setNotice("");
    commitForumMutation({ visitHistory: recordForumVisit(visitHistory, activeIdentity.id, thread, replies) });
    setVisibleReplyCount(FORUM_REPLY_PAGE_SIZE); requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
  };

  const saveProfile = () => {
    const displayName = profileName.trim();
    if (!displayName) { setError("昵称不能为空"); return; }
    const nextProfile = { ...activeProfile, displayName: displayName.slice(0, 32), bio: profileBio.trim().slice(0, 160), updatedAt: Date.now() };
    if (commitForumMutation({ profiles: [...profiles.filter((item) => item.ownerIdentityId !== activeIdentity.id), nextProfile] })) { setSecondaryPage(null); setNotice("资料已保存"); }
    else reportStorageError();
  };

  const uploadProfileAvatar = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) { setError("请选择图片文件"); return; }
    try {
      const blob = await compressImage(file);
      const assetId = `forum-profile-avatar-${activeIdentity.id}`;
      await imageAssetDb.saveImage(assetId, blob);
      const next = { ...activeProfile, avatarAssetId: assetId, updatedAt: Date.now() };
      if (!commitForumMutation({ profiles: [...profiles.filter((item) => item.ownerIdentityId !== activeIdentity.id), next] })) reportStorageError();
    } catch { setError("头像保存失败，请重试"); }
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
    onOpenChat(
      selectedShareTarget.character.id,
      selectedShareTarget.relationship.id,
      operation.message.id,
    );
  };

  const resetComposer = () => {
    setPostTitle("");
    setPostBody("");
    setPostAnonymously(false);
    setShowComposer(false);
  };

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
      });
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
          {activeDmConversation ? activeDmConversation.participantPublicSnapshot.displayName : activeThread || readonlySnapshot ? "帖子详情" : secondaryPage === "profile" ? "编辑资料" : secondaryPage === "history" ? "浏览历史" : secondaryPage === "likes" ? "我的点赞" : secondaryPage === "notifications" ? "消息提醒" : rootTab === "mine" ? "我的" : rootTab === "dm" ? "私信" : "论坛"}
        </h1>
        {!activeThread && !readonlySnapshot && !secondaryPage && !activeDmConversation && rootTab === "home" ? (
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

      {activeDmConversation ? (
        <ForumDmConversation conversation={activeDmConversation} messages={dmMessages.filter((message) => message.conversationId === activeDmConversation.id)} body={dmBody} setBody={setDmBody} sending={isDmSending} onSend={() => void sendDm()} onDelete={() => setShowDeleteDmConfirmation(true)} />
      ) : readonlySnapshot ? (
        <ForumSnapshotDetail snapshot={readonlySnapshot} />
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
          {secondaryPage === "notifications" && <><HistoryList title="消息提醒" empty="暂无新消息" items={notifications} onOpen={(item) => { if (item.type === "direct-message" && item.conversationId && dmConversations.some((conversation) => conversation.id === item.conversationId)) { setSecondaryPage(null); setRootTab("dm"); setActiveDmConversationId(item.conversationId); } else { const thread = threads.find((value) => value.id === item.threadId); if (thread) openThread(thread); else setNotice("原帖已删除或会话不可用"); } commitForumMutation({ notifications: notifications.map((value) => value.id === item.id ? { ...value, readAt: Date.now() } : value) }); }} /><button type="button" onClick={() => { if (window.confirm("清空全部消息提醒？")) commitForumMutation({ notifications: [] }); }} className="mt-4 w-full text-xs text-rose-500">清空消息提醒</button></>}
        </main>
      ) : !activeThread && rootTab === "dm" ? (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24"><ForumDmList conversations={dmConversations} messages={dmMessages} onOpen={(id) => setActiveDmConversationId(id)} /></main>
      ) : !activeThread && rootTab === "mine" ? (
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setSecondaryPage("profile")} className="flex w-full items-center gap-3 text-left">
              {profileAvatarUrl || activeProfile.avatar ? <img src={profileAvatarUrl || activeProfile.avatar} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><User className="h-6 w-6 text-slate-400" /></span>}
              <span className="min-w-0 flex-1"><strong className="block truncate text-base">{activeProfile.displayName}</strong><small className="mt-1 block truncate text-slate-400">{activeProfile.bio || "点击完善论坛资料"}</small></span><Pencil className="h-4 w-4 text-slate-400" />
            </button>
          </section>
          <section className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
            {[{ key: "history", label: "浏览历史", icon: History }, { key: "likes", label: "我的点赞", icon: ThumbsUp }, { key: "notifications", label: "消息提醒", icon: Bell }].map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setSecondaryPage(key as "history" | "likes" | "notifications")} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left last:border-0"><Icon className="h-4 w-4 text-slate-500" /><span className="flex-1 text-sm">{label}</span>{key === "notifications" && notifications.some((item) => !item.readAt) && <span className="h-2 w-2 rounded-full bg-rose-500" />}</button>)}
          </section>
        </main>
      ) : !activeThread ? (
        <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24">
          {identityThreads.length === 0 ? (
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
          ) : (
            <div className="mt-3 overflow-hidden border-y border-slate-100 bg-white">
              {visibleThreads.map((thread) => (
                <div key={thread.id}>
                  <ForumThreadCard
                    thread={thread}
                    metrics={selectForumThreadMetrics(thread, replies)}
                    formattedTime={formatForumTime(selectForumThreadMetrics(thread, replies).updatedAt)}
                    onOpen={() => openThread(thread)}
                  />
                  {waitingReplyThreadIds.includes(thread.id) && (
                    <div className="flex items-center gap-1.5 border-t border-slate-50 px-4 py-2 text-[10px] text-slate-400">
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      正在等待回复…
                    </div>
                  )}
                </div>
              ))}
              {identityThreads.length > visibleThreads.length && <button type="button" onClick={() => setVisibleThreadCount((count) => count + FORUM_HOME_PAGE_SIZE)} className="w-full border-t border-slate-100 py-4 text-xs font-medium text-slate-500">加载更多</button>}
            </div>
          )}
        </main>
      ) : (
        <>
          <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-3">
            <article className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <ForumAvatar author={activeThread.publicAuthor} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-slate-800">
                      {activeThread.publicAuthor.displayName}
                    </span>
                    <span className="rounded bg-neutral-950 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      楼主
                    </span>
                    {activeThread.publicAuthor.isAnonymous && (
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
              {resolveForumDmActorFromPublicRecord({ ownerIdentityId: activeIdentity.id, thread: activeThread, relationships, characters }) && (
                <button type="button" onClick={() => openDmFromRecord(activeThread)} className="mt-3 text-[11px] font-medium text-slate-400">发送私信</button>
              )}
              <div className="mt-2 flex justify-end">
                {(() => {
                  const key = getTranslationKey("thread", activeThread.id);
                  return <button
                    type="button"
                    disabled={translationLoadingIds[key]}
                    onClick={() => void toggleTranslation({
                      contentType: "thread",
                      contentId: activeThread.id,
                      title: activeThread.title,
                      body: activeThread.body,
                    })}
                    className="text-[11px] font-medium text-slate-400 disabled:text-slate-300"
                  >
                    {translationLoadingIds[key] ? "翻译中…" : translatedContentIds[key] ? "查看原文" : "翻译"}
                  </button>;
                })()}
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
                      <ForumAvatar author={reply.publicAuthor} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-[12px] font-semibold ${reply.isDeleted ? "text-slate-400" : "text-slate-700"}`}>
                            {reply.isDeleted ? "已删除用户" : reply.publicAuthor.displayName}
                          </span>
                          {reply.publicAuthor.isAnonymous && !reply.isDeleted && (
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
                        {resolveForumDmActorFromPublicRecord({ ownerIdentityId: activeIdentity.id, thread: activeThread, reply, relationships, characters }) && <button type="button" onClick={() => openDmFromRecord(activeThread, reply)} className="text-[11px] text-slate-400">私信</button>}
                      </div>
                    )}
                  </div>
                ))
              )}
              {activeReplies.length > visibleReplies.length && <button type="button" onClick={() => setVisibleReplyCount((count) => count + FORUM_REPLY_PAGE_SIZE)} className="w-full border-t border-slate-100 py-4 text-xs font-medium text-slate-500">加载更多回复</button>}
            </section>
          </main>

          <footer className="shrink-0 border-t border-slate-100 bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
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
                className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] leading-5 outline-none focus:border-slate-400"
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

      {!activeThread && !readonlySnapshot && !secondaryPage && !activeDmConversation && (
        <nav className="flex shrink-0 border-t border-slate-100 bg-white pb-[max(8px,env(safe-area-inset-bottom))] pt-2" aria-label="论坛导航">
          <button type="button" onClick={() => setRootTab("home")} className={`flex flex-1 flex-col items-center gap-1 text-[10px] ${rootTab === "home" ? "text-neutral-950" : "text-slate-400"}`}><MessageCircle className="h-5 w-5" />论坛</button>
          <button type="button" onClick={() => setRootTab("dm")} className={`relative flex flex-1 flex-col items-center gap-1 text-[10px] ${rootTab === "dm" ? "text-neutral-950" : "text-slate-400"}`}><Mail className="h-5 w-5" />私信{dmConversations.reduce((total, item) => total + item.unreadCount, 0) > 0 && <span className="absolute ml-5 h-2 w-2 rounded-full bg-rose-500" />}</button>
          <button type="button" onClick={() => setRootTab("mine")} className={`relative flex flex-1 flex-col items-center gap-1 text-[10px] ${rootTab === "mine" ? "text-neutral-950" : "text-slate-400"}`}><User className="h-5 w-5" />我的{notifications.some((item) => !item.readAt) && <span className="absolute ml-5 h-2 w-2 rounded-full bg-rose-500" />}</button>
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
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400"
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
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-6 outline-none focus:border-slate-400"
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
      <ConfirmDialog
        open={showDeleteDmConfirmation}
        title="删除会话？"
        description="删除后将清除当前论坛私信记录，不会删除论坛帖子、普通聊天好友或角色档案。"
        tone="danger"
        confirmLabel="删除会话"
        cancelLabel="取消"
        onClose={() => setShowDeleteDmConfirmation(false)}
        onConfirm={confirmDeleteDmConversation}
      />
    </div>
  );
}
