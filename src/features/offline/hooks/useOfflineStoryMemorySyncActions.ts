import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Character, MemoryItem, MemoryVaultSettings, OfflineStory, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { KnowledgeClaim } from "../../../domain/characterKnowledge/characterKnowledgeTypes";
import { appendMany as appendKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { apiExtractMemoriesWithModelFallback } from "../../../utils/apiHelper";
import { formatDelicateMemoryDiary, formatExtractedMemorySummary, MemoryService } from "../../../domain/memory/MemoryService";
import { commitMemoryWriteBundle } from "../../../domain/memory/memoryWriteCoordinator";
import { createId } from "../../../core/id/createId";
import { createOfflineStoryHandoffMemory, filterOfflineExtractedFacts, getOfflineMemorySourceMessages, getOfflineStorySummaryMarker, hasOfflineStorySummary, hasUnsyncedOfflineMemoryProgress, isOfflineStoryHandoffMemory } from "../../../domain/memory/offlineMemorySync";
import { canSyncOfflineStoryToMemory } from "../../../domain/offlineStory/offlineStoryFactPolicy";
import { resolveOfflineStoryCharacterIds } from "../../../domain/character/characterIdentity";
import { findRelationshipForCanonicalCharacter } from "../../../domain/relationship/characterRelationship";
import { applyConfirmedOfflineRelationshipTransition } from "../../../domain/relationship/offlineRelationshipTransition";
import { captureOfflineStoryCompletedEvent } from "../../characterLife/services/offlineStoryEventCaptureService";
import { createOfflineGroupParticipantMemories } from "../services/offlineGroupMemorySync";
import { notifyOfflineMemorySync } from "../services/offlineMemorySyncNotifications";

interface UseOfflineStoryMemorySyncActionsOptions {
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  settings: UserSettings;
  memories: readonly MemoryItem[];
  recallSettings: MemoryVaultSettings;
  activeIdentityId: string;
  activeStoryRef: MutableRefObject<OfflineStory | null>;
  memorySyncInFlightRef: MutableRefObject<Set<string>>;
  setMemorySyncingStoryId: Dispatch<SetStateAction<string | null>>;
  onSaveOfflineStory: (story: OfflineStory) => boolean | Promise<boolean>;
  onSaveMemories: (memories: MemoryItem[]) => void;
  onPersistMemories?: (memories: MemoryItem[]) => boolean | Promise<boolean>;
  onSaveRelationships: (relationships: CharacterRelationship[]) => void;
  saveActiveStorySnapshot: (story: OfflineStory) => void;
  showToast: (message: string) => void;
  needsLegacyHandoffRepair: (story: OfflineStory) => boolean;
  needsMissingSummaryRepair: (story: OfflineStory) => boolean;
  needsUninformativeSummaryRepair: (story: OfflineStory) => boolean;
}

export function useOfflineStoryMemorySyncActions({
  characters,
  relationships,
  settings,
  memories,
  recallSettings,
  activeIdentityId,
  activeStoryRef,
  memorySyncInFlightRef,
  setMemorySyncingStoryId,
  onSaveOfflineStory,
  onSaveMemories,
  onPersistMemories,
  onSaveRelationships,
  saveActiveStorySnapshot,
  showToast,
  needsLegacyHandoffRepair,
  needsMissingSummaryRepair,
  needsUninformativeSummaryRepair,
}: UseOfflineStoryMemorySyncActionsOptions) {
  const handleSyncMemoryToBrain = useCallback(async (
    story: OfflineStory,
    options: { userConfirmed?: boolean; syncIntent?: "automatic_end" | "manual_settings" } = {},
  ): Promise<OfflineStory> => {
    if (memorySyncInFlightRef.current.has(story.id)) {
      showToast("剧情记忆正在同步中，请稍候…");
      return story;
    }
    const repairingLegacyHandoff = needsLegacyHandoffRepair(story);
    const repairingMissingSummary = needsMissingSummaryRepair(story);
    const repairingUninformativeSummary = needsUninformativeSummaryRepair(story);
    if (!hasUnsyncedOfflineMemoryProgress(story) && !repairingLegacyHandoff && !repairingMissingSummary && !repairingUninformativeSummary) {
      showToast("当前进展已经同步，无需重复处理");
      return story;
    }
    const sourceMessages = getOfflineMemorySourceMessages(story, { includeSynced: true });
    const participantCharacters = resolveOfflineStoryCharacterIds(story, [...characters])
      .map((characterId) => characters.find((item) => item.id === characterId))
      .filter((item): item is Character => Boolean(item && !item.isGroupChat));
    const participantRelationships = participantCharacters.map((participant) =>
      findRelationshipForCanonicalCharacter([...relationships], activeIdentityId, participant.id, [...characters]),
    ).filter((relationship): relationship is CharacterRelationship => Boolean(relationship));
    const offlineStoryPolicyInput = {
      story,
      userConfirmed: options.userConfirmed === true,
      syncIntent: options.syncIntent,
      sourceMessages,
      participantRelationIds: participantRelationships.map((relationship) => relationship.id),
    };
    if (!canSyncOfflineStoryToMemory(offlineStoryPolicyInput)) return story;

    const character = characters.find((item) => item.id === story.characterId);
    if (!character) {
      showToast("当前线下故事没有可同步的角色资料");
      return story;
    }
    const isGroupStory = Boolean(
      (participantCharacters.length > 1 && !story.relationId)
      || (character.isGroupChat && participantCharacters.length > 0),
    );
    const now = Date.now();
    const syncMarker = getOfflineStorySummaryMarker(story);
    const markSynced = (memoryIds: string[] = []): OfflineStory => ({
      ...story,
      archivedAt: now,
      archivedMemoryIds: Array.from(new Set([...(story.archivedMemoryIds || []), ...memoryIds])),
      syncedSourceMessageIds: Array.from(new Set([...(story.syncedSourceMessageIds || []), ...sourceMessages.map((message) => message.id)])),
      lastSyncedMessageCount: story.messages.length,
      lastMemorySyncAt: now,
      memorySyncStatus: "synced",
      updatedAt: now,
    });

    memorySyncInFlightRef.current.add(story.id);
    setMemorySyncingStoryId(story.id);
    notifyOfflineMemorySync({ message: "正在总结并同步剧情记忆，请稍候…" });
    try {
      if (sourceMessages.length === 0) {
        const syncedStory = markSynced();
        if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(syncedStory); else onSaveOfflineStory(syncedStory);
        if (options.userConfirmed) captureOfflineStoryCompletedEvent({ story: syncedStory, userIdentityId: relationships.find((relation) => relation.id === syncedStory.relationId)?.userIdentityId, sourceMessages, userConfirmed: true, recordedAt: now });
        notifyOfflineMemorySync({ message: "没有可提取的线下新增剧情，已保留故事内容" });
        return syncedStory;
      }

      if (isGroupStory) {
        const groupResult = await createOfflineGroupParticipantMemories({ story, participants: participantCharacters, characters: [...characters], relationships: [...relationships], activeIdentityId, sourceMessages, userName: settings.name, now, settings, recallSettings, existingMemories: memories, offlineStoryPolicyInput, extractApi: (params) => apiExtractMemoriesWithModelFallback(params, settings.selectedModel) });
        const groupMemories = groupResult.memories;
        if (groupMemories.length !== participantCharacters.length) throw new Error("Offline group story is missing one or more participant relationship scopes");
        const retainedMemories = memories.filter((memory) => !isOfflineStoryHandoffMemory(memory, story));
        const write = await commitMemoryWriteBundle({
          claims: groupResult.acceptedClaims,
          memories: MemoryService.mergeMemories(retainedMemories, groupMemories),
          appendClaims: (claims) => {
            // Kept as an injected callback below so the coordinator owns the
            // ordering and failure boundary for group sync as well.
            return appendKnowledgeClaims(claims);
          },
          saveMemories: async (nextMemories) => onPersistMemories
            ? onPersistMemories([...nextMemories])
            : (onSaveMemories([...nextMemories]), true),
        });
        if (!write.canonicalWritten) throw new Error("Offline group story knowledge persistence failed");
        if (!write.memoriesWritten) throw new Error("Offline group story memory persistence failed");
        const syncedStory = markSynced(groupMemories.map((memory) => memory.id));
        if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(syncedStory); else onSaveOfflineStory(syncedStory);
        const fallbackSuffix = groupResult.fallbackParticipantNames.length > 0
          ? `；${groupResult.fallbackParticipantNames.join("、")}未返回可用摘要，已保存精简安全摘要`
          : "";
        notifyOfflineMemorySync({ message: `多人线下剧情已分别同步到每位参与成员${fallbackSuffix}` });
        return syncedStory;
      }
      if (character.isGroupChat) throw new Error("Offline group story participant scope is invalid");

      const historyLimit = character.historyMemoryLimit || 100;
      const relationship = relationships.find((relation) => relation.id === story.relationId && relation.characterId === story.characterId && relation.conversationId === story.conversationId);
      if (!relationship) throw new Error("Offline story relationship scope is invalid");
      const isDelicate = character.archiveTemplateType === "delicate";
      const headerLabel = isDelicate ? `【线下剧本《${story.title}》心境归档】` : `【线下剧本《${story.title}》关键剧情归档】`;
      let extractedMemories: MemoryItem[] = [];
      let confirmedFacts: string[] = [];
      let acceptedOfflineClaims: KnowledgeClaim[] = [];
      let usedSafeFallback = false;
      const createSafeFallback = () => {
        usedSafeFallback = true;
        extractedMemories = [createOfflineStoryHandoffMemory({ story, sourceMessages, characterId: story.characterId, relationId: story.relationId, characterName: character.name, id: createId("mem"), timestamp: Date.now(), marker: "summary", includeConfirmedExcerpts: true })];
      };
      try {
        const result = await MemoryService.extractMemories({
          character, characterId: story.characterId, relationId: story.relationId, userIdentityId: relationship.userIdentityId, conversationId: relationship.conversationId,
          recentMessages: sourceMessages.slice(-historyLimit), existingMemories: memories, scenario: "offline", apiKey: settings.apiKey,
          model: !recallSettings.extractModel || recallSettings.extractModel === "default-chat-model" ? (settings.selectedModel || "gemini-3.5-flash") : recallSettings.extractModel,
          apiEndpoint: settings.apiEndpoint, templateType: character.archiveTemplateType, filterItems: filterOfflineExtractedFacts, offlineStoryPolicyInput,
          createId: () => createId("mem"), currentTime: () => Date.now(),
          formatContent: (items, formatOptions) => `${isDelicate ? `${formatDelicateMemoryDiary(headerLabel, formatOptions?.displayItems || items)}\n[${syncMarker}]\n【事实索引（系统）】\n${items.map((item) => `- ${item}`).join("\n")}` : `${formatExtractedMemorySummary(headerLabel, items)}\n[${syncMarker}]`}`,
        }, (params) => apiExtractMemoriesWithModelFallback(params, settings.selectedModel));
        if (result.apiError) createSafeFallback();
        else {
          acceptedOfflineClaims = result.acceptedClaims;
          confirmedFacts = result.acceptedClaims.filter((claim) => claim.status === "active" && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted")).map((claim) => claim.statement);
          extractedMemories = result.extractedMemories;
          if (extractedMemories.length === 0) createSafeFallback();
        }
      } catch (error) {
        if (error instanceof Error && error.message === "Offline story knowledge persistence failed") throw error;
        createSafeFallback();
      }
      if (extractedMemories.length === 0) throw new Error("Offline story summary did not contain confirmed, safe facts");

      const retainedMemories = memories.filter((memory) => !isOfflineStoryHandoffMemory(memory, story));
      const mergedMemories = MemoryService.mergeMemories(retainedMemories, extractedMemories);
      if (!hasOfflineStorySummary(story, mergedMemories)) throw new Error("Offline story summary merge verification failed");
      const write = await commitMemoryWriteBundle({
        claims: acceptedOfflineClaims,
        memories: mergedMemories,
        appendClaims: (claims) => appendKnowledgeClaims(claims),
        saveMemories: async (nextMemories) => onPersistMemories
          ? onPersistMemories([...nextMemories])
          : (onSaveMemories([...nextMemories]), true),
      });
      if (!write.canonicalWritten) throw new Error("Offline story knowledge persistence failed");
      if (!write.memoriesWritten) throw new Error("Offline story summary persistence failed");
      const nextRelationships = applyConfirmedOfflineRelationshipTransition({ relationships: [...relationships], relationId: relationship.id, claims: acceptedOfflineClaims, now });
      if (nextRelationships.some((item, index) => item !== relationships[index])) onSaveRelationships(nextRelationships);
      const syncedStory = markSynced(extractedMemories.map((memory) => memory.id));
      if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(syncedStory); else onSaveOfflineStory(syncedStory);
      if (options.userConfirmed) captureOfflineStoryCompletedEvent({ story: syncedStory, userIdentityId: relationships.find((relation) => relation.id === syncedStory.relationId)?.userIdentityId, sourceMessages, userConfirmed: true, confirmedFacts, recordedAt: now });
      notifyOfflineMemorySync({ message: usedSafeFallback ? "提炼接口未返回可用摘要，已保存可核对的安全剧情摘要" : "线下剧情摘要已同步到当前角色" });
      return syncedStory;
    } catch (error) {
      console.error("Failed to sync offline story memories:", error);
      const failedStory: OfflineStory = { ...story, memorySyncStatus: "failed", updatedAt: Date.now() };
      if (activeStoryRef.current?.id === story.id) saveActiveStorySnapshot(failedStory); else onSaveOfflineStory(failedStory);
      notifyOfflineMemorySync({ message: "线下剧情记忆同步失败，故事已保留，可稍后重试", isError: true });
      return failedStory;
    } finally {
      memorySyncInFlightRef.current.delete(story.id);
      setMemorySyncingStoryId((current) => current === story.id ? null : current);
    }
  }, [activeIdentityId, activeStoryRef, characters, memories, memorySyncInFlightRef, needsLegacyHandoffRepair, needsMissingSummaryRepair, needsUninformativeSummaryRepair, onPersistMemories, onSaveMemories, onSaveOfflineStory, onSaveRelationships, recallSettings, relationships, saveActiveStorySnapshot, setMemorySyncingStoryId, settings, showToast]);

  return { handleSyncMemoryToBrain };
}
