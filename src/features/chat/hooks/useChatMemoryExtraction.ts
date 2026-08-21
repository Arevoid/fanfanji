import { Character, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { createId } from "../../../core/id/createId";
import { appendMany as appendKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { loadConversationSummaries, saveConversationSummaries } from "../../../core/storage/repositories/conversationSummaryRepository";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary } from "../../../domain/memory/MemoryService";
import { apiChat, apiExtractMemoriesWithModelFallback } from "../../../utils/apiHelper";

type DirectScope = { characterId: string; relationId: string; userIdentityId: string; conversationId: string };

export interface ChatMemoryExtractionOptions {
  activeChatCharId?: string | null;
  activeCharacter?: Character | null;
  activeDirectScope?: DirectScope | null;
  currentChatMessages: Message[];
  memories?: any[] | null;
  settings: UserSettings;
  recallSettings?: any;
  setIsCompressingMemory: (value: boolean) => void;
  onSaveMemories: (memories: any[]) => void;
  groupMembers?: readonly Character[];
  characters?: readonly Character[];
  relationships?: readonly CharacterRelationship[];
  activeIdentityId?: string;
}

export function useChatMemoryExtraction({
  activeChatCharId,
  activeCharacter,
  activeDirectScope,
  currentChatMessages,
  memories,
  settings,
  recallSettings,
  setIsCompressingMemory,
  onSaveMemories,
  groupMembers = [],
  characters = [],
  relationships = [],
  activeIdentityId,
}: ChatMemoryExtractionOptions) {
  const handleExtractMemories = async (manualMessagesOverride?: Message[]) => {
    if (!activeChatCharId || !activeCharacter) return 0;

    setIsCompressingMemory(true);
    try {
      const limitToSearch = activeCharacter.retrievalHistoryLimit || 100;
      const messagesToCompress = (manualMessagesOverride || currentChatMessages).slice(-limitToSearch);
      if (messagesToCompress.length === 0) {
        return 0;
      }

      if (activeCharacter.isGroupChat) {
        const transcript = messagesToCompress.map((message) => `${message.sender === "user" ? settings.name : message.senderId || "成员"}：${message.content}`).join("\n");
        const summary = await apiChat({
          message: `请把下面这段群聊整理成一段简短、具体、可长期记忆的摘要。只保留已经发生的事实、重要决定和关系变化，不要逐句复述，不要添加推测，不要输出标题或解释。\n\n${transcript.slice(-12000)}`,
          history: [],
          systemInstruction: "你是群聊记忆整理器。输出 80 到 180 字的中文摘要。",
          apiKey: settings.apiKey,
          model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
          apiEndpoint: settings.apiEndpoint,
        });
        const summaryText = summary.text.trim();
        if (!summaryText) return 0;
        const additions = groupMembers.flatMap((member) => {
          const relation = findRelationshipForCanonicalCharacter(relationships, activeIdentityId || "", member.id, characters);
          return relation ? [{
            id: `group-summary:${activeChatCharId}:${Date.now()}:${member.id}`,
            characterId: member.id,
            relationId: relation.id,
            content: `【群聊讨论摘要：${activeCharacter.name}】\n${summaryText}`,
            timestamp: Date.now(),
            importance: 4,
            isManual: false,
          }] : [];
        });
        if (additions.length > 0) onSaveMemories(MemoryService.mergeMemories(memories || [], additions));
        return additions.length;
      }

      if (!activeDirectScope) return 0;
      const extractionScope = activeDirectScope;

      const isDelicate = activeCharacter.archiveTemplateType === "delicate";
      const headerLabel = isDelicate ? "【心境日记归档 (细腻版)】" : "【精炼归档事件日志 (精炼版)】";
      const result = await MemoryService.extractMemories({
        character: activeCharacter,
        characterId: activeChatCharId,
        relationId: extractionScope.relationId,
        userIdentityId: extractionScope.userIdentityId,
        conversationId: extractionScope.conversationId,
        recentMessages: messagesToCompress,
        existingMemories: memories || [],
        scenario: "chat",
        apiKey: settings.apiKey,
        model: (!recallSettings?.extractModel || recallSettings.extractModel === "default-chat-model") ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
        apiEndpoint: settings.apiEndpoint,
        templateType: activeCharacter.archiveTemplateType,
        createId: () => createId("moment"),
        currentTime: () => Date.now(),
        formatContent: (items, formatOptions) => isDelicate
          ? formatDelicateMemoryDiary(headerLabel, formatOptions?.displayItems || items)
          : formatExtractedMemorySummary(headerLabel, items),
      }, (params) => apiExtractMemoriesWithModelFallback(params, settings.selectedModel));
      if (result.apiError) {
        console.error("Extract memory API error:", result.apiError);
        return -1;
      }
      if (result.acceptedClaims.length > 0 && !appendKnowledgeClaims(result.acceptedClaims).success) {
        console.error("Knowledge claims could not be persisted; compatibility Memory was not updated.");
        return -1;
      }
      const extractedSummary = createConversationSummaryRecord({
        scope: extractionScope,
        claims: result.acceptedClaims,
        sourceMessageIds: messagesToCompress.map((message) => message.id),
        generatedAt: Date.now(),
        rangeStartAt: messagesToCompress[0]?.timestamp,
        rangeEndAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
      });
      if (extractedSummary) {
        const summaryWrite = saveConversationSummaries([...loadConversationSummaries().value, extractedSummary]);
        if (!summaryWrite.success) console.error("Conversation summary cache could not be persisted:", summaryWrite.error);
      }
      if (result.extractedMemories.length > 0) {
        onSaveMemories(MemoryService.mergeMemories(memories || [], result.extractedMemories));
      }
      return Math.max(result.extractedMemories.length, result.acceptedClaims.length);
    } catch (err: any) {
      console.error("Memory extraction error:", err);
    } finally {
      setIsCompressingMemory(false);
    }
    return -1;
  };

  return { handleExtractMemories };
}
