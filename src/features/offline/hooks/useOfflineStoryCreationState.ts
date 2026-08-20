import { useEffect, useState } from "react";
import type { Character, OfflineStory } from "../../../types";

export type OfflineStoryCreationMode = "director" | "continue" | "if";

interface UseOfflineStoryCreationStateOptions {
  selectableCharacters: Character[];
  selectedCharId: string;
  characters: Character[];
}

/** Owns the create/edit form state for the offline story list. */
export function useOfflineStoryCreationState({
  selectableCharacters,
  selectedCharId,
  characters,
}: UseOfflineStoryCreationStateOptions) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStory, setEditingStory] = useState<OfflineStory | null>(null);
  const [editingStoryTitle, setEditingStoryTitle] = useState("");
  const [editingStoryIfPrompt, setEditingStoryIfPrompt] = useState("");
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newMode, setNewMode] = useState<OfflineStoryCreationMode>("director");
  const [newIfPrompt, setNewIfPrompt] = useState("");
  const [newStartFromChat, setNewStartFromChat] = useState(false);
  const [newTimeAwareness, setNewTimeAwareness] = useState(false);

  useEffect(() => {
    if (!showCreateModal) return;
    const selectedCharacter = selectableCharacters.find((character) => character.id === selectedCharId);
    setSelectedCharIds(selectedCharacter?.isGroupChat
      ? (selectedCharacter.memberIds || []).filter((id) => characters.some((character) => character.id === id))
      : [selectedCharId]);
  }, [showCreateModal, selectedCharId, selectableCharacters, characters]);

  return {
    showCreateModal,
    setShowCreateModal,
    editingStory,
    setEditingStory,
    editingStoryTitle,
    setEditingStoryTitle,
    editingStoryIfPrompt,
    setEditingStoryIfPrompt,
    selectedCharIds,
    setSelectedCharIds,
    newTitle,
    setNewTitle,
    newMode,
    setNewMode,
    newIfPrompt,
    setNewIfPrompt,
    newStartFromChat,
    setNewStartFromChat,
    newTimeAwareness,
    setNewTimeAwareness,
  };
}
