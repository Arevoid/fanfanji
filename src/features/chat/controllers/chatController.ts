import type { Character, Message, OfflineStory } from "../../../types";
import { createId } from "../../../core/id/createId";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";
import { createUserTextMessage } from "../services/messageFactory";

export function formatQuotedChatInput(
  inputText: string,
  quotedMessage: Message,
  activeCharacter: Character,
): string {
  const senderName = quotedMessage.sender === "user"
    ? "我"
    : (activeCharacter.remark || activeCharacter.name);
  let shortContent = quotedMessage.content;
  if (shortContent.startsWith("[文件]")) {
    const parts = shortContent.split("|");
    shortContent = `[文件] ${parts[1] || "笔记"}`;
  } else if (shortContent.startsWith("[红包]")) {
    shortContent = "[红包]";
  } else if (shortContent.startsWith("[位置]")) {
    shortContent = "[位置]";
  } else if (shortContent.startsWith("[音乐]")) {
    shortContent = "[音乐]";
  }
  return `「引用 ${senderName}：${shortContent}」\n${inputText}`;
}

export function createChatUserMessage(input: {
  characterId?: string;
  context?: ChatRuntimeContext;
  content: string;
  isOfflineModeActive: boolean;
  isInputNarration: boolean;
}): Message {
  return createUserTextMessage({
    id: createId("user"),
    characterId: input.characterId,
    context: input.context,
    content: input.content,
    timestamp: Date.now(),
    isOffline: input.isOfflineModeActive ? true : undefined,
    isNarration: input.isOfflineModeActive ? input.isInputNarration : undefined,
  });
}

export function appendChatUserMessageToOfflineStory(input: {
  userMessage: Message;
  isOfflineModeActive: boolean;
  activeOfflineStoryId: string | null;
  offlineStories: OfflineStory[];
  onSaveOfflineStory?: (story: OfflineStory) => void;
}): Message[] | null {
  if (!input.isOfflineModeActive || !input.activeOfflineStoryId || !input.onSaveOfflineStory) return null;

  const targetStory = input.offlineStories.find((story) => story.id === input.activeOfflineStoryId);
  if (!targetStory) return null;

  const updatedStory = {
    ...targetStory,
    messages: [...targetStory.messages, input.userMessage],
    updatedAt: Date.now(),
  };
  input.onSaveOfflineStory(updatedStory);
  return updatedStory.messages;
}
