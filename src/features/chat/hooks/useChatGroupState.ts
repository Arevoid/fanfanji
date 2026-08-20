import { useRef, useState } from "react";
import type { Message } from "../../../types";

/** Owns group-chat creation form state and the pending welcome handoff. */
export function useChatGroupState() {
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [pendingGroupWelcome, setPendingGroupWelcome] = useState<{ groupId: string; narration: Message } | null>(null);
  const pendingGroupWelcomeIdRef = useRef<string | null>(null);

  return {
    showCreateGroupModal,
    setShowCreateGroupModal,
    groupNameInput,
    setGroupNameInput,
    selectedGroupMemberIds,
    setSelectedGroupMemberIds,
    pendingGroupWelcome,
    setPendingGroupWelcome,
    pendingGroupWelcomeIdRef,
  };
}
