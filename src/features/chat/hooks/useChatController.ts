import { useEffect, useRef, useState, type FormEvent } from "react";
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
  signal?: AbortSignal,
) => Promise<void> | void;

export type CharacterImageHandler = (
  trigger: "manual" | "explicit-user-text",
  userText: string,
  signal?: AbortSignal,
) => Promise<boolean>;

export interface UseChatControllerOptions {
  activeChatCharId: string | null;
  activeCharacter: Character | undefined;
  getQuotedSenderName?: (message: Message) => string | undefined;
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
  onReplyStopped?: () => void;
}

/**
 * Keeps the existing regular text-send behavior together while AppChat is
 * gradually reduced to layout and composition. This hook deliberately does
 * not own AI, relationship, memory, or special-message business rules.
 */
export function useChatController({
  activeChatCharId,
  activeCharacter,
  getQuotedSenderName,
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
  onReplyStopped,
}: UseChatControllerOptions) {
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  // Reply generation belongs to a conversation scope, not to the chat page.
  // Keeping one global lock meant opening B while A was waiting silently
  // discarded B's request, and one global AbortController made stopping one
  // chat cancel another chat's reply.
  const replyInFlightRef = useRef<Set<string>>(new Set());
  const replyAbortControllerRef = useRef<Map<string, AbortController>>(new Map());
  const [isReplyInFlight, setIsReplyInFlight] = useState(false);

  const scopeKey = runtimeContext.isGroup
    ? `group:${runtimeContext.groupId || runtimeContext.characterId || ""}:${runtimeContext.conversationId || ""}`
    : `direct:${runtimeContext.userIdentityId}:${runtimeContext.relationId || ""}:${runtimeContext.conversationId || ""}`;
  const currentScopeKeyRef = useRef(scopeKey);
  currentScopeKeyRef.current = scopeKey;
  useEffect(() => {
    setQuotedMessage(null);
    setIsReplyInFlight(false);
    // Do not abort a reply when this controller unmounts. AppChat is a view
    // layer: navigating home, opening another app, or switching browser tabs
    // must not cancel the character's API request. The parent App and its
    // message repository stay mounted, so the captured response can still be
    // persisted and will be visible when the conversation is opened again.
    // Cancellation remains explicit through stopReply().
  }, [scopeKey]);

  const quoteBelongsToRuntime = (message: Message): boolean => runtimeContext.isGroup
    ? message.characterId === runtimeContext.groupId && message.conversationId === runtimeContext.conversationId
    : message.characterId === runtimeContext.characterId
      && message.relationId === runtimeContext.relationId
      && (!message.conversationId || message.conversationId === runtimeContext.conversationId);

  // Handle Send Message (User sends only, no immediate reply)
  const handleSendOnly = async (inputText: string, event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!inputText.trim() || !activeChatCharId || !activeCharacter) return;

    const safeQuotedMessage = quotedMessage && quoteBelongsToRuntime(quotedMessage) ? quotedMessage : null;
    const userMsgText = safeQuotedMessage && activeCharacter
      ? formatQuotedChatInput(inputText.trim(), safeQuotedMessage, activeCharacter, getQuotedSenderName?.(safeQuotedMessage))
      : inputText.trim();
    if (quotedMessage) setQuotedMessage(null);

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
  const handleSendAndReply = async (inputText: string, event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!activeChatCharId || !activeCharacter || replyInFlightRef.current.has(scopeKey)) return;
    replyInFlightRef.current.add(scopeKey);
    setIsReplyInFlight(true);
    const abortController = new AbortController();
    replyAbortControllerRef.current.set(scopeKey, abortController);

    try {
      if (!inputText.trim()) {
        // If user input is empty, trigger AI response directly (continue the story)
        await generateResponseForUserMessage(null, currentChatMessages, abortController.signal);
        return;
      }

      const rawUserRequest = inputText.trim();
      const pendingImageRequest = !isOfflineModeActive
        ? getPendingExplicitImageRequest(rawUserRequest, currentChatMessages)
        : null;
      const shouldGenerateExplicitImage = Boolean(pendingImageRequest);
      const safeQuotedMessage = quotedMessage && quoteBelongsToRuntime(quotedMessage) ? quotedMessage : null;
      const userMsgText = safeQuotedMessage && activeCharacter
        ? formatQuotedChatInput(rawUserRequest, safeQuotedMessage, activeCharacter, getQuotedSenderName?.(safeQuotedMessage))
        : rawUserRequest;
      if (quotedMessage) setQuotedMessage(null);

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
        await generateAndSendCharacterImage("explicit-user-text", pendingImageRequest!, abortController.signal);
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
      await generateResponseForUserMessage(userMessage, history, abortController.signal);
    } finally {
      replyInFlightRef.current.delete(scopeKey);
      if (replyAbortControllerRef.current.get(scopeKey) === abortController) {
        replyAbortControllerRef.current.delete(scopeKey);
      }
      setIsReplyInFlight(replyInFlightRef.current.has(currentScopeKeyRef.current));
    }
  };

  const stopReply = () => {
    const controller = replyAbortControllerRef.current.get(scopeKey);
    if (!controller) return;
    controller.abort();
    replyAbortControllerRef.current.delete(scopeKey);
    replyInFlightRef.current.delete(scopeKey);
    setIsReplyInFlight(false);
    onReplyStopped?.();
  };

  return {
    quotedMessage,
    setQuotedMessage,
    handleSendOnly,
    handleSendAndReply,
    stopReply,
    isReplyInFlight,
  };
}
