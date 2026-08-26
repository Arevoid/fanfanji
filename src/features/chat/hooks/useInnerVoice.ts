import { useRef, useState } from "react";
import type { Character, InnerVoiceRecord, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { findInnerVoiceByMessage, listInnerVoicesByGroup, listInnerVoicesByRelation, loadInnerVoiceRecords, saveInnerVoiceRecords, type InnerVoiceScope } from "../../../core/storage/repositories/innerVoiceRepository";
import { generateInnerVoice } from "../services/innerVoiceService";

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
  // Retained as a compatibility marker for older callers; new turns are
  // persisted during reply delivery and never start a second request here.
  const requestsRef = useRef(new Set<string>());
  const lastOpenRef = useRef<{ targetCharacterId: string; triggerMessage: Message } | null>(null);

  const close = () => { setRecord(null); setCharacter(null); setMode("current"); setError(null); };
  const getEmotion = (value: InnerVoiceRecord) => value.emotionalState?.trim() || `当前情绪：${value.state || "难以言说的心绪"}`;

  const refreshHistory = () => {
    const lastOpen = lastOpenRef.current;
    if (!lastOpen) return;
    const canonicalCharacterId = resolveCanonicalCharacterId(lastOpen.targetCharacterId, characters);
    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId ? activeRelationship?.conversationId : lastOpen.triggerMessage.conversationId || groupId;
    if (!conversationId || (!relationId && !groupId)) return;
    const stored = loadInnerVoiceRecords([]).value;
    setHistory(relationId
      ? listInnerVoicesByRelation(stored, relationId)
      : listInnerVoicesByGroup(stored, groupId!, conversationId, canonicalCharacterId));
  };

  const changeMode = (nextMode: "current" | "history") => {
    setMode(nextMode);
    if (nextMode === "history") refreshHistory();
  };

  const open = async (targetCharacterId: string, triggerMessage: Message, force = false) => {
    const canonicalCharacterId = resolveCanonicalCharacterId(targetCharacterId, characters);
    const targetCharacter = characters.find((item) => item.id === canonicalCharacterId);
    if (!targetCharacter) return;
    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId ? activeRelationship?.conversationId : triggerMessage.conversationId || groupId;
    if (!conversationId || (!relationId && !groupId)) return;
    // Keep direct-chat context strict. A stale message from another contact
    // must never be used to generate this character's private reflection.
    if (relationId && triggerMessage.relationId && triggerMessage.relationId !== relationId) return;
    const scope: InnerVoiceScope = relationId
      ? { kind: "direct", relationId, messageId: triggerMessage.id }
      : { kind: "group", groupId: groupId!, conversationId, characterId: canonicalCharacterId, messageId: triggerMessage.id };
    const listHistory = (records: readonly InnerVoiceRecord[]) => relationId ? listInnerVoicesByRelation(records, relationId) : listInnerVoicesByGroup(records, groupId!, conversationId, canonicalCharacterId);
    lastOpenRef.current = { targetCharacterId: canonicalCharacterId, triggerMessage };
    setCharacter(targetCharacter); setMode("current"); setError(null);
    const stored = loadInnerVoiceRecords([]).value;
    const existing = findInnerVoiceByMessage(stored, scope);
    setHistory(listHistory(stored));
    // Current voice must belong to the message that was clicked. Never use a
    // different message's newest record as a fallback, otherwise every
    // message without an exact match would display the same inner voice.
    if (existing && !force) { setRecord(existing); setLoading(false); return; }
    // A normal avatar click only reads the inline record created with the chat
    // reply. Manual generation is reserved for the explicit refresh action.
    if (!force) {
      setRecord(null);
      setLoading(false);
      setError(null);
      return;
    }
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
        settings,
        offlineContinuityContext: getOfflineContinuityContext(triggerMessage),
        worldBookEntries,
      });
      if (!generated) {
        setError("心声生成失败，请检查模型设置后重试。");
        return;
      }
      const latest = loadInnerVoiceRecords([]).value;
      saveInnerVoiceRecords([...latest.filter((item) => item.id !== generated.id), generated]);
      setRecord(generated);
      setHistory(listHistory([...latest, generated]));
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

  return { record, character, mode, setMode: changeMode, loading, error, history, open, refresh, close, getEmotion };
}
