import { useEffect, useState } from "react";
import type { Message } from "../../../types";
import { readArray } from "../../../core/storage/repositories/repositoryUtils";
import { readJson, writeJson } from "../../../core/storage/storageAdapter";
import { markChatInitiated, markChatRead } from "../controllers/chatSideEffectController";

interface UseChatReadStateOptions {
  activeChatCharId?: string | null;
  activeChatRelationId?: string | null;
  messages: Message[];
}

/** Owns initiated-thread and unread timestamp persistence for the chat shell. */
export function useChatReadState({ activeChatCharId, activeChatRelationId, messages }: UseChatReadStateOptions) {
  const [initiatedChatIds, setInitiatedChatIds] = useState<string[]>(() =>
    readArray<string>("phone_initiated_chat_ids", []).value);
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, number>>(() =>
    readJson<Record<string, number>>("phone_last_read_timestamps", {}).value);

  useEffect(() => {
    writeJson("phone_initiated_chat_ids", initiatedChatIds);
  }, [initiatedChatIds]);

  useEffect(() => {
    const chatKey = activeChatCharId ? (activeChatRelationId || activeChatCharId) : null;
    if (chatKey && !initiatedChatIds.includes(chatKey)) setInitiatedChatIds((previous) => markChatInitiated(previous, chatKey));
  }, [activeChatCharId, activeChatRelationId, initiatedChatIds]);

  useEffect(() => {
    writeJson("phone_last_read_timestamps", lastReadTimestamps);
  }, [lastReadTimestamps]);

  useEffect(() => {
    const chatKey = activeChatCharId ? (activeChatRelationId || activeChatCharId) : null;
    if (chatKey) setLastReadTimestamps((previous) => markChatRead(previous, chatKey, Date.now()));
  }, [activeChatCharId, activeChatRelationId, messages.length]);

  const getUnreadCount = (chatKey: string) => {
    const activeChatKey = activeChatCharId ? (activeChatRelationId || activeChatCharId) : null;
    if (activeChatKey === chatKey) return 0;
    const lastRead = lastReadTimestamps[chatKey] || 0;
    return messages.filter((message) =>
      (message.relationId === chatKey || (!message.relationId && message.characterId === chatKey))
      && message.sender === "character" && !message.isOffline && message.timestamp > lastRead,
    ).length;
  };

  return { initiatedChatIds, setInitiatedChatIds, lastReadTimestamps, setLastReadTimestamps, getUnreadCount };
}
