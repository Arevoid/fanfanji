import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { MemoryItem, Moment, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { remove as removeStoredValue, readJson, writeJson } from "../../../core/storage/storageAdapter";
import { getOfflineModeStorageKey, getOfflineStoryStorageKey } from "../../../domain/relationship/characterRelationship";
import { loadInnerVoiceRecords, removeInnerVoicesByRelation, saveInnerVoiceRecords } from "../../../core/storage/repositories/innerVoiceRepository";
import { loadImageGenerationRecords, removeImageGenerationRecordsByRelation, saveImageGenerationRecords } from "../../../core/storage/repositories/imageGenerationRepository";
import { imageAssetDb } from "../../../utils/imageAssetDb";
import { loadDiaryEntries, loadDiaryGenerationTasks, loadDiaryShares, loadDiaryTranslations, saveDiaryEntries, saveDiaryGenerationTasks, saveDiaryShares, saveDiaryTranslations } from "../../../core/storage/repositories/diaryRepository";
import { cleanupDiaryForRelations } from "../../../domain/diary/diaryCleanup";
import { commitForumMutation, loadForumActivityTasks, loadForumActorStates, loadForumGenerationTasks, loadForumReplies, loadForumShares, loadForumThreads } from "../../../core/storage/repositories/forumRepository";
import { removeForumSharesByRelation, unlinkForumPrivateAuthorByRelation } from "../../../domain/forum/forumShare";
import { removeForumGenerationTasksByRelation } from "../../../domain/forum/forumGenerationGuard";
import { removeCharacterLifeEventsForRelations } from "../../characterLife/services/characterEventCaptureService";
import { removeCharacterTruthForRelations } from "../../characterKnowledge/services/characterTruthCleanupService";
import { removeProactiveTopicsForRelations } from "../../../core/storage/repositories/proactiveTopicRepository";
import { getMomentComments } from "../../moments/services/momentContent";
import { RED_PACKET_STATUSES_KEY, removePaymentStatusesByRelation, type RedPacketStatusMap } from "../services/paymentScope";
import { USER_MEMO_MENTION_LEDGER_KEY } from "../prompts/userMemoContext";

interface UseChatRelationshipCleanupActionsOptions {
  moments: readonly Moment[];
  memories: readonly MemoryItem[];
  relationships: readonly CharacterRelationship[];
  offlineStories: readonly OfflineStory[];
  clearMessagesAndLinkedArtifacts: (characterId: string, relationId?: string) => void;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  onDeleteMomentsByRelation?: (relationId: string) => void;
  onSaveMemories: (memories: MemoryItem[]) => void;
  onDeleteRelationshipMusic?: (relationId: string) => void;
  onDeleteOfflineStory?: (storyId: string) => void;
  onClearMomentState: (momentIds: ReadonlySet<string>, commentIds: ReadonlySet<string>) => void;
  proactiveMessageInFlightRef: MutableRefObject<Set<string>>;
  setInitiatedChatIds: Dispatch<SetStateAction<string[]>>;
  setLastReadTimestamps: Dispatch<SetStateAction<Record<string, number>>>;
  setRedPacketStatuses: Dispatch<SetStateAction<RedPacketStatusMap>>;
}

/** Clears relationship-owned data without deleting the Character or the Relationship record. */
export function useChatRelationshipCleanupActions({
  moments,
  memories,
  relationships,
  offlineStories,
  clearMessagesAndLinkedArtifacts,
  onSaveRelationships,
  onDeleteMomentsByRelation,
  onSaveMemories,
  onDeleteRelationshipMusic,
  onDeleteOfflineStory,
  onClearMomentState,
  proactiveMessageInFlightRef,
  setInitiatedChatIds,
  setLastReadTimestamps,
  setRedPacketStatuses,
}: UseChatRelationshipCleanupActionsOptions) {
  const clearFriendScopedMemory = useCallback((friendId: string, relationId: string) => {
    const relationMoments = moments.filter((moment) => moment.relationId === relationId);
    const relationMomentIds = new Set(relationMoments.map((moment) => moment.id));
    const relationCommentIds = new Set(
      moments.flatMap((moment) => getMomentComments(moment)
        .filter((comment) => comment.relationId === relationId)
        .map((comment) => `${moment.id}:${comment.id}`)),
    );

    clearMessagesAndLinkedArtifacts(friendId, relationId);
    removeCharacterLifeEventsForRelations([relationId]);
    removeCharacterTruthForRelations([relationId]);
    removeProactiveTopicsForRelations([relationId]);
    onSaveRelationships(relationships.map((relation) => relation.id === relationId
      ? { ...relation, compressedMemory: undefined, lastImmediateSummaryMsgId: undefined, lastActiveTime: undefined, updatedAt: Date.now() }
      : relation));
    onDeleteMomentsByRelation?.(relationId);
    onSaveMemories(memories.filter((memory) => memory.relationId !== relationId));
    onClearMomentState(relationMomentIds, relationCommentIds);

    const innerVoices = loadInnerVoiceRecords([]).value;
    const remainingInnerVoices = removeInnerVoicesByRelation(innerVoices, relationId);
    if (remainingInnerVoices.length !== innerVoices.length) saveInnerVoiceRecords(remainingInnerVoices);

    const imageRecords = loadImageGenerationRecords([]).value;
    const removedImageRecords = imageRecords.filter((record) => record.relationId === relationId);
    if (removedImageRecords.length) {
      saveImageGenerationRecords(removeImageGenerationRecordsByRelation(imageRecords, relationId));
      removedImageRecords.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete relation image asset:", error)));
    }

    const diaryCleanup = cleanupDiaryForRelations({
      relationIds: [relationId],
      entries: loadDiaryEntries().value,
      shares: loadDiaryShares().value,
      tasks: loadDiaryGenerationTasks().value,
      translations: loadDiaryTranslations().value,
    });
    saveDiaryEntries(diaryCleanup.entries);
    saveDiaryShares(diaryCleanup.shares);
    saveDiaryGenerationTasks(diaryCleanup.tasks);
    saveDiaryTranslations(diaryCleanup.translations);

    setRedPacketStatuses((previous) => {
      const next = removePaymentStatusesByRelation(previous, relationId);
      writeJson(RED_PACKET_STATUSES_KEY, next);
      return next;
    });
    onDeleteRelationshipMusic?.(relationId);

    const forumShares = loadForumShares().value;
    const forumThreads = loadForumThreads().value;
    const forumReplies = loadForumReplies().value;
    const forumMutation: { shares?: typeof forumShares; threads?: typeof forumThreads; replies?: typeof forumReplies; generationTasks?: ReturnType<typeof loadForumGenerationTasks>["value"]; actorStates?: ReturnType<typeof loadForumActorStates>["value"]; activityTasks?: ReturnType<typeof loadForumActivityTasks>["value"] } = {};
    const remainingForumShares = removeForumSharesByRelation(forumShares, relationId);
    if (remainingForumShares.length !== forumShares.length) forumMutation.shares = remainingForumShares;
    const unlinkedForumThreads = unlinkForumPrivateAuthorByRelation(forumThreads, relationId);
    if (unlinkedForumThreads.some((thread, index) => thread !== forumThreads[index])) forumMutation.threads = unlinkedForumThreads;
    const unlinkedForumReplies = forumReplies.map((reply) =>
      reply.privateActor?.kind === "relationship" && reply.privateActor.relationId === relationId
        ? (() => { const { privateActor: _privateActor, ...publicReply } = reply; return publicReply; })()
        : reply);
    if (unlinkedForumReplies.some((reply, index) => reply !== forumReplies[index])) forumMutation.replies = unlinkedForumReplies;
    forumMutation.generationTasks = removeForumGenerationTasksByRelation(loadForumGenerationTasks().value, relationId);
    forumMutation.actorStates = loadForumActorStates().value.filter((state) => state.actor.kind !== "relationship" || state.actor.relationId !== relationId);
    forumMutation.activityTasks = loadForumActivityTasks().value.map((task) => ({
      ...task,
      pendingEvents: task.pendingEvents.filter((event) => event.privateActor?.kind !== "relationship" || event.privateActor.relationId !== relationId),
    }));
    commitForumMutation(forumMutation);

    offlineStories.filter((story) => story.relationId === relationId).forEach((story) => onDeleteOfflineStory?.(story.id));
    removeStoredValue(getOfflineModeStorageKey(relationId));
    removeStoredValue(getOfflineStoryStorageKey(relationId));

    const memoLedger = readJson<Record<string, unknown>>(USER_MEMO_MENTION_LEDGER_KEY, {}).value;
    if (Object.prototype.hasOwnProperty.call(memoLedger, relationId)) {
      const { [relationId]: _removed, ...remainingLedger } = memoLedger;
      writeJson(USER_MEMO_MENTION_LEDGER_KEY, remainingLedger);
    }
    proactiveMessageInFlightRef.current.delete(relationId);
    setInitiatedChatIds((previous) => previous.filter((id) => id !== relationId));
    setLastReadTimestamps((previous) => {
      const next = { ...previous };
      delete next[relationId];
      return next;
    });
  }, [clearMessagesAndLinkedArtifacts, memories, moments, offlineStories, onClearMomentState, onDeleteMomentsByRelation, onDeleteOfflineStory, onDeleteRelationshipMusic, onSaveMemories, onSaveRelationships, proactiveMessageInFlightRef, relationships, setInitiatedChatIds, setLastReadTimestamps, setRedPacketStatuses]);

  return { clearFriendScopedMemory };
}
