import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock3,
  MessageSquareText,
  Plus,
  Settings2,
  Send,
  ShieldQuestion,
  UserRound,
  X,
} from "lucide-react";
import type { Character, UserIdentity, UserSettings, WorldBookEntry } from "../types";
import type { CharacterRelationship } from "../domain/relationship/characterRelationship";
import { getSmsPhone, loadSmsStore, saveSmsStore, upsertSmsPhone } from "../features/sms/smsStorage";
import {
  SMS_DEFAULT_PHONE,
  isSmsPhoneNumber,
  type SmsAnchorChoice,
  type SmsConversationPreview,
  type SmsMessage,
  type SmsStore,
  type SmsTimeline,
  type SmsTimelineKind,
} from "../domain/sms/smsTypes";
import { createAnchoredSmsTimeline, createUnanchoredSmsTimeline } from "../features/sms/smsTimeline";
import { resolveSmsConversationActivity } from "../features/sms/smsInbox";
import { buildSmsHistory, buildSmsMemoryNote, buildSmsSystemPrompt, selectSmsWorldBookEntries } from "../features/sms/smsPrompt";
import { apiChat } from "../utils/apiHelper";
import { ChatAvatar } from "../features/chat/components/ChatAvatar";

interface AppSmsProps {
  activeIdentity: UserIdentity;
  identities?: UserIdentity[];
  characters: Character[];
  relationships: CharacterRelationship[];
  worldBookEntries?: WorldBookEntry[];
  settings: UserSettings;
  onClose: () => void;
}

type SmsPage = "list" | "detail" | "settings";

const KIND_OPTIONS: Array<{ value: SmsTimelineKind; label: string }> = [
  { value: "past", label: "过去" },
  { value: "present", label: "当前" },
  { value: "independent_future", label: "独立未来" },
  { value: "continuation_future", label: "延续未来" },
  { value: "custom", label: "自定义" },
];

const cloneStore = (store: SmsStore): SmsStore => ({
  version: 1,
  phones: [...store.phones],
  timelines: [...store.timelines],
  messages: [...store.messages],
  memories: [...store.memories],
});

const formatTime = (timestamp?: number): string => {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
};

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(timestamp);
};

export default function AppSms({ activeIdentity, identities = [], characters, relationships, worldBookEntries = [], settings, onClose }: AppSmsProps) {
  const [store, setStore] = useState<SmsStore>(() => loadSmsStore().value);
  const storeRef = useRef(store);
  const [page, setPage] = useState<SmsPage>("list");
  const [settingsReturnPage, setSettingsReturnPage] = useState<Exclude<SmsPage, "settings">>("list");
  const [identityPickerOpen, setIdentityPickerOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [selectedIdentityId, setSelectedIdentityId] = useState(activeIdentity.id);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [showDeleteSmsMemoryModal, setShowDeleteSmsMemoryModal] = useState(false);
  const [manualTimeline, setManualTimeline] = useState({ label: "", kind: "custom" as SmsTimelineKind, timelineTime: "", relationshipHint: "", knowsCurrentTimeline: false });
  const [anchorDraft, setAnchorDraft] = useState({ label: "恋人时间线", kind: "custom" as SmsTimelineKind, timelineTime: "", relationshipHint: "恋人", knowsCurrentTimeline: false });
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesViewportRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    storeRef.current = store;
    saveSmsStore(store);
  }, [store]);

  useEffect(() => {
    setSelectedIdentityId(activeIdentity.id);
  }, [activeIdentity.id]);

  const selectedIdentity = identities.find((identity) => identity.id === selectedIdentityId) || activeIdentity;
  const selectedPhone = getSmsPhone(store, selectedIdentityId);
  const identityChoices = useMemo(() => {
    const all = [activeIdentity, ...identities.filter((identity) => identity.id !== activeIdentity.id)];
    const primaryOnly = all.filter((identity) => identity.kind !== "alias" && !identity.archived);
    return primaryOnly.length > 0 ? primaryOnly : all.slice(0, 1);
  }, [activeIdentity, identities]);

  useEffect(() => {
    if (!identityChoices.some((identity) => identity.id === selectedIdentityId)) {
      setSelectedIdentityId(identityChoices[0]?.id || activeIdentity.id);
    }
  }, [activeIdentity.id, identityChoices, selectedIdentityId]);
  useEffect(() => {
    setPhoneDraft(selectedPhone);
  }, [selectedPhone]);

  const friendCharacters = useMemo(() => {
    const friendIds = new Set(
      relationships
        .filter((relationship) => relationship.userIdentityId === selectedIdentityId && relationship.communicationStatus !== "blocked")
        .map((relationship) => relationship.characterId),
    );
    const related = characters.filter((character) => friendIds.has(character.id));
    return related.length > 0 ? related : characters.filter((character) => !character.isGroupChat);
  }, [characters, relationships, selectedIdentityId]);

  const selectedCharacter = selectedCharacterId ? characters.find((character) => character.id === selectedCharacterId) : undefined;
  const timelinesForCharacter = useMemo(() => selectedCharacterId
    ? store.timelines.filter((timeline) => timeline.ownerIdentityId === selectedIdentityId && timeline.phoneNumber === selectedPhone && timeline.characterId === selectedCharacterId).sort((a, b) => b.updatedAt - a.updatedAt)
    : [], [selectedCharacterId, selectedIdentityId, selectedPhone, store.timelines]);
  const selectedTimeline = selectedTimelineId
    ? store.timelines.find((timeline) => timeline.id === selectedTimelineId
      && timeline.ownerIdentityId === selectedIdentityId
      && timeline.phoneNumber === selectedPhone
      && (!selectedCharacterId || timeline.characterId === selectedCharacterId))
    : timelinesForCharacter[0];
  const selectedMessages = selectedTimeline
    ? store.messages.filter((message) => message.timelineId === selectedTimeline.id).sort((a, b) => a.receivedAt - b.receivedAt)
    : [];

  useEffect(() => {
    if (page !== "detail" || !selectedTimeline) return;
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, selectedTimeline?.id, selectedMessages.length, isSending]);

  const persistStore = (next: SmsStore) => {
    storeRef.current = next;
    setStore(next);
  };

  const markTimelineRead = (timelineId: string) => {
    const current = storeRef.current;
    const readAt = Date.now();
    if (!current.messages.some((message) => message.timelineId === timelineId && message.sender === "character" && !message.readAt)) return;
    persistStore({
      ...cloneStore(current),
      messages: current.messages.map((message) => message.timelineId === timelineId && message.sender === "character" && !message.readAt
        ? { ...message, readAt }
        : message),
    });
  };

  const ensureTimeline = (characterId: string): SmsTimeline => {
    const existing = storeRef.current.timelines
      .filter((timeline) => timeline.ownerIdentityId === selectedIdentityId && timeline.phoneNumber === selectedPhone && timeline.characterId === characterId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (existing) return existing;
    const created = createUnanchoredSmsTimeline({ ownerIdentityId: selectedIdentityId, phoneNumber: selectedPhone, characterId });
    persistStore({ ...cloneStore(storeRef.current), timelines: [...storeRef.current.timelines, created] });
    return created;
  };

  const openCharacter = (characterId: string) => {
    const timeline = ensureTimeline(characterId);
    markTimelineRead(timeline.id);
    setSelectedCharacterId(characterId);
    setSelectedTimelineId(timeline.id);
    setPage("detail");
    setError(null);
  };

  const openTimeline = (timeline: SmsTimeline) => {
    markTimelineRead(timeline.id);
    setSelectedCharacterId(timeline.characterId);
    setSelectedTimelineId(timeline.id);
    setPage("detail");
    setError(null);
  };

  const openSettings = (fromPage: Exclude<SmsPage, "settings">) => {
    setSettingsReturnPage(fromPage);
    setPage("settings");
    setError(null);
  };

  const clearSmsChatHistoryAndMemory = () => {
    if (!selectedTimeline) return;
    const timelineId = selectedTimeline.id;
    const current = cloneStore(storeRef.current);
    persistStore({
      ...current,
      messages: current.messages.filter((message) => message.timelineId !== timelineId),
      memories: current.memories.filter((memory) => memory.timelineId !== timelineId),
      timelines: current.timelines.map((timeline) => timeline.id === timelineId
        ? { ...timeline, updatedAt: Date.now() }
        : timeline),
    });
    setShowDeleteSmsMemoryModal(false);
    setError(null);
  };

  const savePhone = () => {
    if (!isSmsPhoneNumber(phoneDraft)) {
      setError("手机号需要是恰好 13 位数字。短信记录会按身份和手机号分别保存。");
      return;
    }
    persistStore(upsertSmsPhone(storeRef.current, selectedIdentityId, phoneDraft));
    setError(null);
  };

  const appendMessage = (message: SmsMessage) => {
    const next = cloneStore(storeRef.current);
    const storedMessage = message.sender === "character" && page === "detail" && selectedTimelineId === message.timelineId
      ? { ...message, readAt: message.receivedAt }
      : message;
    next.messages.push(storedMessage);
    next.timelines = next.timelines.map((timeline) => timeline.id === storedMessage.timelineId ? { ...timeline, updatedAt: storedMessage.receivedAt } : timeline);
    const note = buildSmsMemoryNote(storedMessage.sender, storedMessage.content);
    const existingMemory = next.memories.find((memory) => memory.timelineId === storedMessage.timelineId);
    if (note) {
      if (existingMemory) existingMemory.notes = [...existingMemory.notes, note].slice(-20);
      else next.memories.push({ timelineId: storedMessage.timelineId, characterId: storedMessage.characterId, ownerIdentityId: storedMessage.ownerIdentityId, phoneNumber: storedMessage.phoneNumber, notes: [note], updatedAt: storedMessage.receivedAt });
    }
    persistStore(next);
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || !selectedCharacter || !selectedTimeline || isSending) return;
    const now = Date.now();
    const userMessage: SmsMessage = {
      id: `sms-${now}-user`,
      timelineId: selectedTimeline.id,
      characterId: selectedCharacter.id,
      ownerIdentityId: selectedIdentityId,
      phoneNumber: selectedPhone,
      sender: "user",
      content,
      receivedAt: now,
      timelineTime: selectedTimeline.timelineTime,
    };
    appendMessage(userMessage);
    setDraft("");
    setIsSending(true);
    setError(null);
    try {
      const scopedWorldBook = selectSmsWorldBookEntries(worldBookEntries, selectedCharacter.id, selectedIdentityId);
      const memory = storeRef.current.memories.find((item) => item.timelineId === selectedTimeline.id);
      const response = await apiChat({
        message: content,
        history: buildSmsHistory(storeRef.current.messages.filter((message) => message.timelineId === selectedTimeline.id && message.id !== userMessage.id)),
        systemInstruction: buildSmsSystemPrompt({ character: selectedCharacter, timeline: selectedTimeline, activeIdentity: selectedIdentity, worldBookEntries: scopedWorldBook, memory }),
        apiKey: settings.apiKey,
        model: settings.selectedModel,
        apiEndpoint: settings.apiEndpoint,
        apiTemperature: settings.apiTemperature,
        streamCompatible: false,
        scenario: "sms-time-space",
        purpose: "chat_reply",
        characterId: selectedCharacter.id,
        conversationId: `sms:${selectedTimeline.id}`,
        contextItems: ["sms-only-history", "sms-timeline", "worldbook"],
        maxOutputTokens: 700,
      });
      const replyParts = response.text.split(/\n{2,}/u).map((part) => part.trim()).filter(Boolean).slice(0, 6);
      replyParts.forEach((part, index) => appendMessage({
        id: `sms-${Date.now()}-${index}-character`,
        timelineId: selectedTimeline.id,
        characterId: selectedCharacter.id,
        ownerIdentityId: selectedIdentityId,
        phoneNumber: selectedPhone,
        sender: "character",
        content: part,
        receivedAt: Date.now() + index,
        timelineTime: selectedTimeline.timelineTime,
      }));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "短信暂时没有送达，请检查 API 设置后重试。");
    } finally {
      setIsSending(false);
    }
  };

  const createManualTimeline = () => {
    if (!selectedCharacter) {
      setError("请先进入一个角色的短信页面，再从设置创建时间线。");
      return;
    }
    const timeline = createAnchoredSmsTimeline({ ownerIdentityId: selectedIdentityId, phoneNumber: selectedPhone, characterId: selectedCharacter.id, ...manualTimeline });
    persistStore({ ...cloneStore(storeRef.current), timelines: [...storeRef.current.timelines, timeline] });
    setManualOpen(false);
    openTimeline(timeline);
  };

  const confirmAnchor = (choice: SmsAnchorChoice) => {
    if (!selectedCharacter || !selectedTimeline) return;
    const nextTimeline = createAnchoredSmsTimeline({ ownerIdentityId: selectedIdentityId, phoneNumber: selectedPhone, characterId: selectedCharacter.id, ...anchorDraft });
    const current = cloneStore(storeRef.current);
    const migratedMessages = choice === "convert_current"
      ? current.messages.map((message) => message.timelineId === selectedTimeline.id ? { ...message, timelineId: nextTimeline.id } : message)
      : current.messages;
    const migratedMemories = choice === "convert_current"
      ? current.memories.map((memory) => memory.timelineId === selectedTimeline.id ? { ...memory, timelineId: nextTimeline.id } : memory)
      : current.memories;
    const timelines = choice === "convert_current"
      ? current.timelines.filter((timeline) => timeline.id !== selectedTimeline.id).concat(nextTimeline)
      : current.timelines.concat(nextTimeline);
    persistStore({ ...current, timelines, messages: migratedMessages, memories: migratedMemories });
    setSelectedTimelineId(nextTimeline.id);
    setAnchorOpen(false);
  };

  const previews: SmsConversationPreview[] = useMemo(() => friendCharacters.map((character) => {
    const timelines = store.timelines.filter((timeline) => timeline.ownerIdentityId === selectedIdentityId && timeline.phoneNumber === selectedPhone && timeline.characterId === character.id);
    const activity = resolveSmsConversationActivity(timelines, store.messages);
    const timeline = activity.latestTimeline || createUnanchoredSmsTimeline({ ownerIdentityId: selectedIdentityId, phoneNumber: selectedPhone, characterId: character.id });
    return { character, timeline, ...activity };
  }).sort((left, right) => {
    if (right.unreadCount !== left.unreadCount) return right.unreadCount - left.unreadCount;
    return right.lastActivityAt - left.lastActivityAt;
  }), [friendCharacters, selectedIdentityId, selectedPhone, store.messages, store.timelines]);

  const totalUnreadCount = previews.reduce((total, preview) => total + preview.unreadCount, 0);

  const header = (title: string, back?: () => void) => (
    <header className="grid shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 text-[var(--text-primary)] backdrop-blur-xl">
      <button type="button" onClick={back || onClose} className="app-nav-icon-button grid h-9 w-9 place-items-center" aria-label={back ? "返回" : "关闭短信"}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="flex min-w-0 items-center justify-center gap-2 truncate text-center text-base font-bold tracking-tight text-[var(--text-primary)]"><span className="truncate">{title}</span>{page === "list" && totalUnreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff3b30] px-1.5 text-[10px] font-bold text-white" aria-label={`${totalUnreadCount} 条未读`}>{totalUnreadCount > 99 ? "99+" : totalUnreadCount}</span>}</h1>
      <div className="flex h-9 w-9 items-center justify-center">
        {page === "list" && <button type="button" onClick={() => openSettings("list")} className="app-nav-icon-button grid h-9 w-9 place-items-center" aria-label="短信设置"><Settings2 className="h-5 w-5" /></button>}
      </div>
    </header>
  );

  return (
    <div data-theme-page="sms" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)] font-sans text-[var(--text-primary)]">
      <style>{`
        .phone-screen-container [data-theme-page="sms"] textarea.sms-composer-input {
          box-sizing: border-box;
          padding: 8px 16px !important;
          line-height: 20px !important;
        }
      `}</style>
      {page === "list" && (
        <>
          {header("短信")}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]"><UserRound className="h-4 w-4 shrink-0" aria-hidden="true" /><span>当前人设</span></div>
            <button type="button" onClick={() => setIdentityPickerOpen(true)} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-bold text-[var(--text-primary)] active:bg-[var(--surface-muted)]" aria-label="选择短信人设"><span className="max-w-[12rem] truncate">{selectedIdentity.name || "未命名人设"}</span><ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" /></button>
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface)]">
            {previews.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center text-[var(--text-secondary)]"><MessageSquareText className="mb-3 h-10 w-10 text-[var(--text-secondary)]/50" /><p className="text-sm font-bold text-[var(--text-primary)]">还没有可用联系人</p><p className="mt-1 text-xs leading-5">先在聊天或档案馆建立好友关系，短信会自动出现对应的对话入口。</p></div>
            ) : previews.map(({ character, latestMessage, unreadCount }) => (
              <button type="button" key={character.id} onClick={() => openCharacter(character.id)} className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]">
                <div className="relative shrink-0"><ChatAvatar src={character.avatar} alt={`${character.name}头像`} name={character.name} className="h-12 w-12 rounded-full bg-[var(--surface-muted)] object-cover text-xl shadow-inner" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[#ff3b30] px-1 text-[10px] font-bold leading-none text-white" aria-label={`${unreadCount} 条未读`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}</div>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className={`truncate text-[15px] ${unreadCount > 0 ? "font-extrabold text-[var(--text-primary)]" : "font-bold text-[var(--text-primary)]"}`}>{character.name}</span><span className="shrink-0 text-[10px] text-[var(--text-secondary)]">{formatDate(latestMessage?.receivedAt)}</span></div><p className={`mt-1 truncate text-xs ${unreadCount > 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{latestMessage?.content || "开始一段未知时空的短信"}</p></div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
              </button>
            ))}
          </main>
        </>
      )}

      {page === "detail" && selectedCharacter && selectedTimeline && (
        <>
          <header className="grid shrink-0 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 text-[var(--text-primary)] backdrop-blur-xl">
            <button type="button" onClick={() => setPage("list")} className="app-nav-icon-button grid h-9 w-9 place-items-center" aria-label="返回短信列表"><ChevronLeft className="h-5 w-5" /></button>
            <div className="min-w-0 text-center"><h1 className="truncate text-base font-bold tracking-tight text-[var(--text-primary)]">{selectedCharacter.name}</h1><p className="text-[10px] text-[var(--text-secondary)]">短信 · {selectedTimeline.mode === "unanchored" ? "未知时空" : selectedTimeline.label}</p></div>
            <button type="button" onClick={() => openSettings("detail")} className="app-nav-icon-button grid h-9 w-9 place-items-center" aria-label="短信设置"><Settings2 className="h-5 w-5" /></button>
          </header>
          <main ref={messagesViewportRef} className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-muted)] px-3 py-5">
            <div className="mx-auto mb-5 flex max-w-[25rem] items-center justify-center gap-2 text-[10px] text-[var(--text-secondary)]"><Clock3 className="h-3.5 w-3.5" /><span>真实收发时间与时间线时间分开保存</span></div>
            {selectedMessages.length === 0 && <div className="mx-auto mt-20 max-w-[17rem] rounded-2xl bg-[var(--surface)]/80 px-4 py-3 text-center text-xs leading-5 text-[var(--text-secondary)] shadow-sm"><ShieldQuestion className="mx-auto mb-2 h-5 w-5 text-[var(--accent)]" />这是一个陌生号码。先发一条短信，看看这个时空里的 {selectedCharacter.name} 会如何回应。</div>}
            <div className="mx-auto flex max-w-[25rem] flex-col gap-2">
              {selectedMessages.map((message, index) => <React.Fragment key={message.id}><div className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-[20px] px-3.5 py-2.5 text-[15px] leading-6 shadow-sm ${message.sender === "user" ? "rounded-br-[7px] bg-[var(--accent)] text-[var(--accent-contrast)]" : message.sender === "system" ? "bg-transparent px-1 text-center text-xs text-[var(--text-secondary)] shadow-none" : "rounded-bl-[7px] bg-[var(--surface)] text-[var(--text-primary)]"}`}>{message.content}</div></div>{(index === selectedMessages.length - 1 || selectedMessages[index + 1]?.sender !== message.sender) && <div className={`text-[9px] text-[var(--text-secondary)] ${message.sender === "user" ? "text-right" : "text-left"}`}>{formatTime(message.receivedAt)}{message.timelineTime ? ` · ${message.timelineTime}` : ""}</div>}</React.Fragment>)}
              {isSending && <div className="flex justify-start"><div className="rounded-[20px] rounded-bl-[7px] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-secondary)] shadow-sm">正在输入…</div></div>}
            </div>
          </main>
          {error && <button type="button" onClick={() => setError(null)} className="shrink-0 border-t border-rose-100 bg-rose-50 px-4 py-2 text-left text-[11px] leading-5 text-rose-600">{error}</button>}
          <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
            <textarea ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={1} placeholder="短信内容…" className="sms-composer-input h-10 min-h-10 max-h-28 flex-1 resize-none rounded-[20px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-sm leading-5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20" />
            <button type="button" onClick={() => void sendMessage()} disabled={!draft.trim() || isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-secondary)]" aria-label="发送短信"><Send className="h-4 w-4" /></button>
          </footer>
        </>
      )}

      {page === "settings" && (
        <>
          {header("短信设置", () => setPage(settingsReturnPage))}
          <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--app-bg)] px-4 py-4">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm"><h2 className="text-sm font-extrabold text-[var(--text-primary)]">人设与手机号</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">不同人设或手机号使用完全隔离的短信空间。马甲不会出现在短信联系人选择中。</p><label className="mt-4 block text-xs font-bold text-[var(--text-secondary)]">当前人设<div className="relative mt-1"><input value={selectedIdentity.name || "未命名人设"} readOnly onClick={() => setIdentityPickerOpen(true)} aria-label="选择短信人设" className="h-11 w-full cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 pr-10 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /><button type="button" onClick={() => setIdentityPickerOpen(true)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-[var(--text-secondary)]" aria-label="打开人设选择"><ChevronDown className="h-4 w-4" aria-hidden="true" /></button></div></label><label className="mt-3 block text-xs font-bold text-[var(--text-secondary)]">我的手机号（13 位）<input value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value.replace(/\D/gu, "").slice(0, 13))} inputMode="numeric" maxLength={13} placeholder={SMS_DEFAULT_PHONE} className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm tracking-[0.15em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /></label><button type="button" onClick={savePhone} className="mt-3 min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] active:opacity-90">保存手机号</button></section>
            <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm"><div><h2 className="text-sm font-extrabold text-[var(--text-primary)]">时间线</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">默认先保持陌生；明确后再锚定或创建新世界线。</p></div><div className="mt-3 grid grid-cols-2 gap-2">{selectedCharacter && selectedTimeline && <button type="button" onClick={() => setAnchorOpen(true)} className="min-h-11 rounded-xl bg-[var(--accent)] px-3 text-xs font-bold text-[var(--accent-contrast)] active:opacity-90">确认时间线</button>}<button type="button" onClick={() => setManualOpen(true)} className={`flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-xs font-bold text-[var(--text-primary)] active:opacity-80 ${selectedCharacter && selectedTimeline ? "" : "col-span-2"}`}><Plus className="h-3.5 w-3.5" aria-hidden="true" />手动创建</button></div>{selectedCharacter ? <div className="mt-3 space-y-2">{timelinesForCharacter.map((timeline) => <button type="button" key={timeline.id} onClick={() => openTimeline(timeline)} className="flex min-h-12 w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-left active:opacity-80"><span><span className="block text-xs font-bold text-[var(--text-primary)]">{timeline.label}</span><span className="mt-0.5 block text-[10px] text-[var(--text-secondary)]">{timeline.mode === "unanchored" ? "未锚定探索" : `${timeline.kind} · ${timeline.timelineTime || "时间未知"}`}</span></span><ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" /></button>)}</div> : <p className="mt-3 text-xs text-[var(--text-secondary)]">从短信列表进入角色后，可管理该角色的时间线。</p>}</section>
            {settingsReturnPage === "detail" && selectedCharacter && selectedTimeline && (
              <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-sm">
                <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-extrabold text-[var(--text-primary)]">危险操作</h2></div>
                <button type="button" onClick={() => setShowDeleteSmsMemoryModal(true)} className="flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-bold text-[#ff3b30] transition-colors hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]"><span>删除聊天记忆</span><ChevronRight className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" /></button>
              </section>
            )}
            {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-600">{error}</p>}
          </main>
        </>
      )}

      {identityPickerOpen && <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/25 p-3 sm:items-center"><div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-[var(--text-primary)] shadow-2xl"><div className="flex items-center justify-between px-1"><div><h2 className="text-base font-extrabold text-[var(--text-primary)]">选择短信人设</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">仅显示主人设，马甲不会参与短信隔离。</p></div><button type="button" onClick={() => setIdentityPickerOpen(false)} className="app-nav-icon-button grid h-9 w-9 place-items-center" aria-label="关闭人设选择"><X className="h-5 w-5" /></button></div><div className="mt-3 space-y-1">{identityChoices.map((identity) => <button type="button" key={identity.id} onClick={() => { setSelectedIdentityId(identity.id); setIdentityPickerOpen(false); }} className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left transition-colors ${identity.id === selectedIdentityId ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-primary)] hover:bg-[var(--surface-muted)] active:bg-[var(--surface-muted)]"}`}><span className="text-sm font-semibold">{identity.name || "未命名人设"}</span>{identity.id === selectedIdentityId && <Check className="h-4 w-4" aria-hidden="true" />}</button>)}</div></div></div>}

      {anchorOpen && selectedCharacter && selectedTimeline && <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"><div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-base font-extrabold">确认这段关系与时间</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">未锚定探索不会被强行改写。请选择如何保存。</p></div><button type="button" onClick={() => setAnchorOpen(false)} className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="关闭"><X className="h-5 w-5" /></button></div><div className="mt-4 space-y-2"><input value={anchorDraft.label} onChange={(event) => setAnchorDraft((current) => ({ ...current, label: event.target.value }))} placeholder="时间线名称" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /><select value={anchorDraft.kind} onChange={(event) => setAnchorDraft((current) => ({ ...current, kind: event.target.value as SmsTimelineKind }))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input value={anchorDraft.timelineTime} onChange={(event) => setAnchorDraft((current) => ({ ...current, timelineTime: event.target.value }))} placeholder="时间（可留空，保留未知感）" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /><input value={anchorDraft.relationshipHint} onChange={(event) => setAnchorDraft((current) => ({ ...current, relationshipHint: event.target.value }))} placeholder="关系方向，例如：恋人时间线" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /></div><label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={anchorDraft.knowsCurrentTimeline} onChange={(event) => setAnchorDraft((current) => ({ ...current, knowsCurrentTimeline: event.target.checked }))} />允许延续这条短信线此前发生的事</label><div className="mt-5 grid grid-cols-1 gap-2"><button type="button" onClick={() => confirmAnchor("convert_current")} className="rounded-xl bg-[var(--accent)] px-4 py-3 text-xs font-bold text-[var(--accent-contrast)]">将当前对话转为此时间线</button><button type="button" onClick={() => confirmAnchor("keep_exploration")} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-xs font-bold text-[var(--text-primary)]">保留当前探索，创建新时间线</button></div></div></div>}

      {manualOpen && <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"><div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-base font-extrabold">手动创建时间线</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">创建后与当前短信历史完全隔离。</p></div><button type="button" onClick={() => setManualOpen(false)} className="rounded-full p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="关闭"><X className="h-5 w-5" /></button></div><div className="mt-4 space-y-2"><input value={manualTimeline.label} onChange={(event) => setManualTimeline((current) => ({ ...current, label: event.target.value }))} placeholder="时间线名称，例如：独立未来" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /><select value={manualTimeline.kind} onChange={(event) => setManualTimeline((current) => ({ ...current, kind: event.target.value as SmsTimelineKind }))} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">{KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input value={manualTimeline.timelineTime} onChange={(event) => setManualTimeline((current) => ({ ...current, timelineTime: event.target.value }))} placeholder="角色所处的时间或年龄" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /><input value={manualTimeline.relationshipHint} onChange={(event) => setManualTimeline((current) => ({ ...current, relationshipHint: event.target.value }))} placeholder="关系方向（可选）" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" /></div><label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={manualTimeline.knowsCurrentTimeline} onChange={(event) => setManualTimeline((current) => ({ ...current, knowsCurrentTimeline: event.target.checked }))} />延续当前短信线已发生的事</label><button type="button" onClick={createManualTimeline} className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-xs font-bold text-[var(--accent-contrast)]">创建并进入</button></div></div>}

      {showDeleteSmsMemoryModal && settingsReturnPage === "detail" && selectedCharacter && selectedTimeline && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="删除短信聊天记忆">
          <div className="w-full max-w-xs overflow-hidden rounded-3xl bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-2xl">
            <div className="space-y-2 px-6 pb-5 pt-6 text-center">
              <h3 className="text-lg font-bold">删除聊天记忆</h3>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">删除“{selectedCharacter.name}”当前短信时间线后，聊天记录和短信记忆都会被删除，且无法恢复。</p>
            </div>
            <div className="grid grid-cols-2 border-t border-[var(--border)]">
              <button type="button" onClick={() => setShowDeleteSmsMemoryModal(false)} className="border-r border-[var(--border)] py-4 text-base font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)]">取消</button>
              <button type="button" onClick={clearSmsChatHistoryAndMemory} className="py-4 text-base font-medium text-[#ff3b30] transition-colors hover:bg-rose-50">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
