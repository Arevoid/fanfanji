import { useState } from "react";
import type { Message } from "../../../types";

export function useChatMessageInteractionState() {
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [showDisbandGroupModal, setShowDisbandGroupModal] = useState(false);
  const [activeMenuMsg, setActiveMenuMsg] = useState<Message | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isMultiSelectDeleteMode, setIsMultiSelectDeleteMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [selectedFileNote, setSelectedFileNote] = useState<{ title: string; content: string } | null>(null);
  const [showOocCommentModal, setShowOocCommentModal] = useState<Message | null>(null);
  const [oocCommentText, setOocCommentText] = useState("");

  return {
    showClearHistoryModal, setShowClearHistoryModal, showDisbandGroupModal, setShowDisbandGroupModal,
    activeMenuMsg, setActiveMenuMsg, menuPosition, setMenuPosition, isMultiSelectDeleteMode, setIsMultiSelectDeleteMode,
    selectedMessageIds, setSelectedMessageIds, selectedFileNote, setSelectedFileNote,
    showOocCommentModal, setShowOocCommentModal, oocCommentText, setOocCommentText,
  };
}
