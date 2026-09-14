import type { Message } from "../../../types";
import { applyTopicRuntimeTransition, type TopicBoundaryMode } from "../../../domain/continuity/topicRuntime";
import { updateContinuityRuntimeStore } from "../../../core/storage/repositories/continuityRuntimeRepository";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";
import { decideDirectChatTopicBoundary } from "./directChatTopicBoundary";

const cleanTopic = (content: string): string => content
  .replace(/data:image\/[a-z0-9.+-]+;base64,[^\s]+/giu, "")
  .replace(/^\[(?:图片|image)(?:\|[^\]]*)?\]$/iu, "图片消息")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, 120);

/** Persists compact topic metadata after a user message is accepted. */
export function persistDirectChatTopicRuntime(input: {
  message: Message;
  previousMessages: readonly Message[];
  context: ChatRuntimeContext;
  enableTimeAwareness: boolean;
}): void {
  if (input.context.isGroup || !input.context.characterId || !input.context.relationId) return;
  const scope = {
    characterId: input.context.characterId,
    relationId: input.context.relationId,
    userIdentityId: input.context.userIdentityId,
    ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}),
  };
  const decision = decideDirectChatTopicBoundary({
    currentMessage: input.message,
    previousMessages: input.previousMessages,
    enableTimeAwareness: input.enableTimeAwareness,
  });
  const mode: TopicBoundaryMode = decision.mode === "uncertain" && input.previousMessages.length === 0
    ? "shift"
    : decision.mode;
  const topic = cleanTopic(input.message.content) || "图片消息";
  try {
    updateContinuityRuntimeStore((store) => {
      const current = store.topics.find((state) => state.scope.characterId === scope.characterId
        && state.scope.relationId === scope.relationId
        && state.scope.userIdentityId === scope.userIdentityId);
      const next = applyTopicRuntimeTransition(current, {
        scope,
        mode,
        at: input.message.timestamp,
        topic,
        transitionReason: decision.reasons.join(",") || `boundary_${mode}`,
        relevantMessageRefs: [input.message.id],
      });
      return {
        ...store,
        topics: current
          ? store.topics.map((state) => state === current ? next : state)
          : [...store.topics, next],
      };
    });
  } catch (error) {
    console.warn("[continuity] Failed to persist direct-chat topic runtime.", error);
  }
}
