import type { Character, MemoryItem, Message, OfflineStory, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import type { Appointment } from "../../../domain/schedule/scheduleTypes";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { writeString } from "../../../core/storage/storageAdapter";
import { createId } from "../../../core/id/createId";
import { getOfflineModeStorageKey, getOfflineStoryStorageKey } from "../../../domain/relationship/characterRelationship";
import { getCurrentAppointmentProposal } from "../../../domain/schedule/appointmentPolicy";
import { startAppointmentOfflineSession } from "../../../domain/schedule/appointmentOfflineHandoff";
import { buildOfflineMemberKnowledgeSnapshots } from "../../offline/services/offlineMemberMemorySnapshot";
import { buildOfflineHandoffFacts, OFFLINE_HANDOFF_MESSAGE_LIMIT } from "../../../domain/offlineStory/offlineHandoffContext";
import { getLatestWorldBookEntries } from "../../../utils/worldBook";
import { isWorldBookEntryForAnyCharacter } from "../../../domain/worldbook/worldBookVisibility";

interface UseChatStartOfflineFromMessageOptions {
  activeChatCharId: string | null;
  activeCharacter: Character | undefined;
  activeRelationship: CharacterRelationship | undefined;
  messages: readonly Message[];
  offlineStories: readonly OfflineStory[];
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  activeIdentityId: string;
  memories: readonly MemoryItem[];
  worldBookEntries: WorldBookEntry[];
  onSaveAppointment?: (appointment: Appointment) => boolean;
  onSaveOfflineStory?: (story: OfflineStory) => boolean | void | Promise<boolean>;
  onOpenOfflineStory?: (storyId: string) => void;
  onNavigateToApp?: (app: string) => void;
  showToast: (message: string) => void;
}

export function useChatStartOfflineFromMessage({
  activeChatCharId,
  activeCharacter,
  activeRelationship,
  messages,
  offlineStories,
  characters,
  relationships,
  activeIdentityId,
  memories,
  worldBookEntries,
  onSaveAppointment,
  onSaveOfflineStory,
  onOpenOfflineStory,
  onNavigateToApp,
  showToast,
}: UseChatStartOfflineFromMessageOptions) {
  const handleStartOfflineFromMsg = async (
    msg: Message,
    appointment?: Appointment,
    handoffMessages?: readonly Message[],
  ) => {
    if (!activeChatCharId || !activeCharacter) return;
    if (appointment && (!activeRelationship
      || appointment.relationId !== activeRelationship.id
      || appointment.characterId !== activeRelationship.characterId
      || appointment.userIdentityId !== activeRelationship.userIdentityId)) {
      showToast("这条线下约定不属于当前聊天关系");
      return;
    }
    if (appointment) {
      const inProgressAppointment = startAppointmentOfflineSession(appointment, Date.now());
      if (!inProgressAppointment || !onSaveAppointment?.(inProgressAppointment)) {
        showToast("线下约定暂时无法开始，请稍后重试");
        return;
      }
      const existingStory = offlineStories.find((story) => story.sourceAppointmentId === appointment.id
        && story.relationId === appointment.relationId);
      if (existingStory && activeRelationship) {
        writeString(getOfflineModeStorageKey(activeRelationship.id), "true");
        writeString(getOfflineStoryStorageKey(activeRelationship.id), existingStory.id);
        onOpenOfflineStory?.(existingStory.id);
        onNavigateToApp?.("offline");
        return;
      }
    }
    
    const charName = activeCharacter.remark || activeCharacter.name;
    const offlineParticipantIds = activeCharacter.isGroupChat
      ? (activeCharacter.memberIds || [])
      : [activeChatCharId];
    const offlineParticipantSet = new Set(offlineParticipantIds);
    // The direct menu action used to import only the clicked message. Snapshot
    // a durable relation window so the offline scene has a real handoff.
    const handoffSourceMessages = (handoffMessages ? [...handoffMessages] : messages)
      .filter((item) => !item.isOffline && (activeRelationship
        ? item.relationId === activeRelationship.id
        : item.characterId === activeChatCharId && activeCharacter?.isGroupChat));
    // A handoff is a durable continuity boundary, not the normal short-term
    // chat context. Keep a generous raw snapshot (facts are extracted from the
    // complete relation history below) so a 50-message conversation does not
    // silently lose its earlier commitments.
    const recentOnlineMessages = handoffSourceMessages.slice(-OFFLINE_HANDOFF_MESSAGE_LIMIT);
    const sourceMessages = recentOnlineMessages.length > 0 ? recentOnlineMessages : [msg];
    const handoffFacts = buildOfflineHandoffFacts(
      handoffSourceMessages.length > 0 ? handoffSourceMessages : [msg],
    );
    const snapshotTimestamp = Date.now();
    const importedMessages = sourceMessages.map((item, index) => ({
      ...item,
      id: `offline-import-${snapshotTimestamp}-${index}-${item.id}`,
      isOffline: true,
      isImportedContext: true,
    }));
    const memberMemories = activeCharacter.isGroupChat
      ? buildOfflineMemberKnowledgeSnapshots({
          memberIds: offlineParticipantIds,
          characters,
          relationships,
          activeIdentityId,
          memories,
          claims: loadKnowledgeClaims().value,
        })
      : undefined;
    const importedContext: OfflineStory["importedContext"] = {
      messages: importedMessages,
      memories: activeRelationship
        ? memories.filter((memory) => memory.relationId === activeRelationship.id).map((memory) => memory.content)
        : [],
      ...(handoffFacts.length > 0 ? { handoffFacts } : {}),
      ...(memberMemories ? { memberMemories } : {}),
      worldBook: getLatestWorldBookEntries(worldBookEntries || [])
        .filter((entry) => isWorldBookEntryForAnyCharacter(entry, new Set([activeChatCharId, ...offlineParticipantSet])))
        .map((entry) => `${entry.title}: ${entry.content}`),
      importedAt: snapshotTimestamp,
    };

    const newStory: OfflineStory = {
      id: createId("story"),
      characterId: activeChatCharId,
      relationId: activeRelationship?.id,
      conversationId: activeCharacter.isGroupChat
        ? `group:${activeCharacter.id}`
        : activeRelationship?.conversationId,
      // A group is only a container; the actual offline actors are its members.
      characterIds: offlineParticipantIds.length > 0 ? offlineParticipantIds : [activeChatCharId],
      ...(activeCharacter.isGroupChat ? {
        participantSnapshots: offlineParticipantIds
          .map((participantId) => characters.find((character) => character.id === participantId))
          .filter((character): character is Character => Boolean(character))
          .map((character) => ({
            id: character.id,
            name: character.remark || character.name,
            avatar: character.avatar,
          })),
      } : {}),
      title: appointment
        ? `${getCurrentAppointmentProposal(appointment)?.activity || appointment.title} - ${new Date().toLocaleDateString()}`
        : `「${charName}」的聊天剧本 - ${new Date().toLocaleDateString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: "continue",
      worldBookSnapshot: getLatestWorldBookEntries(worldBookEntries || [])
        .filter((entry) => isWorldBookEntryForAnyCharacter(entry, new Set([activeChatCharId, ...offlineParticipantSet]))),
      knowledgeSnapshot: activeRelationship ? Array.from(new Set([
        ...loadKnowledgeClaims().value
          .filter((claim) => claim.relationId === activeRelationship.id
            && claim.characterId === activeRelationship.characterId
            && claim.userIdentityId === activeRelationship.userIdentityId
            && claim.status === "active"
            && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
          .map((claim) => claim.statement),
        ...memories
          .filter((memory) => memory.relationId === activeRelationship.id && memory.isManual === true)
          .map((memory) => memory.content),
      ])) : [],
      sourceChatId: activeChatCharId,
      sourceChatMsgCount: importedMessages.length,
      ...(appointment ? { sourceAppointmentId: appointment.id, autoStartFirstAct: true } : {}),
      importedContext,
      enableTimeAwareness: Boolean(activeCharacter.enableTimeAwareness),
      // Imported online chat is context only; the offline page starts with new story content.
      messages: []
    };
    
    if (onSaveOfflineStory) {
      const saveResult = onSaveOfflineStory(newStory);
      const saved = saveResult instanceof Promise ? await saveResult : saveResult !== false;
      if (!saved) {
        showToast("线下故事保存失败，请稍后重试");
        return;
      }
    }
    
    if (activeRelationship) {
      writeString(getOfflineModeStorageKey(activeRelationship.id), "true");
      writeString(getOfflineStoryStorageKey(activeRelationship.id), newStory.id);
    }
    
    showToast("已无痛切换到线下故事模式");

    if (onNavigateToApp) {
      onOpenOfflineStory?.(newStory.id);
      onNavigateToApp("offline");
    }
  };


  return { handleStartOfflineFromMsg };
}
