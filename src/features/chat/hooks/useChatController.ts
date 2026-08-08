import { useEffect, useState, type FormEvent } from "react";
import type { Character, Message, OfflineStory } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";
import {
  appendChatUserMessageToOfflineStory,
  createChatUserMessage,
  formatQuotedChatInput,
} from "../controllers/chatController";
import { getPendingExplicitImageRequest } from "../services/imageGenerationIntent";

export type ChatResponseHandler = (
  userMessage: Message | null,
  history?: Message[],
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
  runtimeContext: ChatRuntimeContext;
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
  runtimeContext,
}: UseChatControllerOptions) {
  const [chatInputText, setChatInputText] = useState("");
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);

  const scopeKey = runtimeContext.isGroup
    ? `group:${runtimeContext.groupId || runtimeContext.characterId || ""}:${runtimeContext.conversationId || ""}`
    : `direct:${runtimeContext.userIdentityId}:${runtimeContext.relationId || ""}:${runtimeContext.conversationId || ""}`;
  useEffect(() => {
    setChatInputText("");
    setQuotedMessage(null);
  }, [scopeKey]);

  const quoteBelongsToRuntime = (message: Message): boolean => runtimeContext.isGroup
    ? message.characterId === runtimeContext.groupId && message.conversationId === runtimeContext.conversationId
    : message.characterId === runtimeContext.characterId
      && message.relationId === runtimeContext.relationId
      && (!message.conversationId || message.conversationId === runtimeContext.conversationId);

  // Handle Send Message (User sends only, no immediate reply)
  const handleSendOnly = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!chatInputText.trim() || !activeChatCharId || !activeCharacter) return;

    const safeQuotedMessage = quotedMessage && quoteBelongsToRuntime(quotedMessage) ? quotedMessage : null;
    const userMsgText = safeQuotedMessage && activeCharacter
      ? formatQuotedChatInput(chatInputText.trim(), safeQuotedMessage, activeCharacter)
      : chatInputText.trim();
    if (quotedMessage) setQuotedMessage(null);
    setChatInputText("");

    const userMessage = createChatUserMessage({
      context: runtimeContext,
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
    const safeQuotedMessage = quotedMessage && quoteBelongsToRuntime(quotedMessage) ? quotedMessage : null;
    const userMsgText = safeQuotedMessage && activeCharacter
      ? formatQuotedChatInput(rawUserRequest, safeQuotedMessage, activeCharacter)
      : rawUserRequest;
    if (quotedMessage) setQuotedMessage(null);
    setChatInputText("");

    const userMessage = createChatUserMessage({
      context: runtimeContext,
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
