import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Message } from "../../../types";
import { imageAssetDb } from "../../../utils/imageAssetDb";
import { loadImageGenerationRecords, removeImageGenerationRecordByMessage, saveImageGenerationRecords } from "../../../core/storage/repositories/imageGenerationRepository";
import { writeJson } from "../../../core/storage/storageAdapter";
import { RED_PACKET_STATUSES_KEY, removePaymentStatusesByRelation, removePaymentStatusesForMessages, type RedPacketStatusMap } from "../services/paymentScope";
import { isMessageInDirectScope, type DirectInteractionScope } from "../context/directInteractionScope";

interface UseChatMessageCleanupActionsOptions {
  messages: readonly Message[];
  currentChatMessages: readonly Message[];
  activeDirectScope?: DirectInteractionScope;
  onDeleteMessage?: (messageId: string, message?: Message) => void;
  onClearMessages?: (characterId: string, keepLastCount?: number, relationId?: string) => void;
  setRedPacketStatuses: Dispatch<SetStateAction<RedPacketStatusMap>>;
  setActiveMenuMsg: Dispatch<SetStateAction<Message | null>>;
  setIsMultiSelectDeleteMode: Dispatch<SetStateAction<boolean>>;
  setSelectedMessageIds: Dispatch<SetStateAction<Set<string>>>;
  selectedMessageIds: Set<string>;
  showToast: (message: string) => void;
}

/** Owns message/resource deletion while keeping identity and relation scope checks at the mutation boundary. */
export function useChatMessageCleanupActions({
  messages,
  currentChatMessages,
  activeDirectScope,
  onDeleteMessage,
  onClearMessages,
  setRedPacketStatuses,
  setActiveMenuMsg,
  setIsMultiSelectDeleteMode,
  setSelectedMessageIds,
  selectedMessageIds,
  showToast,
}: UseChatMessageCleanupActionsOptions) {
  const deleteMessageAndLinkedImage = useCallback((messageId: string) => {
    const targetMessage = currentChatMessages.find((message) => message.id === messageId);
    if (!targetMessage) return;
    if (activeDirectScope && !isMessageInDirectScope(targetMessage, activeDirectScope)) return;
    const records = loadImageGenerationRecords([]).value;
    const removed = records.filter((record) => record.messageId === messageId
      && record.relationId === targetMessage.relationId
      && record.conversationId === targetMessage.conversationId);
    if (removed.length) {
      saveImageGenerationRecords(removeImageGenerationRecordByMessage(records, messageId, {
        relationId: targetMessage.relationId,
        conversationId: targetMessage.conversationId || (activeDirectScope?.conversationId ?? `group:${targetMessage.characterId}`),
        groupId: targetMessage.relationId ? undefined : targetMessage.characterId,
      }));
      removed.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete generated image asset:", error)));
    }
    onDeleteMessage?.(messageId, targetMessage);
  }, [activeDirectScope, currentChatMessages, onDeleteMessage]);

  const startMultiSelectDelete = useCallback((initialMessageId: string) => {
    setActiveMenuMsg(null);
    setSelectedMessageIds(new Set([initialMessageId]));
    setIsMultiSelectDeleteMode(true);
  }, [setActiveMenuMsg, setIsMultiSelectDeleteMode, setSelectedMessageIds]);

  const toggleMultiSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((previous) => {
      const next = new Set(previous);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, [setSelectedMessageIds]);

  const exitMultiSelectDelete = useCallback(() => {
    setIsMultiSelectDeleteMode(false);
    setSelectedMessageIds(new Set());
  }, [setIsMultiSelectDeleteMode, setSelectedMessageIds]);

  const deleteSelectedMessages = useCallback(() => {
    const selectedMessages = currentChatMessages.filter((message) => selectedMessageIds.has(message.id));
    if (!selectedMessages.length) return;
    if (!window.confirm(`确定删除选中的 ${selectedMessages.length} 条消息吗？删除后无法恢复。`)) return;
    selectedMessages.forEach((message) => deleteMessageAndLinkedImage(message.id));
    exitMultiSelectDelete();
    showToast(`已删除 ${selectedMessages.length} 条消息`);
  }, [currentChatMessages, deleteMessageAndLinkedImage, exitMultiSelectDelete, selectedMessageIds, showToast]);

  const clearMessagesAndLinkedArtifacts = useCallback((characterId: string, relationId?: string) => {
    const removedMessages = messages.filter((message) => relationId
      ? message.relationId === relationId
      : message.characterId === characterId);
    const removedMessageIds = new Set(removedMessages.map((message) => message.id));
    const records = loadImageGenerationRecords([]).value;
    const removedRecords = records.filter((record) => removedMessageIds.has(record.messageId)
      && (relationId ? record.relationId === relationId : record.characterId === characterId));
    if (removedRecords.length) {
      const removedRecordIds = new Set(removedRecords.map((record) => record.id));
      saveImageGenerationRecords(records.filter((record) => !removedRecordIds.has(record.id)));
      removedRecords.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete cleared image asset:", error)));
    }
    if (relationId) {
      setRedPacketStatuses((previous) => {
        const next = removePaymentStatusesForMessages(removePaymentStatusesByRelation(previous, relationId), removedMessages);
        writeJson(RED_PACKET_STATUSES_KEY, next);
        return next;
      });
    }
    onClearMessages?.(characterId, undefined, relationId);
  }, [messages, onClearMessages, setRedPacketStatuses]);

  return {
    deleteMessageAndLinkedImage,
    startMultiSelectDelete,
    toggleMultiSelectedMessage,
    exitMultiSelectDelete,
    deleteSelectedMessages,
    clearMessagesAndLinkedArtifacts,
  };
}
