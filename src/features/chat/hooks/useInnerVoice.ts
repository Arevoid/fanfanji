import { useRef, useState } from "react";
import type { Character, InnerVoiceRecord, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { resolveCanonicalCharacterId } from "../../../domain/character/characterIdentity";
import { findInnerVoiceByMessage, listInnerVoicesByGroup, listInnerVoicesByRelation, loadInnerVoiceRecords, saveInnerVoiceRecords, type InnerVoiceScope } from "../../../core/storage/repositories/innerVoiceRepository";

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

  const close = () => { setRecord(null); setCharacter(null); setMode("current"); setError(null); };
  const getEmotion = (value: InnerVoiceRecord) => value.emotionalState?.trim() || `当前情绪：${value.state || "难以言说的心绪"}`;

  const open = async (targetCharacterId: string, triggerMessage: Message) => {
    const canonicalCharacterId = resolveCanonicalCharacterId(targetCharacterId, characters);
    const targetCharacter = characters.find((item) => item.id === canonicalCharacterId);
    if (!targetCharacter) return;
    const relationId = activeRelationship?.id;
    const groupId = relationId ? undefined : activeCharacter?.isGroupChat ? activeCharacter.id : undefined;
    const conversationId = relationId ? activeRelationship?.conversationId : triggerMessage.conversationId || groupId;
    if (!conversationId || (!relationId && !groupId)) return;
    const scope: InnerVoiceScope = relationId
      ? { kind: "direct", relationId, messageId: triggerMessage.id }
      : { kind: "group", groupId: groupId!, conversationId, characterId: canonicalCharacterId, messageId: triggerMessage.id };
    const listHistory = (records: readonly InnerVoiceRecord[]) => relationId ? listInnerVoicesByRelation(records, relationId) : listInnerVoicesByGroup(records, groupId!, conversationId, canonicalCharacterId);
    setCharacter(targetCharacter); setMode("current"); setError(null);
    const stored = loadInnerVoiceRecords([]).value;
    const existing = findInnerVoiceByMessage(stored, scope);
    setHistory(listHistory(stored));
    if (existing) { setRecord(existing); setLoading(false); return; }
    setRecord(null);
    setLoading(false);
    setError("这条消息没有预生成心声；新消息会在回复时随同一轮请求生成。");
  };

  return { record, character, mode, setMode, loading, error, history, open, close, getEmotion };
}
