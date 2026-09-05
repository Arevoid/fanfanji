import { useState } from "react";

export type ChatTab = "chats" | "contacts" | "moments" | "me";

export function useChatNavigationState() {
  const [activeTab, setActiveTab] = useState<ChatTab>("chats");
  const [momentsFilterCharId, setMomentsFilterCharId] = useState<string | null>(null);
  const [singleCharacterMomentsId, setSingleCharacterMomentsId] = useState<string | null>(null);
  const [isShowingAddFriendDialog, setIsShowingAddFriendDialog] = useState(false);

  return {
    activeTab,
    setActiveTab,
    momentsFilterCharId,
    setMomentsFilterCharId,
    singleCharacterMomentsId,
    setSingleCharacterMomentsId,
    isShowingAddFriendDialog,
    setIsShowingAddFriendDialog,
  };
}
