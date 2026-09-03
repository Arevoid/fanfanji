import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Character, MemoryItem, OfflineStory } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { remove as removeStoredValue, writeJson } from "../../../core/storage/storageAdapter";
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
import { RED_PACKET_STATUSES_KEY, removePaymentStatusesByRelation, type RedPacketStatusMap } from "../services/paymentScope";

interface UseChatDeleteFriendActionOptions {
  activeCharacter?: Character;
  activeIdentityId: string;
  activeRelationship?: CharacterRelationship;
  activeChatRelationId?: string | null;
  relationships: readonly CharacterRelationship[];
  characters: readonly Character[];
  memories: readonly MemoryItem[];
  offlineStories: readonly OfflineStory[];
  relationForCharacter: (characterId: string) => CharacterRelationship | undefined;
  belongsToActiveIdentity: (ownerIdentityId?: string) => boolean;
  clearMessagesAndLinkedArtifacts: (characterId: string, relationId?: string) => void;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  onDeleteMomentsByRelation?: (relationId: string) => void;
  onSaveMemories: (memories: MemoryItem[]) => void;
  onDeleteRelationshipMusic?: (relationId: string) => void;
  onDeleteOfflineStory?: (storyId: string) => void;
  onSaveCharacter: (character: Character) => void;
  setRedPacketStatuses: Dispatch<SetStateAction<RedPacketStatusMap>>;
  proactiveMessageInFlightRef: MutableRefObject<Set<string>>;
  setInitiatedChatIds: Dispatch<SetStateAction<string[]>>;
  setLastReadTimestamps: Dispatch<SetStateAction<Record<string, number>>>;
  setIsShowingCardModal: Dispatch<SetStateAction<boolean>>;
  setActiveChatCharId: Dispatch<SetStateAction<string | null>>;
  setActiveChatRelationId: Dispatch<SetStateAction<string | null>>;
  showToast: (message: string) => void;
}

/** Deletes one direct relationship while preserving canonical characters and sibling identities. */
export function useChatDeleteFriendAction({
  activeCharacter,
  activeIdentityId,
  activeRelationship,
  activeChatRelationId,
  relationships,
  characters,
  memories,
  offlineStories,
  relationForCharacter,
  belongsToActiveIdentity,
  clearMessagesAndLinkedArtifacts,
  onSaveRelationships,
  onDeleteMomentsByRelation,
  onSaveMemories,
  onDeleteRelationshipMusic,
  onDeleteOfflineStory,
  onSaveCharacter,
  setRedPacketStatuses,
  proactiveMessageInFlightRef,
  setInitiatedChatIds,
  setLastReadTimestamps,
  setIsShowingCardModal,
  setActiveChatCharId,
  setActiveChatRelationId,
  showToast,
}: UseChatDeleteFriendActionOptions) {
  const handleDeleteFriend = useCallback(() => {
    if (!activeCharacter || activeCharacter.isGroupChat) return;

    const friendName = activeCharacter.remark || activeCharacter.name;
    if (!window.confirm(`确定删除好友“${friendName}”吗？与该好友的聊天、朋友圈、记忆和线下剧本将一并删除，且无法恢复。`)) return;

    const currentIdentityRelation = relationForCharacter(activeCharacter.id);
    const relationToDelete = activeRelationship?.userIdentityId === activeIdentityId
      ? activeRelationship
      : currentIdentityRelation;
    const orphanRelationId = !relationToDelete && !activeRelationship && activeChatRelationId ? activeChatRelationId : undefined;
    if (!relationToDelete && !orphanRelationId) {
      showToast("找不到当前身份的好友关系，无法执行安全清理。");
      return;
    }
    const friendId = activeCharacter.id;
    const relationId = relationToDelete?.id || orphanRelationId!;
    clearMessagesAndLinkedArtifacts(friendId, relationId);
    removeCharacterLifeEventsForRelations([relationId]);
    removeCharacterTruthForRelations([relationId]);
    removeProactiveTopicsForRelations([relationId]);
    onDeleteMomentsByRelation?.(relationId);
    onSaveRelationships(relationships.filter((relation) => relation.id !== relationId));

    const innerVoices = loadInnerVoiceRecords([]).value;
    const remainingInnerVoices = removeInnerVoicesByRelation(innerVoices, relationId);
    if (remainingInnerVoices.length !== innerVoices.length) saveInnerVoiceRecords(remainingInnerVoices);
    const imageRecords = loadImageGenerationRecords([]).value;
    const removedImageRecords = imageRecords.filter((record) => record.relationId === relationId);
    if (removedImageRecords.length) {
      saveImageGenerationRecords(removeImageGenerationRecordsByRelation(imageRecords, relationId));
      removedImageRecords.forEach((record) => imageAssetDb.deleteImage(record.imageAssetId).catch((error) => console.warn("Failed to delete relation image asset:", error)));
    }
    onSaveMemories(memories.filter((memory) => memory.relationId !== relationId));

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
    const remainingForumShares = removeForumSharesByRelation(forumShares, relationId);
    const forumThreads = loadForumThreads().value;
    const forumReplies = loadForumReplies().value;
    const forumMutation: { shares?: typeof forumShares; threads?: typeof forumThreads; replies?: typeof forumReplies; generationTasks?: ReturnType<typeof loadForumGenerationTasks>["value"]; actorStates?: ReturnType<typeof loadForumActorStates>["value"]; activityTasks?: ReturnType<typeof loadForumActivityTasks>["value"] } = {};
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
    characters
      .filter((character) => character.isGroupChat && belongsToActiveIdentity(character.ownerIdentityId) && character.memberIds?.includes(friendId))
      .forEach((group) => onSaveCharacter({ ...group, memberIds: group.memberIds?.filter((memberId) => memberId !== friendId) }));

    removeStoredValue(getOfflineModeStorageKey(relationId));
    removeStoredValue(getOfflineStoryStorageKey(relationId));
    proactiveMessageInFlightRef.current.delete(relationId);
    setInitiatedChatIds((previous) => previous.filter((id) => id !== relationId));
    setLastReadTimestamps((previous) => {
      const next = { ...previous };
      delete next[relationId];
      return next;
    });
    setIsShowingCardModal(false);
    setActiveChatCharId(null);
    setActiveChatRelationId(null);
  }, [activeCharacter, activeChatRelationId, activeIdentityId, activeRelationship, belongsToActiveIdentity, characters, clearMessagesAndLinkedArtifacts, memories, offlineStories, onDeleteMomentsByRelation, onDeleteOfflineStory, onDeleteRelationshipMusic, onSaveCharacter, onSaveMemories, onSaveRelationships, proactiveMessageInFlightRef, relationForCharacter, relationships, setActiveChatCharId, setActiveChatRelationId, setInitiatedChatIds, setIsShowingCardModal, setLastReadTimestamps, setRedPacketStatuses, showToast]);

  return { handleDeleteFriend };
}
