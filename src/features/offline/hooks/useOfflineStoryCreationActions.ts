import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Character, MemoryItem, Message, OfflineStory, WorldBookEntry } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { createId } from "../../../core/id/createId";
import { loadMessages } from "../../../core/storage/repositories/messageRepository";
import { loadKnowledgeClaims } from "../../../core/storage/repositories/characterKnowledgeRepository";
import { getConversationId, getOfflineGroupModeStorageKey, getOfflineGroupStoryStorageKey, getOfflineModeStorageKey, getOfflineStoryStorageKey } from "../../../domain/relationship/characterRelationship";
import { writeString } from "../../../core/storage/storageAdapter";
import { getLatestWorldBookEntries } from "../../../utils/worldBook";
import { isWorldBookEntryForAnyCharacter, isWorldBookEntryForCharacter } from "../../../domain/worldbook/worldBookVisibility";
import { buildOfflineHandoffFacts, OFFLINE_HANDOFF_MESSAGE_LIMIT } from "../../../domain/offlineStory/offlineHandoffContext";

type StoryCreationMode = "director" | "continue" | "if";

interface UseOfflineStoryCreationActionsOptions {
  characters: readonly Character[];
  relationships: readonly CharacterRelationship[];
  messages: readonly Message[];
  memories: readonly MemoryItem[];
  worldBookEntries: readonly WorldBookEntry[];
  activeIdentityId: string;
  selectedCharId: string;
  selectedCharIds: readonly string[];
  selectedRelationId: string | null;
  relationChoices: readonly CharacterRelationship[];
  newTitle: string;
  newMode: StoryCreationMode;
  newIfPrompt: string;
  newStartFromChat: boolean;
  newTimeAwareness: boolean;
  onSaveStorySnapshot: (story: OfflineStory) => void;
  setShowCreateModal: Dispatch<SetStateAction<boolean>>;
  setNewTitle: Dispatch<SetStateAction<string>>;
  setNewMode: Dispatch<SetStateAction<StoryCreationMode>>;
  setNewIfPrompt: Dispatch<SetStateAction<string>>;
  setNewStartFromChat: Dispatch<SetStateAction<boolean>>;
  setNewTimeAwareness: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string) => void;
}

/** Creates an offline story with an explicit identity/relation-scoped context snapshot. */
export function useOfflineStoryCreationActions({
  characters,
  relationships,
  messages,
  memories,
  worldBookEntries,
  activeIdentityId,
  selectedCharId,
  selectedCharIds,
  selectedRelationId,
  relationChoices,
  newTitle,
  newMode,
  newIfPrompt,
  newStartFromChat,
  newTimeAwareness,
  onSaveStorySnapshot,
  setShowCreateModal,
  setNewTitle,
  setNewMode,
  setNewIfPrompt,
  setNewStartFromChat,
  setNewTimeAwareness,
  showToast,
}: UseOfflineStoryCreationActionsOptions) {
  const handleCreateStory = useCallback(() => {
    const selectedCharacter = characters.find((character) => character.id === selectedCharId);
    if (!selectedCharId || !selectedCharacter) { showToast("请先选择一个角色！"); return; }
    const isGroupStory = Boolean(selectedCharacter.isGroupChat);
    const participantIds = isGroupStory ? [...selectedCharIds] : [selectedCharId];
    if (isGroupStory && participantIds.length < 2) { showToast("多人线下至少需要选择两名参与角色。"); return; }
    const relationship = isGroupStory ? undefined : relationChoices.find((relation) => relation.id === selectedRelationId);
    if (!isGroupStory && !relationship) { showToast("请先选择当前身份的角色关系。"); return; }

    const storyCharsList = characters.filter((character) => selectedCharIds.includes(character.id));
    const charsLabel = storyCharsList.map((character) => character.remark || character.name).join("、");
    const modeLabel = newMode === "director" ? "导演剧本" : newMode === "if" ? "IF假想线" : "续写故事";
    const titleToUse = newTitle.trim() || `「${charsLabel}」的${modeLabel} - ${new Date().toLocaleDateString()}`;
    let importedContext: OfflineStory["importedContext"];

    if (newStartFromChat) {
      const liveMessages = isGroupStory
        ? messages.filter((message) => message.characterId === selectedCharId && !message.isOffline)
        : messages.filter((message) => message.relationId === selectedRelationId);
      const storedMessages = liveMessages.length === 0 ? loadMessages([]) : null;
      if (liveMessages.length > 0 || storedMessages?.found) {
        try {
          const parsed = liveMessages.length > 0 ? liveMessages : storedMessages?.value || [];
          const relationMessages = isGroupStory
            ? parsed.filter((message) => message.characterId === selectedCharId && !message.isOffline)
            : parsed.filter((message) => message.relationId === selectedRelationId);
          const relevantMsgs = relationMessages.slice(-OFFLINE_HANDOFF_MESSAGE_LIMIT);
          importedContext = {
            messages: relevantMsgs.map((message) => ({ ...message, id: createId("offline"), isOffline: true })),
            memories: isGroupStory
              ? memories.filter((memory) => participantIds.some((participantId) => relationships.some((relation) => relation.id === memory.relationId && relation.characterId === participantId && relation.userIdentityId === activeIdentityId))).map((memory) => memory.content)
              : memories.filter((memory) => memory.relationId === selectedRelationId).map((memory) => memory.content),
            handoffFacts: buildOfflineHandoffFacts(relationMessages),
            worldBook: getLatestWorldBookEntries([...worldBookEntries])
              .filter((entry) => isGroupStory ? isWorldBookEntryForAnyCharacter(entry, new Set(participantIds)) : isWorldBookEntryForCharacter(entry, selectedCharId))
              .map((entry) => `${entry.title}: ${entry.content}`),
            importedAt: Date.now(),
          };
        } catch (error) { console.error("Failed to copy chat history:", error); }
      }
    }

    const participantSet = new Set(participantIds);
    const newStory: OfflineStory = {
      id: createId("story"),
      characterId: selectedCharId,
      ...(relationship ? { relationId: relationship.id } : {}),
      conversationId: isGroupStory ? `group:${selectedCharacter.id}` : relationship!.conversationId || getConversationId(relationship!.id),
      characterIds: participantIds,
      ...(isGroupStory ? { participantSnapshots: storyCharsList.map((character) => ({ id: character.id, name: character.remark || character.name, avatar: character.avatar })) } : {}),
      title: titleToUse,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: newMode,
      worldBookSnapshot: getLatestWorldBookEntries([...worldBookEntries]).filter((entry) => isWorldBookEntryForAnyCharacter(entry, participantSet)),
      knowledgeSnapshot: Array.from(new Set([
        ...loadKnowledgeClaims().value
          .filter((claim) => !isGroupStory && claim.relationId === relationship!.id && claim.characterId === relationship.characterId && claim.userIdentityId === relationship.userIdentityId && claim.status === "active" && (claim.truthStatus === "confirmed" || claim.truthStatus === "asserted"))
          .map((claim) => claim.statement),
        ...memories.filter((memory) => memory.isManual === true && (isGroupStory
          ? participantIds.some((participantId) => relationships.some((relation) => relation.id === memory.relationId && relation.characterId === participantId && relation.userIdentityId === activeIdentityId))
          : memory.relationId === relationship!.id)).map((memory) => memory.content),
      ])),
      ifPrompt: newMode === "if" ? newIfPrompt : undefined,
      sourceChatId: newStartFromChat ? selectedCharId : undefined,
      sourceChatMsgCount: newStartFromChat ? importedContext?.messages.length : undefined,
      importedContext,
      enableTimeAwareness: newStartFromChat
        ? (isGroupStory ? participantIds.some((participantId) => Boolean(characters.find((character) => character.id === participantId)?.enableTimeAwareness)) : Boolean(selectedCharacter.enableTimeAwareness))
        : newTimeAwareness,
      messages: [],
    };

    onSaveStorySnapshot(newStory);
    if (relationship) {
      writeString(getOfflineModeStorageKey(relationship.id), "true");
      writeString(getOfflineStoryStorageKey(relationship.id), newStory.id);
    } else {
      writeString(getOfflineGroupModeStorageKey(selectedCharacter.id), "true");
      writeString(getOfflineGroupStoryStorageKey(selectedCharacter.id), newStory.id);
    }
    setShowCreateModal(false);
    setNewTitle("");
    setNewMode("director");
    setNewIfPrompt("");
    setNewStartFromChat(false);
    setNewTimeAwareness(false);
  }, [activeIdentityId, characters, memories, messages, newIfPrompt, newMode, newStartFromChat, newTimeAwareness, newTitle, onSaveStorySnapshot, relationChoices, relationships, selectedCharId, selectedCharIds, selectedRelationId, setNewIfPrompt, setNewMode, setNewStartFromChat, setNewTimeAwareness, setNewTitle, setShowCreateModal, showToast, worldBookEntries]);

  return { handleCreateStory };
}
