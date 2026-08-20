import { useRef, useState } from "react";
import type { Character, InnerVoiceRecord, MemoryItem, Message, UserSettings, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { apiTranslate } from "../../../utils/apiHelper";
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
    const requestKey = relationId ? `direct:${relationId}:${triggerMessage.id}` : `group:${groupId}:${canonicalCharacterId}:${triggerMessage.id}`;
    if (requestsRef.current.has(requestKey)) return;
    requestsRef.current.add(requestKey); setLoading(true);
    try {
      const recentMessages = messages.filter((message) => activeRelationship ? message.relationId === activeRelationship.id : message.characterId === groupId && activeCharacter?.isGroupChat);
      const generated = await generateInnerVoice({ character: targetCharacter, relationship: activeRelationship, triggerMessage, recentMessages, conversationId, relationId, groupId, settings, offlineContinuityContext: getOfflineContinuityContext(triggerMessage), worldBookEntries });
      if (!generated) { setError("心声生成结果无效，请稍后重试。"); return; }
      if (targetCharacter.enableAutoTranslate) {
        try {
          const translated = await apiTranslate({ text: generated.content, apiKey: settings.apiKey || "", model: settings.selectedModel, apiEndpoint: settings.apiEndpoint });
          if (translated.text && translated.text !== generated.content) generated.translation = translated.text;
        } catch (translationError) { console.warn("Inner voice translation failed:", translationError); }
      }
      const latest = loadInnerVoiceRecords([]).value;
      const cached = findInnerVoiceByMessage(latest, scope);
      const nextRecord = cached || generated;
      if (!cached) saveInnerVoiceRecords([...latest, nextRecord]);
      setRecord(nextRecord); setHistory(listHistory(cached ? latest : [...latest, nextRecord]));
    } catch (generationError) {
      console.error("Inner voice generation failed:", generationError);
      setError("暂时无法生成心声，不影响正常聊天。");
    } finally { requestsRef.current.delete(requestKey); setLoading(false); }
  };

  return { record, character, mode, setMode, loading, error, history, open, close, getEmotion };
}
