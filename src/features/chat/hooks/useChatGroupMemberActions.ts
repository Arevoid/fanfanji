import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Character, Message } from "../../../types";

interface UseChatGroupMemberActionsOptions {
  activeCharacter?: Character;
  characters: readonly Character[];
  onSaveCharacter: (character: Character) => void;
  onSendMessage: (message: Message) => void;
  setShowAddMemberModal: Dispatch<SetStateAction<boolean>>;
}

/** Keeps group membership mutations and their visible narration messages together. */
export function useChatGroupMemberActions({
  activeCharacter,
  characters,
  onSaveCharacter,
  onSendMessage,
  setShowAddMemberModal,
}: UseChatGroupMemberActionsOptions) {
  const handleRemoveGroupMember = useCallback((memberId: string) => {
    if (!activeCharacter || !activeCharacter.memberIds) return;
    const member = characters.find((character) => character.id === memberId);
    const memberName = member ? (member.remark || member.name) : "成员";
    onSaveCharacter({ ...activeCharacter, memberIds: activeCharacter.memberIds.filter((id) => id !== memberId) });
    onSendMessage({
      id: `group-narrate-${Date.now()}`,
      characterId: activeCharacter.id,
      sender: "character",
      isNarration: true,
      content: `您将 ${memberName} 移出了群聊`,
      timestamp: Date.now(),
    });
  }, [activeCharacter, characters, onSaveCharacter, onSendMessage]);

  const handleAddGroupMembers = useCallback((newMemberIds: string[]) => {
    if (!activeCharacter || !activeCharacter.memberIds || newMemberIds.length === 0) return;
    onSaveCharacter({ ...activeCharacter, memberIds: [...activeCharacter.memberIds, ...newMemberIds] });
    const invitedNames = newMemberIds.map((id) => {
      const character = characters.find((item) => item.id === id);
      return character ? (character.remark || character.name) : "";
    }).filter(Boolean).join("、");
    onSendMessage({
      id: `group-narrate-${Date.now()}`,
      characterId: activeCharacter.id,
      sender: "character",
      isNarration: true,
      content: `您邀请了 ${invitedNames} 加入了群聊`,
      timestamp: Date.now(),
    });
    setShowAddMemberModal(false);
  }, [activeCharacter, characters, onSaveCharacter, onSendMessage, setShowAddMemberModal]);

  return { handleRemoveGroupMember, handleAddGroupMembers };
}
