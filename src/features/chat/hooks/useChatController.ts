import { useState, type FormEvent } from "react";
import type { Character, Message, OfflineStory } from "../../../types";
import {
  appendChatUserMessageToOfflineStory,
  createChatUserMessage,
  formatQuotedChatInput,
} from "../controllers/chatController";
import { getPendingExplicitImageRequest } from "../services/imageGenerationIntent";

export type ChatResponseHandler = (
  userMessage: Message | null,
  history?: Message[],
  options?: { forumShareTrigger?: boolean },
) => Promise<void> | void;

export type CharacterImageHandler = (
  trigger: "manual" | "explicit-user-text",
  userText: string,
) => Promise<boolean>;

export interface UseChatControllerOptions {
  activeChatCharId: string | null;
  activeCharacter: Character | undefined;
  currentChatMessages: Message[];
  onSendMessage: (message: Message) => void;
  generateResponseForUserMessage: ChatResponseHandler;
  generateAndSendCharacterImage: CharacterImageHandler;
  offlineStories: OfflineStory[];
  onSaveOfflineStory?: (story: OfflineStory) => void;
  isOfflineModeActive: boolean;
  isInputNarration: boolean;
  activeOfflineStoryId: string | null;
}

/**
 * Keeps the existing regular text-send behavior together while AppChat is
 * gradually reduced to layout and composition. This hook deliberately does
 * not own AI, relationship, memory, or special-message business rules.
 */
export function useChatController({
  activeChatCharId,
  activeCharacter,
  currentChatMessages,
  onSendMessage,
  generateResponseForUserMessage,
  generateAndSendCharacterImage,
  offlineStories,
  onSaveOfflineStory,
  isOfflineModeActive,
  isInputNarration,
  activeOfflineStoryId,
}: UseChatControllerOptions) {
  const [chatInputText, setChatInputText] = useState("");
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);

  // Handle Send Message (User sends only, no immediate reply)
  const handleSendOnly = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!chatInputText.trim() || !activeChatCharId || !activeCharacter) return;

    const userMsgText = quotedMessage && activeCharacter
      ? formatQuotedChatInput(chatInputText.trim(), quotedMessage, activeCharacter)
      : chatInputText.trim();
    if (quotedMessage) setQuotedMessage(null);
    setChatInputText("");

    const userMessage = createChatUserMessage({
      characterId: activeChatCharId,
      content: userMsgText,
      isOfflineModeActive,
      isInputNarration,
    });
    onSendMessage(userMessage);
    appendChatUserMessageToOfflineStory({
      userMessage,
      isOfflineModeActive,
      activeOfflineStoryId,
      offlineStories,
      onSaveOfflineStory,
    });
  };

  // Handle Send Message and Trigger AI reply
  const handleSendAndReply = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!activeChatCharId || !activeCharacter) return;

    if (!chatInputText.trim()) {
      // If user input is empty, trigger AI response directly (continue the story)
      generateResponseForUserMessage(null, currentChatMessages);
      return;
    }

    const rawUserRequest = chatInputText.trim();
    const pendingImageRequest = !isOfflineModeActive
      ? getPendingExplicitImageRequest(rawUserRequest, currentChatMessages)
      : null;
    const shouldGenerateExplicitImage = Boolean(pendingImageRequest);
    const userMsgText = quotedMessage && activeCharacter
      ? formatQuotedChatInput(rawUserRequest, quotedMessage, activeCharacter)
      : rawUserRequest;
    if (quotedMessage) setQuotedMessage(null);
    setChatInputText("");

    const userMessage = createChatUserMessage({
      characterId: activeChatCharId,
      content: userMsgText,
      isOfflineModeActive,
      isInputNarration,
    });
    onSendMessage(userMessage);

    // An explicit image request is an image-only turn: the real image must be
    // persisted before any character text is allowed.
    if (shouldGenerateExplicitImage) {
      await generateAndSendCharacterImage("explicit-user-text", pendingImageRequest!);
      return;
    }

    const updatedOfflineMessages = appendChatUserMessageToOfflineStory({
      userMessage,
      isOfflineModeActive,
      activeOfflineStoryId,
      offlineStories,
      onSaveOfflineStory,
    });
    const history = isOfflineModeActive && activeOfflineStoryId && onSaveOfflineStory
      ? (updatedOfflineMessages || currentChatMessages)
      : [...currentChatMessages, userMessage];
    generateResponseForUserMessage(userMessage, history);
  };

  return {
    chatInputText,
    setChatInputText,
    quotedMessage,
    setQuotedMessage,
    handleSendOnly,
    handleSendAndReply,
  };
}
