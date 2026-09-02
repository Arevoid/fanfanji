import { Character, Message, UserSettings } from "../../../types";
import type { MemoryArchiveStats } from "../../../types";
import { useRef } from "react";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { createId } from "../../../core/id/createId";
import { appendMany as appendKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { conversationSummaryRepository } from "../../../core/storage/repositories/conversationSummaryRepository";
import { createConversationSummaryRecord } from "../../characterKnowledge/services/conversationSummaryService";
import { evaluateKnowledgeWrite } from "../../../domain/characterKnowledge/knowledgeWritePolicy";
import { MemoryService, formatDelicateMemoryDiary, formatExtractedMemorySummary } from "../../../domain/memory/MemoryService";
import { commitMemoryWriteBundle } from "../../../domain/memory/memoryWriteCoordinator";
import { apiChat, apiExtractMemoriesWithModelFallback } from "../../../utils/apiHelper";

type DirectScope = { characterId: string; relationId: string; userIdentityId: string; conversationId: string };

/**
 * Selects only the part of a chat that has not crossed the last successful
 * archive marker. An explicit message list is used by the automatic pipeline
 * and is already scoped by its caller, so it bypasses the marker lookup.
 */
export function selectUnarchivedChatMessages(
  messages: readonly Message[],
  lastArchivedMessageId?: string,
  explicitMessages?: readonly Message[],
): Message[] {
  const candidates = Array.from(explicitMessages || messages);
  if (explicitMessages || !lastArchivedMessageId) return candidates;

  const markerIndex = candidates.findIndex((message) => message.id === lastArchivedMessageId);
  // If the marker is not in the loaded scope (for example, after an old
  // cleanup), reprocess the loaded scope. The canonical writer and memory
  // merge policy keep this recoverable and avoid losing unarchived content.
  return markerIndex === -1 ? candidates : candidates.slice(markerIndex + 1);
}

export function splitChatArchiveBatches(messages: readonly Message[], batchSize: number): Message[][] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: Message[][] = [];
  for (let index = 0; index < messages.length; index += safeBatchSize) {
    batches.push(Array.from(messages.slice(index, index + safeBatchSize)));
  }
  return batches;
}

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
  onSaveRelationships?: (updater: (previous: CharacterRelationship[]) => CharacterRelationship[]) => void;
  onUpdateCharacter?: (characterId: string, patch: Partial<Character>) => void | Promise<boolean>;
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
  onSaveRelationships,
  onUpdateCharacter,
  groupMembers = [],
  characters = [],
  relationships = [],
  activeIdentityId,
}: ChatMemoryExtractionOptions) {
  const lastArchiveFeedbackRef = useRef<MemoryArchiveStats | null>(null);

  const handleExtractMemories = async (manualMessagesOverride?: Message[]) => {
    if (!activeChatCharId || !activeCharacter) return 0;

    lastArchiveFeedbackRef.current = null;
    setIsCompressingMemory(true);
    try {
      const activeRelationship = activeDirectScope
        ? relationships.find((relationship) => relationship.id === activeDirectScope.relationId)
        : undefined;
      const lastArchivedMessageId = activeCharacter.isGroupChat
        ? activeCharacter.lastImmediateSummaryMsgId
        : activeRelationship?.lastImmediateSummaryMsgId;
      const unarchivedMessages = selectUnarchivedChatMessages(
        currentChatMessages,
        lastArchivedMessageId,
        manualMessagesOverride,
      );
      if (unarchivedMessages.length === 0) {
        return 0;
      }
      const configuredBatchSize = Number.isFinite(activeCharacter.historyMemoryLimit)
        ? Math.round(activeCharacter.historyMemoryLimit as number)
        : 100;
      const archiveBatchSize = Math.min(200, Math.max(10, configuredBatchSize));
      const archiveBatches = splitChatArchiveBatches(unarchivedMessages, archiveBatchSize);
      let workingMemories = [...(memories || [])];
      let totalExtracted = 0;
      const archiveStats: MemoryArchiveStats = {
        sourceMessageCount: 0,
        acceptedTruthCount: 0,
        summaryCount: 0,
        ruleCount: 0,
        compatibilityCount: 0,
        rejectedCandidateCount: 0,
      };
      const markArchiveProgress = async (lastMessage: Message) => {
        if (activeCharacter.isGroupChat) {
          if (onUpdateCharacter) {
            await onUpdateCharacter(activeCharacter.id, { lastImmediateSummaryMsgId: lastMessage.id });
          }
          return;
        }
        if (activeDirectScope && onSaveRelationships) {
          onSaveRelationships((previous) => previous.map((relation) => relation.id === activeDirectScope.relationId
            ? { ...relation, lastImmediateSummaryMsgId: lastMessage.id, updatedAt: Date.now() }
            : relation));
        }
      };

      if (activeCharacter.isGroupChat) {
        for (const messagesToCompress of archiveBatches) {
          archiveStats.sourceMessageCount += messagesToCompress.length;
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
          if (!summaryText) return -1;
          const generatedAt = Date.now();
          const sourceMessageIds = messagesToCompress.map((message) => message.id);
          const groupConversationId = `group:${activeChatCharId}`;
          const groupRecords = groupMembers.flatMap((member) => {
            const relation = findRelationshipForCanonicalCharacter(relationships, activeIdentityId || "", member.id, characters);
            if (!relation || !activeIdentityId) return [];
            const recordKey = `${activeChatCharId}:${member.id}:${sourceMessageIds[0]}:${sourceMessageIds[sourceMessageIds.length - 1]}`;
            const scope = {
              characterId: member.id,
              relationId: relation.id,
              userIdentityId: activeIdentityId,
              conversationId: groupConversationId,
            };
            const decision = evaluateKnowledgeWrite({
              id: `group-summary-claim:${recordKey}`,
              ...scope,
              kind: "fact",
              subject: "relationship",
              statement: `群聊「${activeCharacter.name}」中发生：${summaryText}`,
              temporalStatus: "past",
              source: {
                kind: "automatic_summary",
                authorship: "system",
                messageIds: sourceMessageIds,
                producer: "group-chat-summary.v1",
                evidenceKey: `group-summary:${recordKey}`,
              },
              confidence: 0.6,
              importance: 4,
              occurredAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
              recordedAt: generatedAt,
            });
            if (decision.accepted === false) {
              console.warn("Group chat summary was rejected by the canonical write policy:", decision.reason);
              return [];
            }
            const summaryRecord = createConversationSummaryRecord({
              scope,
              claims: [decision.claim],
              sourceMessageIds,
              generatedAt,
              generator: "group-chat-summary.v1",
              rangeStartAt: messagesToCompress[0]?.timestamp,
              rangeEndAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
            });
            const addition = {
              id: `group-summary:${recordKey}`,
              characterId: member.id,
              relationId: relation.id,
              userIdentityId: activeIdentityId,
              conversationId: groupConversationId,
              content: `【群聊讨论摘要：${activeCharacter.name}】\n${summaryText}`,
              timestamp: generatedAt,
              importance: 4,
              isManual: false,
              sourceKnowledgeClaimIds: [decision.claim.id],
            };
            return [{ claim: decision.claim, summary: summaryRecord, addition }];
          });
          const claims = groupRecords.map((record) => record.claim);
          const summaries = groupRecords.flatMap((record) => record.summary ? [record.summary] : []);
          const additions = groupRecords.map((record) => record.addition);
          archiveStats.acceptedTruthCount += claims.length;
          archiveStats.summaryCount += summaries.length;
          archiveStats.compatibilityCount += additions.length;
          if (additions.length > 0) {
            const nextMemories = MemoryService.mergeMemories(workingMemories, additions);
            const write = await commitMemoryWriteBundle({
              claims,
              summaries,
              memories: nextMemories,
              appendClaims: appendKnowledgeClaims,
              appendSummaries: (next) => conversationSummaryRepository.appendMany(next),
              saveMemories: (next) => {
                onSaveMemories([...next]);
                return true;
              },
            });
            if (!write.canonicalWritten || !write.summaryWritten || !write.memoriesWritten) {
              console.error("Group chat memory bundle could not be persisted:", write.error || write.summaryError || write.memoriesError);
              return -1;
            }
            workingMemories = nextMemories;
          }
          totalExtracted += additions.length;
          await markArchiveProgress(messagesToCompress[messagesToCompress.length - 1]);
        }
        lastArchiveFeedbackRef.current = { ...archiveStats };
        return totalExtracted;
      }

      if (!activeDirectScope) return 0;
      const extractionScope = activeDirectScope;

      for (const messagesToCompress of archiveBatches) {
        archiveStats.sourceMessageCount += messagesToCompress.length;
        const isDelicate = activeCharacter.archiveTemplateType === "delicate";
        const headerLabel = isDelicate ? "【心境日记归档 (细腻版)】" : "【精炼归档事件日志 (精炼版)】";
        const result = await MemoryService.extractMemories({
          character: activeCharacter,
          characterId: activeChatCharId,
          relationId: extractionScope.relationId,
          userIdentityId: extractionScope.userIdentityId,
          conversationId: extractionScope.conversationId,
          recentMessages: messagesToCompress,
          existingMemories: workingMemories,
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
        const extractedSummary = createConversationSummaryRecord({
          scope: extractionScope,
          claims: result.acceptedClaims,
          sourceMessageIds: messagesToCompress.map((message) => message.id),
          generatedAt: Date.now(),
          rangeStartAt: messagesToCompress[0]?.timestamp,
          rangeEndAt: messagesToCompress[messagesToCompress.length - 1]?.timestamp,
        });
        const nextMemories = result.extractedMemories.length > 0
          ? MemoryService.mergeMemories(workingMemories, result.extractedMemories)
          : undefined;
        const write = await commitMemoryWriteBundle({
          claims: result.acceptedClaims,
          summary: extractedSummary,
          memories: nextMemories,
          appendClaims: appendKnowledgeClaims,
          appendSummaries: (summaries) => conversationSummaryRepository.appendMany(summaries),
          saveMemories: (next) => {
            onSaveMemories([...next]);
            return true;
          },
        });
        if (!write.canonicalWritten) {
          console.error("Knowledge claims could not be persisted; compatibility Memory was not updated.", write.error);
          return -1;
        }
        if (!write.summaryWritten) {
          // Do not move the archive marker past a batch whose derived summary
          // did not persist. The canonical claims/compatibility projection are
          // idempotent, so a later retry can safely rebuild the missing cache
          // without deleting the original chat history.
          console.error("Conversation summary cache could not be persisted:", write.summaryError);
          return -1;
        }
        if (!write.memoriesWritten) {
          console.error("Compatibility memories could not be persisted:", write.memoriesError);
          return -1;
        }
        archiveStats.acceptedTruthCount += result.acceptedClaims.length;
        archiveStats.summaryCount += write.summaryWritten ? 1 : 0;
        archiveStats.compatibilityCount += result.extractedMemories.length;
        archiveStats.rejectedCandidateCount += result.rejectedCandidateCount;
        if (nextMemories) workingMemories = nextMemories;
        totalExtracted += Math.max(result.extractedMemories.length, result.acceptedClaims.length);
        await markArchiveProgress(messagesToCompress[messagesToCompress.length - 1]);
      }
      lastArchiveFeedbackRef.current = { ...archiveStats };
      return totalExtracted;
    } catch (err: any) {
      console.error("Memory extraction error:", err);
    } finally {
      setIsCompressingMemory(false);
    }
    return -1;
  };

  return {
    handleExtractMemories,
    getLastArchiveFeedback: () => lastArchiveFeedbackRef.current,
  };
}
