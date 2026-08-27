import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookHeart,
  Bookmark,
  Camera,
  CalendarDays,
  ChevronLeft,
  Globe2,
  Image,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Settings2,
  Smartphone,
  Trash2,
  EyeOff,
  X,
} from "lucide-react";
import type { Character, Message, UserSettings } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import {
  createCharacterPhone,
  getCharacterPhone,
  normalizeCharacterPhonePasscode,
  saveCharacterPhone,
} from "../core/storage/repositories/characterPhoneRepository";
import type {
  CharacterPhoneAppId,
  CharacterPhoneRecord,
} from "../domain/characterPhone/types";
import type { Appointment, ScheduleEntry } from "../domain/schedule/scheduleTypes";
import AppSchedule from "./AppSchedule";
import AppChat from "./AppChat";
import { createCharacterTextMessage } from "../features/chat/services/messageFactory";
import { advanceCharacterPhone } from "../features/characterPhone/characterPhoneProgression";
import { buildCharacterPhoneAwarenessMessage } from "../features/characterPhone/characterPhoneReaction";
import {
  appendCharacterPhoneThreadMessage,
  listCharacterPhoneThreadMessages,
} from "../features/characterPhone/characterPhoneThreadService";
import { TimeWidget } from "./HomeScreenWidgets";

interface AppCharacterPhoneProps {
  userIdentityId: string;
  characters: Character[];
  relationships: CharacterRelationship[];
  settings?: UserSettings;
  onSendMessage?: (message: Message) => void;
  onClose: () => void;
}
type GalleryMode = "main" | "hidden" | "deleted";

const APP_META: Record<
  CharacterPhoneAppId,
  { label: string; icon: React.ReactNode; color: string }
> = {
  chat: {
    label: "聊天",
    icon: <MessageCircle className="h-6 w-6" />,
    color: "bg-blue-500",
  },
  browser: {
    label: "浏览器",
    icon: <Globe2 className="h-6 w-6" />,
    color: "bg-sky-500",
  },
  schedule: {
    label: "日程",
    icon: <CalendarDays className="h-6 w-6" />,
    color: "bg-rose-500",
  },
  gallery: {
    label: "相册",
    icon: <Image className="h-6 w-6" />,
    color: "bg-violet-500",
  },
  diary: {
    label: "日记",
    icon: <BookHeart className="h-6 w-6" />,
    color: "bg-amber-500",
  },
  moments: {
    label: "朋友圈",
    icon: <Newspaper className="h-6 w-6" />,
    color: "bg-emerald-500",
  },
};
const WALLPAPERS = [
  "linear-gradient(145deg, #d8e5df 0%, #f4eadc 100%)",
  "linear-gradient(145deg, #dbeafe 0%, #fce7f3 100%)",
  "linear-gradient(145deg, #ede9fe 0%, #fef3c7 100%)",
];

function openCharacterPhone(
  ownerIdentityId: string,
  character: Character,
): CharacterPhoneRecord {
  const existing = getCharacterPhone(ownerIdentityId, character.id);
  if (!existing) return createCharacterPhone(ownerIdentityId, character);
  const normalizedPasscode = normalizeCharacterPhonePasscode(existing.passcode);
  if (
    existing.failedAttempts === 0 &&
    !existing.lockedUntil &&
    existing.passcode === normalizedPasscode
  )
    return existing;
  const reopened = {
    ...existing,
    passcode: normalizedPasscode,
    failedAttempts: 0,
    lockedUntil: undefined,
    updatedAt: Date.now(),
  };
  saveCharacterPhone(reopened);
  return reopened;
}
function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AppCharacterPhone({
  userIdentityId,
  characters,
  relationships,
  settings,
  onSendMessage,
  onClose,
}: AppCharacterPhoneProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(
    characters[0]?.id || "",
  );
  const selectedCharacter = characters.find(
    (character) => character.id === selectedCharacterId,
  );
  const [phone, setPhone] = useState<CharacterPhoneRecord | null>(() =>
    selectedCharacter
      ? openCharacterPhone(userIdentityId, selectedCharacter)
      : null,
  );
  const [unlocked, setUnlocked] = useState(false);
  const [activeApp, setActiveApp] = useState<CharacterPhoneAppId | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>("main");
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(
    null,
  );
  const [browserAddress, setBrowserAddress] = useState("");
  const [browserTab, setBrowserTab] = useState(1);
  const [input, setInput] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [draft, setDraft] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [diaryQuery, setDiaryQuery] = useState("");
  const [selectedDiaryId, setSelectedDiaryId] = useState<string | null>(null);
  const [diaryEditing, setDiaryEditing] = useState(false);
  const [diaryDraft, setDiaryDraft] = useState({ title: "", body: "" });
  const [diaryTab, setDiaryTab] = useState<"all" | "hidden">("all");
  const [postCommentDrafts, setPostCommentDrafts] = useState<
    Record<string, string>
  >({});
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const currentPhone = useMemo(
    () =>
      selectedCharacter
        ? phone || createCharacterPhone(userIdentityId, selectedCharacter)
        : null,
    [phone, selectedCharacter, userIdentityId],
  );
  const unreadCount =
    currentPhone?.messages.filter((message) => message.unread).length ?? 0;
  const selectedContact =
    currentPhone?.contacts?.find(
      (contact) => contact.id === selectedContactId,
    ) || currentPhone?.contacts?.[0];
  const sendAsCharacter = () => {
    if (
      !currentPhone ||
      !selectedContact ||
      !draft.trim() ||
      !selectedCharacter
    )
      return;
    const next = appendCharacterPhoneThreadMessage({
      phone: currentPhone,
      contactId: selectedContact.id,
      content: draft,
      operatedByUser: true,
    });
    saveCharacterPhone(next);
    setPhone(next);
    setDraft("");
    const userEdits = next.activities.filter(
      (activity) => activity.type === "user_edit" && activity.relatedToUser,
    ).length;
    const relation = relationships.find(
      (item) =>
        item.userIdentityId === userIdentityId &&
        item.characterId === selectedCharacter.id,
    );
    if (userEdits > 0 && userEdits % 3 === 0 && relation && onSendMessage)
      onSendMessage(
        createCharacterTextMessage({
          id: `phone-operation-alert-${Date.now()}`,
          characterId: selectedCharacter.id,
          relationId: relation.id,
          conversationId: relation.conversationId,
          content: buildCharacterPhoneAwarenessMessage(selectedCharacter, 1),
          timestamp: Date.now(),
        }),
      );
  };
  const publishPost = () => {
    if (!currentPhone || !selectedCharacter || !postDraft.trim()) return;
    const now = Date.now();
    const next = {
      ...currentPhone,
      posts: [
        ...(currentPhone.posts ?? []),
        {
          id: `phone-post-user-${now}`,
          author: selectedCharacter.name,
          content: postDraft.trim().slice(0, 500),
          timestamp: now,
          likes: 0,
          comments: [],
          source: "user" as const,
        },
      ],
      activities: [
        ...currentPhone.activities,
        {
          id: `phone-post-activity-${now}`,
          type: "user_edit" as const,
          label: "以角色身份发布朋友圈",
          timestamp: now,
          relatedToUser: true,
        },
      ],
      updatedAt: now,
    };
    saveCharacterPhone(next);
    setPhone(next);
    setPostDraft("");
  };

  const selectCharacter = (characterId: string) => {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return;
    setSelectedCharacterId(characterId);
    setPhone(openCharacterPhone(userIdentityId, character));
    setUnlocked(false);
    setActiveApp(null);
    setShowActivity(false);
    setShowSettings(false);
    setInput("");
    setNotice("");
  };

  const verifyPasscode = async () => {
    if (!currentPhone || !selectedCharacter) return;
    const now = Date.now();
    if (currentPhone.lockedUntil && currentPhone.lockedUntil > now) {
      setNotice(
        `手机暂时锁定，请等待 ${Math.ceil((currentPhone.lockedUntil - now) / 1000)} 秒`,
      );
      return;
    }
    if (input === normalizeCharacterPhonePasscode(currentPhone.passcode)) {
      const openedPhone = {
        ...currentPhone,
        failedAttempts: 0,
        lockedUntil: undefined,
        scheduleItems: currentPhone.scheduleItems ?? [],
        galleryItems: currentPhone.galleryItems ?? [],
        contacts: currentPhone.contacts ?? [],
        threadMessages: currentPhone.threadMessages ?? [],
        posts: currentPhone.posts ?? [],
        updatedAt: now,
      };
      setPhone(openedPhone);
      saveCharacterPhone(openedPhone);
      setUnlocked(true);
      setInput("");
      setNotice("");
      setIsAdvancing(true);
      try {
        const advancedPhone = await advanceCharacterPhone({
          phone: openedPhone,
          character: selectedCharacter,
          settings,
        });
        saveCharacterPhone(advancedPhone);
        setPhone(advancedPhone);
        const generatedMessages = advancedPhone.messages.slice(
          openedPhone.messages.length,
        );
        const relation = relationships.find(
          (item) =>
            item.userIdentityId === userIdentityId &&
            item.characterId === selectedCharacter.id,
        );
        if (relation && onSendMessage)
          generatedMessages.forEach((generatedMessage) =>
            onSendMessage(
              createCharacterTextMessage({
                id: `phone-proactive-${generatedMessage.id}`,
                characterId: selectedCharacter.id,
                relationId: relation.id,
                conversationId: relation.conversationId,
                content: generatedMessage.body,
                timestamp: generatedMessage.timestamp,
              }),
            ),
          );
      } finally {
        setIsAdvancing(false);
      }
      return;
    }
    const failedAttempts = currentPhone.failedAttempts + 1;
    const awarenessLevel =
      failedAttempts >= 5
        ? 2
        : failedAttempts >= 3
          ? 1
          : (currentPhone.awarenessLevel ?? 0);
    const awarenessMessage =
      awarenessLevel > (currentPhone.awarenessLevel ?? 0)
        ? {
            id: `phone-awareness-${now}`,
            sender: selectedCharacter.name,
            body: buildCharacterPhoneAwarenessMessage(
              selectedCharacter,
              awarenessLevel,
            ),
            timestamp: now,
            unread: true,
          }
        : null;
    const relation = relationships.find(
      (item) =>
        item.userIdentityId === userIdentityId &&
        item.characterId === selectedCharacter.id,
    );
    if (awarenessMessage && relation && onSendMessage)
      onSendMessage(
        createCharacterTextMessage({
          id: awarenessMessage.id,
          characterId: selectedCharacter.id,
          relationId: relation.id,
          conversationId: relation.conversationId,
          content: awarenessMessage.body,
          timestamp: now,
        }),
      );
    const next = {
      ...currentPhone,
      failedAttempts,
      lockedUntil: failedAttempts >= 5 ? now + 5 * 60 * 1000 : undefined,
      awarenessLevel,
      awarenessUpdatedAt: awarenessMessage
        ? now
        : currentPhone.awarenessUpdatedAt,
      updatedAt: now,
      messages: awarenessMessage
        ? [...currentPhone.messages, awarenessMessage]
        : currentPhone.messages,
      activities: [
        ...currentPhone.activities,
        {
          id: `${now}`,
          type: "unlock_failed" as const,
          label: `密码输入错误（第 ${failedAttempts} 次）`,
          timestamp: now,
          relatedToUser: true,
        },
      ],
    };
    saveCharacterPhone(next);
    setPhone(next);
    setInput("");
    setNotice(
      failedAttempts >= 5
        ? "手机已锁定，角色已经知道有人尝试进入。"
        : failedAttempts >= 3
          ? "角色似乎察觉到了什么。"
          : "密码不正确",
    );
  };

  const openApp = (appId: CharacterPhoneAppId) => {
    if (!currentPhone) return;
    const now = Date.now();
    const next = {
      ...currentPhone,
      activities: [
        ...currentPhone.activities,
        {
          id: `${now}-${appId}`,
          type: "app_opened" as const,
          label: `打开${APP_META[appId].label}`,
          timestamp: now,
          relatedToUser: true,
        },
      ],
      messages:
        appId === "chat"
          ? currentPhone.messages.map((message) => ({
              ...message,
              unread: false,
            }))
          : currentPhone.messages,
      updatedAt: now,
    };
    saveCharacterPhone(next);
    setPhone(next);
    setActiveApp(appId);
    setShowActivity(false);
    setShowSettings(false);
  };
  const updatePhone = (patch: Partial<CharacterPhoneRecord>) => {
    if (!currentPhone) return;
    const next = { ...currentPhone, ...patch, updatedAt: Date.now() };
    saveCharacterPhone(next);
    setPhone(next);
  };
  const cycleWallpaper = () => {
    const index = WALLPAPERS.indexOf(currentPhone?.wallpaper || WALLPAPERS[0]);
    updatePhone({ wallpaper: WALLPAPERS[(index + 1) % WALLPAPERS.length] });
  };
  const moveApp = (appId: CharacterPhoneAppId, direction: -1 | 1) => {
    if (!currentPhone) return;
    const order = [...currentPhone.appOrder];
    const index = order.indexOf(appId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    updatePhone({ appOrder: order });
  };

  const updatePhonePost = (
    momentId: string,
    updater: (
      post: CharacterPhoneRecord["posts"][number],
    ) => CharacterPhoneRecord["posts"][number],
  ) => {
    if (!currentPhone) return;
    updatePhone({
      posts: currentPhone.posts.map((post) =>
        post.id === momentId ? updater(post) : post,
      ),
    });
  };
  const togglePhonePostLike = (postId: string) => {
    if (!currentPhone || !selectedCharacter) return;
    const liked = likedPostIds.includes(postId);
    updatePhonePost(postId, (post) => ({
      ...post,
      likes: Math.max(0, post.likes + (liked ? -1 : 1)),
    }));
    setLikedPostIds((ids) =>
      liked ? ids.filter((id) => id !== postId) : [...ids, postId],
    );
  };
  const addPhonePostComment = (postId: string) => {
    const content = (postCommentDrafts[postId] || "").trim();
    if (!content) return;
    updatePhonePost(postId, (post) => ({
      ...post,
      comments: [...post.comments, content],
    }));
    setPostCommentDrafts((drafts) => ({ ...drafts, [postId]: "" }));
  };
  const deletePhonePost = (postId: string) => {
    if (!currentPhone) return;
    updatePhone({
      posts: currentPhone.posts.filter((post) => post.id !== postId),
    });
  };
  const deletePhonePostComment = (postId: string, index: number) => {
    updatePhonePost(postId, (post) => ({
      ...post,
      comments: post.comments.filter(
        (_, commentIndex) => commentIndex !== index,
      ),
    }));
  };
  const runPhoneBrowserSearch = () => {
    const query = browserAddress.trim();
    if (!query || !currentPhone) return;
    const now = Date.now();
    updatePhone({
      browserHistory: [
        {
          id: `phone-search-user-${now}`,
          query,
          title: `关于“${query}”的搜索结果`,
          timestamp: now,
        },
        ...currentPhone.browserHistory,
      ],
    });
    setBrowserAddress("");
  };

  if (!selectedCharacter || !currentPhone)
    return (
      <div className="flex h-full flex-col bg-[var(--app-bg)] text-[var(--text-primary)]">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h1 className="text-base font-bold">角色手机</h1>
          <button type="button" onClick={onClose} aria-label="关闭角色手机">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-[var(--text-muted)]">
          请先创建至少一个角色，才能查看角色手机。
        </div>
      </div>
    );

  const visibleGallery = currentPhone.galleryItems.filter((item) =>
    galleryMode === "hidden"
      ? item.hidden && !item.deletedAt
      : galleryMode === "deleted"
        ? Boolean(item.deletedAt)
        : !item.hidden && !item.deletedAt,
  );
  const selectedDiary =
    currentPhone.diaryEntries.find((entry) => entry.id === selectedDiaryId) ||
    null;
  const visibleDiaryEntries = currentPhone.diaryEntries.filter(
    (entry) =>
      (diaryTab === "hidden" ? entry.hidden : !entry.hidden) &&
      `${entry.title} ${entry.body}`
        .toLowerCase()
        .includes(diaryQuery.toLowerCase()),
  );
  const currentThreadMessages = selectedContact
    ? listCharacterPhoneThreadMessages(currentPhone, selectedContact.id)
    : [];
  const selectedGallery =
    currentPhone.galleryItems.find((item) => item.id === selectedGalleryId) ||
    null;
  const phoneScheduleEntries = useMemo<ScheduleEntry[]>(
    () =>
      currentPhone.scheduleItems.map((item) => {
        const date = new Date(item.timestamp);
        return {
          id: item.id,
          schemaVersion: 1,
          relationId: `phone:${currentPhone.id}`,
          characterId: selectedCharacter.id,
          userIdentityId,
          category: "appointment",
          appointmentId: `${item.id}-appointment`,
          title: item.title,
          status: item.timestamp >= Date.now() ? "confirmed" : "completed",
          dateKey: date.toISOString().slice(0, 10),
          startAt: item.timestamp,
          timePrecision: "exact",
          activity: item.detail,
          traveler: "undetermined",
          createdAt: item.timestamp,
          updatedAt: item.timestamp,
        };
      }),
    [currentPhone.scheduleItems, currentPhone.id, selectedCharacter.id, userIdentityId],
  );
  const phoneAppointments = useMemo<Appointment[]>(
    () =>
      phoneScheduleEntries.map((entry) => ({
        id: entry.appointmentId,
        schemaVersion: 1,
        relationId: entry.relationId,
        characterId: entry.characterId,
        userIdentityId,
        title: entry.title,
        initiator: "character",
        mode: "scheduled",
        status: entry.status === "completed" ? "completed" : "confirmed",
        proposals: [{ id: `${entry.id}-proposal`, proposedBy: "character", proposedAt: entry.createdAt, startAt: entry.startAt, timePrecision: "exact", activity: entry.activity, traveler: "undetermined", status: "active", sourceMessageIds: [] }],
        currentProposalId: `${entry.id}-proposal`,
        sourceMessageIds: [],
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    [phoneScheduleEntries, userIdentityId],
  );
  const phoneRelation = useMemo<CharacterRelationship>(
    () => ({
      id: `character-phone:${currentPhone.id}`,
      characterId: selectedCharacter.id,
      userIdentityId,
      conversationId: `character-phone:${currentPhone.id}`,
      relationship: "friend",
      createdAt: currentPhone.createdAt,
      updatedAt: currentPhone.updatedAt,
    }),
    [currentPhone.createdAt, currentPhone.id, currentPhone.updatedAt, selectedCharacter.id, userIdentityId],
  );
  const phoneChatMessages = useMemo<Message[]>(
    () =>
      (currentPhone.threadMessages.length
        ? currentPhone.threadMessages
        : currentPhone.messages.map((message) => ({
            id: message.id,
            contactId: currentPhone.contacts[0]?.id || "phone-contact",
            sender: message.sender === selectedCharacter.name ? "character" : "contact",
            content: message.body,
            timestamp: message.timestamp,
          })))
        .map((message) => ({
          id: message.id,
          characterId: selectedCharacter.id,
          relationId: phoneRelation.id,
          conversationId: phoneRelation.conversationId,
          sender: message.sender === "character" ? "character" : "user",
          senderId: message.sender === "character" ? selectedCharacter.id : currentPhone.contacts[0]?.id,
          content: message.content,
          timestamp: message.timestamp,
        })),
    [currentPhone.contacts, currentPhone.messages, currentPhone.threadMessages, phoneRelation.conversationId, phoneRelation.id, selectedCharacter.id, selectedCharacter.name],
  );
  const phoneMoments = useMemo(
    () =>
      (currentPhone.posts || []).map((post) => ({
        id: post.id,
        characterId: selectedCharacter.id,
        relationId: phoneRelation.id,
        authorName: post.author,
        authorAvatar: selectedCharacter.avatar || "",
        content: post.content,
        timestamp: post.timestamp,
        likes: post.likes,
        comments: [],
      })),
    [currentPhone.posts, phoneRelation.id, selectedCharacter.avatar, selectedCharacter.id],
  );
  const phoneChatView = (
    <AppChat
      characters={[selectedCharacter]}
      relationships={[phoneRelation]}
      settings={{
        id: userIdentityId,
        name: "我",
        avatar: "",
        identities: [{ id: userIdentityId, name: "我", avatar: "" }],
      } as unknown as UserSettings}
      messages={phoneChatMessages}
      moments={phoneMoments}
      onSendMessage={(message) => {
        if (!message.content.trim()) return;
        const contact = currentPhone.contacts[0];
        if (!contact) return;
        updatePhone({
          threadMessages: [
            ...currentPhone.threadMessages,
            {
              id: message.id,
              contactId: contact.id,
              sender: message.sender === "character" ? "character" : "contact",
              content: message.content,
              timestamp: message.timestamp,
              operatedByUser: true,
            },
          ],
        });
      }}
      onSaveCharacter={() => undefined}
      onAddMoment={() => undefined}
      onAddCommentToMoment={() => undefined}
      onLikeMoment={() => undefined}
      onToggleBookmark={() => undefined}
      onClose={() => setActiveApp(null)}
      onSaveSettings={() => undefined}
      onNavigateToApp={() => undefined}
      memories={[]}
      onSaveMemories={() => undefined}
      recallSettings={{} as never}
      activeChatCharId={selectedCharacter.id}
      setActiveChatCharId={() => undefined}
      activeChatRelationId={phoneRelation.id}
      setActiveChatRelationId={() => undefined}
      onSaveRelationships={() => undefined}
    />
  );
  const updateGalleryItem = (
    id: string,
    patch: Partial<CharacterPhoneRecord["galleryItems"][number]>,
  ) => {
    updatePhone({
      galleryItems: currentPhone.galleryItems.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };
  const appContent =
    activeApp === "chat" ? phoneChatView : activeApp === "chat" && false ? (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">聊天</h2>
          <button
            type="button"
            onClick={() => openApp("moments")}
            className="rounded-full bg-white/70 px-3 py-1 text-xs"
          >
            朋友圈
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(currentPhone.contacts ?? []).map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => setSelectedContactId(contact.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[10px] ${selectedContact?.id === contact.id ? "bg-neutral-900 text-white" : "bg-white/60"}`}
            >
              {contact.name}
              {contact.isLongTerm ? "" : " · 临时"}
            </button>
          ))}
        </div>
        {selectedContact ? (
          <>
            {currentThreadMessages.length === 0 &&
              currentPhone.messages.map((message) => (
                <div
                  key={message.id}
                  className="mt-4 max-w-[82%] rounded-2xl bg-white/80 px-3 py-2 text-sm"
                >
                  <p className="mb-1 text-[10px] text-neutral-500">
                    {message.sender}
                  </p>
                  {message.body}
                </div>
              ))}
            {currentThreadMessages.map((message) => (
              <div
                key={message.id}
                className={`mt-4 max-w-[82%] rounded-2xl px-3 py-2 text-sm ${message.sender === "character" ? "ml-auto bg-neutral-900 text-white" : "bg-white/80"}`}
              >
                <p className="mb-1 text-[10px] opacity-60">
                  {message.sender === "character"
                    ? selectedCharacter.name
                    : selectedContact.name}
                  {message.operatedByUser ? " · 用户代发" : ""}
                </p>
                {message.content}
                {message.attachment && (
                  <div className="mt-2 rounded-xl bg-black/10 p-2 text-[10px]">
                    ▣ {message.attachment.label}
                    <br />
                    {message.attachment.content}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-5 flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendAsCharacter();
                }}
                placeholder={`发消息给 ${selectedContact.name}`}
                className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={sendAsCharacter}
                className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white"
              >
                发送
              </button>
            </div>
          </>
        ) : (
          <p className="mt-8 text-center text-xs text-neutral-500">
            暂时没有独立联系人。
          </p>
        )}
      </>
    ) : activeApp === "browser" ? (
      <>
        <div className="-mx-5 -mt-14 flex min-h-[calc(100%+5rem)] flex-col bg-[#f8f8fa] text-[#1f2937]">
          <div className="flex items-center justify-between bg-[#f8f8fa] px-4 pb-2 pt-3 text-[10px] font-semibold">
            <span>22:08</span>
            <span>5G　⌁　▮</span>
          </div>
          <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2">
            <button
              type="button"
              aria-label="后退"
              className="rounded-full p-1 text-neutral-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="前进"
              className="rounded-full p-1 text-neutral-300"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runPhoneBrowserSearch();
              }}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#e9e9ee] px-3 py-2"
            >
              <Search className="h-3.5 w-3.5 text-neutral-500" />
              <input
                value={browserAddress}
                onChange={(event) => setBrowserAddress(event.target.value)}
                placeholder="搜索或输入网址"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
              <RefreshCw className="h-3.5 w-3.5 text-neutral-500" />
            </form>
            <button
              type="button"
              aria-label="更多浏览器选项"
              className="rounded-full p-1"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Globe2 className="h-4 w-4 text-sky-500" />
              <span>浏览器</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <button type="button" aria-label="书签">
                <Bookmark className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setBrowserTab((count) => count + 1)}
                aria-label="新建标签页"
                className="rounded border border-neutral-300 px-1.5 py-0.5"
              >
                {browserTab}
              </button>
              <button type="button" aria-label="新建窗口">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <main className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
            <div className="rounded-3xl bg-white p-5 text-center shadow-sm">
              <Globe2 className="mx-auto h-10 w-10 text-sky-500" />
              <h2 className="mt-3 text-lg font-bold">开始浏览</h2>
              <p className="mt-1 text-xs text-neutral-500">
                搜索记录会保留在这部手机里
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  runPhoneBrowserSearch();
                }}
                className="mt-4 flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2"
              >
                <Search className="h-4 w-4 text-neutral-400" />
                <input
                  value={browserAddress}
                  onChange={(event) => setBrowserAddress(event.target.value)}
                  placeholder="搜索角色想知道的内容"
                  className="min-w-0 flex-1 text-xs outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-neutral-900 px-3 py-2 text-[10px] font-bold text-white"
                >
                  搜索
                </button>
              </form>
            </div>
            <h3 className="mt-6 text-xs font-bold text-neutral-500">
              最近访问
            </h3>
            {currentPhone.browserHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBrowserAddress(item.query)}
                className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-500">
                  <Globe2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">
                    {item.title}
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-neutral-500">
                    {item.query} ·{" "}
                    {new Date(item.timestamp).toLocaleDateString("zh-CN")}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-neutral-300" />
              </button>
            ))}
          </main>
          <div className="flex items-center justify-center gap-10 border-t border-black/5 bg-white py-3 text-neutral-400">
            <ArrowLeft className="h-4 w-4" />
            <ArrowRight className="h-4 w-4" />
            <Share2 className="h-4 w-4" />
            <Bookmark className="h-4 w-4" />
            <MoreHorizontal className="h-4 w-4" />
          </div>
        </div>
      </>
    ) : activeApp === "schedule" ? (
      <div className="-mx-5 -mt-5 min-h-[calc(100%+2.5rem)] bg-[var(--app-bg)]">
        <AppSchedule
          entries={phoneScheduleEntries}
          appointments={phoneAppointments}
          characters={[selectedCharacter]}
          onOpenChat={() => setActiveApp("chat")}
          onClose={() => setActiveApp(null)}
        />
      </div>
    ) : activeApp === "moments" ? (
      <>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">朋友圈</h2>
          <button
            type="button"
            onClick={() => openApp("chat")}
            className="rounded-full bg-white/70 px-3 py-1 text-xs"
          >
            返回聊天
          </button>
        </div>
        {(currentPhone.posts ?? [])
          .slice()
          .sort((a, b) => b.timestamp - a.timestamp)
          .map((post) => (
            <article key={post.id} className="mt-4 rounded-2xl bg-white/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{post.author}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-neutral-500">
                    {formatTime(post.timestamp)}
                  </p>
                  <button
                    type="button"
                    onClick={() => deletePhonePost(post.id)}
                    className="text-[10px] text-rose-500"
                  >
                    删除
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6">{post.content}</p>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-neutral-500">
                <button
                  type="button"
                  onClick={() => togglePhonePostLike(post.id)}
                  className={
                    likedPostIds.includes(post.id)
                      ? "font-bold text-rose-500"
                      : ""
                  }
                >
                  ♥ {post.likes || "赞"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPostCommentDrafts((drafts) => ({
                      ...drafts,
                      [post.id]: drafts[post.id] ?? "",
                    }))
                  }
                >
                  评论 {post.comments.length || ""}
                </button>
              </div>
              {post.comments.map((comment, index) => (
                <div
                  key={comment}
                  className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs"
                >
                  <span>{comment}</span>
                  <button
                    type="button"
                    onClick={() => deletePhonePostComment(post.id, index)}
                    className="text-[10px] text-rose-500"
                  >
                    删除
                  </button>
                </div>
              ))}
              <div className="mt-3 flex gap-2">
                <input
                  value={postCommentDrafts[post.id] || ""}
                  onChange={(event) =>
                    setPostCommentDrafts((drafts) => ({
                      ...drafts,
                      [post.id]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addPhonePostComment(post.id);
                  }}
                  placeholder="发表评论…"
                  className="min-w-0 flex-1 rounded-xl bg-black/5 px-3 py-2 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => addPhonePostComment(post.id)}
                  className="rounded-xl bg-black/10 px-3 py-2 text-xs"
                >
                  发送
                </button>
              </div>
            </article>
          ))}
        <div className="mt-5 rounded-2xl bg-white/70 p-3">
          <p className="text-xs font-bold">以角色身份发布</p>
          <textarea
            value={postDraft}
            onChange={(event) => setPostDraft(event.target.value)}
            placeholder="写下角色会发布的内容…"
            className="mt-2 min-h-20 w-full rounded-xl bg-black/5 p-2 text-xs outline-none"
          />
          <button
            type="button"
            onClick={publishPost}
            className="mt-2 rounded-xl bg-neutral-900 px-3 py-2 text-xs font-bold text-white"
          >
            发布朋友圈
          </button>
        </div>
      </>
    ) : activeApp === "gallery" ? (
      <>
        {selectedGallery ? (
          <div className="-mx-5 -mt-14 flex min-h-[calc(100%+5rem)] flex-col bg-black text-white">
            <div className="flex items-center justify-between px-4 pb-3 pt-5">
              <button
                type="button"
                onClick={() => setSelectedGalleryId(null)}
                className="text-sm"
              >
                ‹ 相册
              </button>
              <span className="text-xs">
                {new Date(selectedGallery.timestamp).toLocaleDateString(
                  "zh-CN",
                )}
              </span>
              <button type="button" aria-label="更多照片操作">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-5">
              <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-slate-300 via-rose-100 to-amber-100 text-7xl">
                ✦
              </div>
              <h2 className="mt-5 w-full text-left text-base font-bold">
                {selectedGallery.title}
              </h2>
              <p className="mt-2 w-full text-left text-xs leading-5 text-white/70">
                {selectedGallery.caption}
              </p>
            </div>
            <div className="flex items-center justify-center gap-9 border-t border-white/15 py-4 text-white/80">
              <button type="button" aria-label="分享照片">
                <Share2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  updateGalleryItem(selectedGallery.id, {
                    hidden: !selectedGallery.hidden,
                  })
                }
                aria-label={
                  selectedGallery.hidden ? "移出隐藏相册" : "隐藏照片"
                }
              >
                <EyeOff className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  updateGalleryItem(selectedGallery.id, {
                    deletedAt: Date.now(),
                  });
                  setSelectedGalleryId(null);
                }}
                aria-label="删除照片"
              >
                <Trash2 className="h-5 w-5 text-rose-300" />
              </button>
              <button type="button" aria-label="下载照片">
                <Share2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="-mx-5 -mt-14 min-h-[calc(100%+5rem)] bg-[#f8f8fa] text-[#1f2937]">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-2xl font-bold">相册</h2>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="搜索照片">
                  <Search className="h-5 w-5" />
                </button>
                <button type="button" aria-label="添加照片">
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 pb-3 text-xs">
              <button
                type="button"
                onClick={() => setGalleryMode("main")}
                className={`shrink-0 rounded-full px-3 py-1.5 ${galleryMode === "main" ? "bg-black text-white" : "bg-white"}`}
              >
                最近项目
              </button>
              <button
                type="button"
                onClick={() => setGalleryMode("hidden")}
                className={`shrink-0 rounded-full px-3 py-1.5 ${galleryMode === "hidden" ? "bg-black text-white" : "bg-white"}`}
              >
                隐藏
              </button>
              <button
                type="button"
                onClick={() => setGalleryMode("deleted")}
                className={`shrink-0 rounded-full px-3 py-1.5 ${galleryMode === "deleted" ? "bg-black text-white" : "bg-white"}`}
              >
                最近删除
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 px-1">
              {visibleGallery.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedGalleryId(item.id)}
                  className="group relative aspect-square overflow-hidden bg-gradient-to-br from-slate-300 via-rose-100 to-amber-100"
                >
                  <span className="text-4xl text-white/80">✦</span>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/35 px-1 py-1 text-left text-[9px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
            {visibleGallery.length === 0 && (
              <p className="px-4 py-16 text-center text-xs text-neutral-500">
                这个相册还没有照片
              </p>
            )}
            <div className="flex items-center justify-around border-t border-black/5 bg-white py-4 text-[10px] text-neutral-500">
              <span className="font-bold text-black">照片</span>
              <span>为你推荐</span>
              <span>相簿</span>
              <span>搜索</span>
            </div>
          </div>
        )}
      </>
    ) : (
      <>
        {diaryEditing ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">编辑日记</h2>
              <button
                type="button"
                onClick={() => setDiaryEditing(false)}
                className="text-xs text-neutral-500"
              >
                取消
              </button>
            </div>
            <input
              value={diaryDraft.title}
              onChange={(event) =>
                setDiaryDraft({ ...diaryDraft, title: event.target.value })
              }
              placeholder="标题"
              className="mt-5 w-full rounded-xl bg-white/70 px-3 py-2 text-sm outline-none"
            />
            <textarea
              value={diaryDraft.body}
              onChange={(event) =>
                setDiaryDraft({ ...diaryDraft, body: event.target.value })
              }
              placeholder="写下这一刻…"
              className="mt-3 min-h-56 w-full resize-none rounded-xl bg-white/70 p-3 text-sm leading-6 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!currentPhone || !diaryDraft.body.trim()) return;
                const now = Date.now();
                const nextEntry = {
                  id: selectedDiary?.id || `phone-diary-user-${now}`,
                  title: diaryDraft.title.trim() || "无标题日记",
                  body: diaryDraft.body.trim(),
                  timestamp: selectedDiary?.timestamp || now,
                  hidden: selectedDiary?.hidden,
                };
                updatePhone({
                  diaryEntries: [
                    nextEntry,
                    ...currentPhone.diaryEntries.filter(
                      (entry) => entry.id !== nextEntry.id,
                    ),
                  ],
                });
                setSelectedDiaryId(nextEntry.id);
                setDiaryEditing(false);
              }}
              className="mt-3 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white"
            >
              保存日记
            </button>
          </>
        ) : selectedDiary ? (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedDiaryId(null)}
                className="text-xs text-neutral-500"
              >
                ‹ 返回
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiaryDraft({
                    title: selectedDiary.title,
                    body: selectedDiary.body,
                  });
                  setDiaryEditing(true);
                }}
                className="text-xs text-neutral-500"
              >
                编辑
              </button>
            </div>
            <article className="mt-4 rounded-3xl bg-white/70 p-5">
              <h2 className="text-xl font-bold">{selectedDiary.title}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {selectedDiary.body}
              </p>
              <p className="mt-4 text-[10px] text-neutral-500">
                {new Date(selectedDiary.timestamp).toLocaleString("zh-CN")}
              </p>
            </article>
            <button
              type="button"
              onClick={() => {
                if (!currentPhone) return;
                updatePhone({
                  diaryEntries: currentPhone.diaryEntries.filter(
                    (entry) => entry.id !== selectedDiary.id,
                  ),
                });
                setSelectedDiaryId(null);
              }}
              className="mt-4 w-full rounded-xl border border-rose-200 py-2 text-xs text-rose-500"
            >
              删除日记
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">日记</h2>
              <button
                type="button"
                onClick={() => {
                  setDiaryDraft({ title: "", body: "" });
                  setDiaryEditing(true);
                }}
                className="rounded-full bg-white/60 px-3 py-1 text-xs"
              >
                ＋ 新建
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDiaryTab("all")}
                className={`rounded-full px-3 py-1 text-xs ${diaryTab === "all" ? "bg-neutral-900 text-white" : "bg-white/60"}`}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setDiaryTab("hidden")}
                className={`rounded-full px-3 py-1 text-xs ${diaryTab === "hidden" ? "bg-neutral-900 text-white" : "bg-white/60"}`}
              >
                隐藏
              </button>
            </div>
            <input
              value={diaryQuery}
              onChange={(event) => setDiaryQuery(event.target.value)}
              placeholder="搜索日记…"
              className="mt-3 w-full rounded-xl bg-white/70 px-3 py-2 text-xs outline-none"
            />
            {visibleDiaryEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedDiaryId(entry.id)}
                className="mt-3 block w-full rounded-2xl bg-white/70 p-4 text-left"
              >
                <h3 className="font-bold">{entry.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-600">
                  {entry.body}
                </p>
                <p className="mt-2 text-[10px] text-neutral-500">
                  {new Date(entry.timestamp).toLocaleDateString("zh-CN")}
                </p>
              </button>
            ))}
            {visibleDiaryEntries.length === 0 && (
              <p className="mt-8 text-center text-xs text-neutral-500">
                没有找到日记
              </p>
            )}
          </>
        )}
      </>
    );
  const settingsContent = (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6 pt-14 text-neutral-900">
      <h2 className="text-xl font-bold">手机设置</h2>
      <button
        type="button"
        onClick={cycleWallpaper}
        className="mt-5 rounded-2xl bg-white/70 p-4 text-left"
      >
        <p className="text-sm font-bold">更换壁纸</p>
        <p className="mt-1 text-xs text-neutral-600">
          角色可能会注意到壁纸被改过。
        </p>
        <span
          className="mt-3 block h-12 rounded-xl"
          style={{ background: currentPhone.wallpaper }}
        />
      </button>
      <div className="mt-5 rounded-2xl bg-white/70 p-4">
        <p className="text-sm font-bold">桌面应用顺序</p>
        {currentPhone.appOrder.map((appId, index) => (
          <div
            key={appId}
            className="mt-3 flex items-center justify-between text-xs"
          >
            <span>
              {index + 1}. {APP_META[appId].label}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                onClick={() => moveApp(appId, -1)}
                className="rounded bg-black/10 px-2 py-1"
              >
                上移
              </button>
              <button
                type="button"
                onClick={() => moveApp(appId, 1)}
                className="rounded bg-black/10 px-2 py-1"
              >
                下移
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-black/25 p-3 backdrop-blur-md sm:p-6">
      <div className="relative flex h-[min(94%,860px)] min-h-0 w-[min(94%,440px)] flex-col overflow-hidden rounded-[2.75rem] border-[10px] border-neutral-950 bg-neutral-950 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/25">
        <div className="pointer-events-none absolute left-1/2 top-1.5 z-30 h-5 w-24 -translate-x-1/2 rounded-full bg-black/85 shadow-inner" />
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs">
        <button
          type="button"
          className="shrink-0"
          onClick={
            activeApp || showActivity || showSettings
              ? () => {
                  setActiveApp(null);
                  setShowActivity(false);
                  setShowSettings(false);
                }
              : onClose
          }
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
          <span className="max-w-[45vw] truncate text-center font-bold">
            {selectedCharacter.name} 的手机
          </span>
          <select
            aria-label="选择角色"
            value={selectedCharacter.id}
            onChange={(event) => selectCharacter(event.target.value)}
            className="w-16 shrink-0 rounded-lg bg-white/10 px-1 py-1 text-[10px] outline-none"
          >
            {characters.map((character) => (
              <option
                key={character.id}
                value={character.id}
                className="text-black"
              >
                {character.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭">
          <X className="h-5 w-5" />
        </button>
        </div>
        <div
          className="relative mx-auto flex min-h-0 w-full flex-1 overflow-hidden rounded-[2rem] bg-neutral-900"
        style={{ background: currentPhone.wallpaper }}
        >
        <div className="absolute inset-x-0 top-0 z-10 flex justify-between px-5 py-3 text-[10px] font-bold text-neutral-800">
          <span>{formatTime(Date.now())}</span>
          <span>5G　⌁　▮</span>
        </div>
        {!unlocked ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-neutral-800">
            <LockKeyhole className="mb-4 h-10 w-10" />
            <p className="text-lg font-bold">输入密码查看手机</p>
            <p className="mt-2 text-xs text-neutral-600">
              密码线索藏在 {selectedCharacter.name} 的生活里
            </p>
            <input
              value={input}
              onChange={(event) =>
                setInput(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void verifyPasscode();
              }}
              inputMode="numeric"
              type="password"
              placeholder="••••"
              className="mt-6 w-36 rounded-2xl border border-black/10 bg-white/50 px-4 py-3 text-center text-xl tracking-[0.4em] outline-none"
            />
            <button
              type="button"
              onClick={() => void verifyPasscode()}
              className="mt-3 rounded-xl bg-neutral-900 px-6 py-2 text-xs font-bold text-white"
            >
              解锁
            </button>
            {notice && (
              <p
                role="status"
                className="mt-4 text-center text-xs text-rose-700"
              >
                {notice}
              </p>
            )}
          </div>
        ) : showSettings ? (
          settingsContent
        ) : showActivity ? (
          <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6 pt-14 text-neutral-900">
            <h2 className="text-xl font-bold">操作痕迹</h2>
            <p className="mt-2 text-xs text-neutral-600">
              这部手机会记住有人打开过哪些地方。
            </p>
            {currentPhone.activities
              .slice()
              .reverse()
              .map((activity) => (
                <div
                  key={activity.id}
                  className="mt-3 rounded-2xl bg-white/65 p-3"
                >
                  <p className="text-sm">{activity.label}</p>
                  <p className="mt-1 text-[10px] text-neutral-500">
                    {new Date(activity.timestamp).toLocaleString("zh-CN")}
                  </p>
                </div>
              ))}
          </div>
        ) : activeApp ? (
          <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6 pt-14 text-neutral-900">
            {appContent}
          </div>
        ) : (
          <div className="flex flex-1 flex-col px-5 pb-8 pt-16 text-neutral-900">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                aria-label="手机设置"
                className="rounded-full bg-white/40 p-2"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3"><div className="col-span-2 row-span-2 overflow-hidden rounded-[1.75rem] bg-white/45 shadow-sm"><TimeWidget id="character-phone-time" isEditing={false} onRemove={() => undefined} /></div></div>
            <div className="grid grid-cols-3 gap-5">
              {currentPhone.appOrder
                .filter((appId) => appId !== "moments")
                .map((appId) => (
                <button
                  key={appId}
                  type="button"
                  onClick={() => openApp(appId)}
                  className="relative flex flex-col items-center gap-2"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-[1.2rem] text-white shadow-lg ${APP_META[appId].color}`}
                  >
                    {APP_META[appId].icon}
                  </span>
                  <span className="text-[11px] font-bold">
                    {APP_META[appId].label}
                  </span>
                  {appId === "chat" && unreadCount > 0 && (
                    <span className="absolute right-2 top-[-4px] flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowActivity(true)}
              className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-white/40 py-3 text-[11px] text-neutral-700"
            >
              <Activity className="h-3.5 w-3.5" />
              查看操作痕迹
            </button>
            <div className="mt-auto flex items-center justify-center gap-2 text-[10px] text-neutral-700">
              <Smartphone className="h-3.5 w-3.5" />
              {isAdvancing
                ? "正在补齐最近的生活痕迹…"
                : "最近使用记录和未读通知会在这里逐步生成"}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
