import { useRef, useState } from "react";
import type { Character, InnerVoiceRecord, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import { getConversationId, type CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { findInnerVoiceByMessage, initializeInnerVoiceRepository, listInnerVoicesByGroup, listInnerVoicesByRelation, loadInnerVoiceRecords, saveInnerVoiceRecord, type InnerVoiceScope } from "../../../core/storage/repositories/innerVoiceRepository";
import { generateInnerVoice } from "../services/innerVoiceService";
import { serializeMessageContentForPrompt } from "../prompts/messagePromptSerializer";

interface UseInnerVoiceOptions {
  characters: Character[];
  activeCharacter?: Character | null;
  activeRelationship?: CharacterRelationship | null;
  messages: Message[];
  memories: MemoryItem[];
  settings: UserSettings;
  worldBookEntries: WorldBookEntry[];
  getOfflineContinuityContext: (triggerMessage: Message) => string | undefined;
}

export function useInnerVoice({ characters, activeCharacter, activeRelationship, messages, settings, worldBookEntries, getOfflineContinuityContext }: UseInnerVoiceOptions) {
  const [record, setRecord] = useState<InnerVoiceRecord | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [mode, setMode] = useState<"current" | "history">("current");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<InnerVoiceRecord[]>([]);
  // Deduplicates concurrent automatic backfills and explicit refreshes for the
  // same message while still allowing a later user-initiated retry.
  const requestsRef = useRef(new Set<string>());
  const lastOpenRef = useRef<{ targetCharacterId: string; triggerMessage: Message } | null>(null);

  const close = () => { setRecord(null); setCharacter(null); setMode("current"); setError(null); };
  const getEmotion = (value: InnerVoiceRecord) => value.emotionalState?.trim() || `当前情绪：${value.state || "难以言说的心绪"}`;

  const resolveStoredRecord = (targetCharacterId: string, triggerMessage: Message) => {
    const canonicalCharacterId = resolveCanonicalCharacterId(targetCharacterId, characters);
    const targetCharacter = characters.find((item) => item.id === canonicalCharacterId);
    if (!targetCharacter) return { record: undefined, history: [] as InnerVoiceRecord[] };
    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId
      ? activeRelationship?.conversationId || getConversationId(relationId)
      : triggerMessage.conversationId || (groupId ? `group:${groupId}` : undefined);
    if (!conversationId || (!relationId && !groupId)) return { record: undefined, history: [] as InnerVoiceRecord[] };
    const scope: InnerVoiceScope = relationId
      ? { kind: "direct", relationId, conversationId, characterId: canonicalCharacterId, userIdentityId: activeRelationship?.userIdentityId || settings.activeIdentityId, messageId: triggerMessage.id }
      : { kind: "group", groupId: groupId!, conversationId, characterId: canonicalCharacterId, userIdentityId: settings.activeIdentityId, messageId: triggerMessage.id };
    const stored = loadInnerVoiceRecords([]).value;
    const scopedHistory = relationId
      ? listInnerVoicesByRelation(stored, relationId, conversationId, canonicalCharacterId, activeRelationship?.userIdentityId || settings.activeIdentityId)
      : listInnerVoicesByGroup(stored, groupId!, conversationId, canonicalCharacterId, 10, settings.activeIdentityId);
    const existing = findInnerVoiceByMessage(stored, scope);
    const triggerSummary = serializeMessageContentForPrompt(triggerMessage, {
      mode: "history",
      userName: settings.name,
      characterName: targetCharacter.name,
    }).slice(0, 120);
    return {
      record: existing || scopedHistory.find((item) => item.triggerMessageSummary === triggerSummary),
      history: scopedHistory,
    };
  };

  const refreshHistory = async () => {
    await initializeInnerVoiceRepository([]);
    const lastOpen = lastOpenRef.current;
    if (!lastOpen) return;
    const canonicalCharacterId = resolveCanonicalCharacterId(lastOpen.targetCharacterId, characters);
    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId
      ? activeRelationship?.conversationId || getConversationId(relationId)
      : lastOpen.triggerMessage.conversationId || (groupId ? `group:${groupId}` : undefined);
    if (!conversationId || (!relationId && !groupId)) return;
    const stored = loadInnerVoiceRecords([]).value;
    setHistory(relationId
      ? listInnerVoicesByRelation(stored, relationId, conversationId, canonicalCharacterId, activeRelationship?.userIdentityId || settings.activeIdentityId)
      : listInnerVoicesByGroup(stored, groupId!, conversationId, canonicalCharacterId, 10, settings.activeIdentityId));
  };

  const changeMode = (nextMode: "current" | "history") => {
    setMode(nextMode);
    const lastOpen = lastOpenRef.current;
    if (!lastOpen) return;
    if (nextMode === "history") {
      void refreshHistory();
      return;
    }
    const current = resolveStoredRecord(lastOpen.targetCharacterId, lastOpen.triggerMessage);
    setRecord(current.record || null);
    setError(null);
  };

  /** Synchronizes an inline record that finished after the modal was opened. */
  const syncInlineRecord = (generated: InnerVoiceRecord) => {
    const lastOpen = lastOpenRef.current;
    if (!lastOpen) return;
    const current = resolveStoredRecord(lastOpen.targetCharacterId, lastOpen.triggerMessage);
    const isCurrentRecord = current.record?.id === generated.id
      || (generated.messageId === lastOpen.triggerMessage.id
        && (generated.relationId === activeRelationship?.id
          || generated.groupId === (activeCharacter?.isGroupChat ? activeCharacter.id : undefined))
        && generated.conversationId === (activeRelationship
          ? activeRelationship.conversationId || getConversationId(activeRelationship.id)
          : lastOpen.triggerMessage.conversationId || (activeCharacter?.isGroupChat ? `group:${activeCharacter.id}` : undefined))
        && (!generated.userIdentityId || generated.userIdentityId === (activeRelationship?.userIdentityId || settings.activeIdentityId)));
    if (!isCurrentRecord) return;
    setRecord(generated);
    setHistory((previous) => [generated, ...previous.filter((item) => item.id !== generated.id)]);
  };

  const open = async (targetCharacterId: string, triggerMessage: Message, force = false) => {
    await initializeInnerVoiceRepository([]);
    const canonicalCharacterId = resolveCanonicalCharacterId(targetCharacterId, characters);
    const targetCharacter = characters.find((item) => item.id === canonicalCharacterId);
    if (!targetCharacter) return;
    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId
      ? activeRelationship?.conversationId || getConversationId(relationId)
      : triggerMessage.conversationId || (groupId ? `group:${groupId}` : undefined);
    if (!conversationId || (!relationId && !groupId)) return;
    // Keep direct-chat context strict. A stale message from another contact
    // must never be used to generate this character's private reflection.
    if (relationId && triggerMessage.relationId && triggerMessage.relationId !== relationId) return;
    const scope: InnerVoiceScope = relationId
      ? { kind: "direct", relationId, conversationId, characterId: canonicalCharacterId, userIdentityId: activeRelationship?.userIdentityId || settings.activeIdentityId, messageId: triggerMessage.id }
      : { kind: "group", groupId: groupId!, conversationId, characterId: canonicalCharacterId, userIdentityId: settings.activeIdentityId, messageId: triggerMessage.id };
    const listHistory = (records: readonly InnerVoiceRecord[]) => relationId
      ? listInnerVoicesByRelation(records, relationId, conversationId, canonicalCharacterId, activeRelationship?.userIdentityId || settings.activeIdentityId)
      : listInnerVoicesByGroup(records, groupId!, conversationId, canonicalCharacterId, 10, settings.activeIdentityId);
    lastOpenRef.current = { targetCharacterId: canonicalCharacterId, triggerMessage };
    setCharacter(targetCharacter); setMode("current"); setError(null);
    const current = resolveStoredRecord(canonicalCharacterId, triggerMessage);
    setHistory(current.history);
    // Some legacy/segmented replies persisted a different message id while
    // retaining the same message summary. Recover only within this exact
    // relationship/group scope; never fall back to the newest voice.
    const compatibleExisting = current.record;
    // Current voice must belong to the message that was clicked. Never use a
    // different message's newest record as a fallback, otherwise every
    // message without an exact match would display the same inner voice.
    if (compatibleExisting && !force) { setRecord(compatibleExisting); setLoading(false); return; }
    // New replies normally carry an inline record. Legacy replies, interrupted
    // turns, and storage failures may not; clicking their avatar backfills the
    // exact message instead of leaving the modal in a permanent empty state.
    const requestKey = `${scope.kind}:${scope.kind === "direct" ? scope.relationId : `${scope.groupId}:${scope.conversationId}:${scope.characterId}`}:${scope.messageId}`;
    if (requestsRef.current.has(requestKey)) return;
    requestsRef.current.add(requestKey);
    setRecord(null);
    setLoading(true);
    try {
      const scopedMessages = messages.filter((message) => relationId
        ? message.relationId === relationId
          && (!conversationId || !message.conversationId || message.conversationId === conversationId)
        : message.conversationId === conversationId
          || message.id === triggerMessage.id);
      const recentMessages = scopedMessages.some((message) => message.id === triggerMessage.id)
        ? scopedMessages
        : [...scopedMessages, triggerMessage];
      const generated = await generateInnerVoice({
        character: targetCharacter,
        relationship: relationId ? activeRelationship || undefined : undefined,
        triggerMessage,
        recentMessages,
        conversationId,
        relationId,
        groupId,
        userIdentityId: activeRelationship?.userIdentityId || settings.activeIdentityId,
        settings,
        offlineContinuityContext: getOfflineContinuityContext(triggerMessage),
        worldBookEntries,
      });
      if (!generated) {
        setError("心声生成失败，请检查模型设置后重试。");
        return;
      }
      const saved = await saveInnerVoiceRecord(generated);
      setRecord(generated);
      if (!saved.success) {
        setError("心声已生成，当前仍可查看；IndexedDB 保存失败，请稍后重试。聊天消息不会因此被拦截。");
        return;
      }
      setHistory(listHistory(loadInnerVoiceRecords([]).value));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "心声生成失败，请检查模型设置后重试。");
    } finally {
      requestsRef.current.delete(requestKey);
      setLoading(false);
    }
  };

  const refresh = async () => {
    const lastOpen = lastOpenRef.current;
    if (!lastOpen) return;
    await open(lastOpen.targetCharacterId, lastOpen.triggerMessage, true);
  };

  return { record, character, mode, setMode: changeMode, loading, error, history, open, refresh, close, getEmotion, syncInlineRecord };
}
