import { analyzeConversationFlow, type ConversationTopicState } from "../../../domain/prompt/conversationFlow";
import type { Message } from "../../../types";
import { decideChatDialogueStrategy, type DialogueStrategy } from "./chatDialogueStrategy";
import { trackShortTermChatEmotion, type ChatEmotion } from "./chatEmotionTracker";

/**
 * Ephemeral, request-scoped conversation projection for one online direct
 * reply. It is derived afresh from supplied messages and is never persisted.
 */
export interface ConversationState {
  topic: {
    name?: string;
    status: ConversationTopicState;
  };
  emotion: {
    userEmotion: ChatEmotion;
    characterEmotion: ChatEmotion;
    intensity: number;
  };
  strategy: DialogueStrategy;
  guidance: {
    shouldChangeTopic: boolean;
    shouldAvoidRepetition: boolean;
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

/**
 * Builds the one-turn Conversation Brain state from recent online messages.
 * This pure function has no access to Storage, Memory, Relationship, Truth
 * Layer, CharacterEvent, persona data, or WorldBook.
 */
export function buildConversationState(
  messages: readonly Message[],
  characterId: string,
  limit = 12,
): ConversationState {
  const flow = analyzeConversationFlow(messages, characterId, limit);
  const emotions = trackShortTermChatEmotion(messages, characterId, limit);
  const strategy = decideChatDialogueStrategy({ flow, emotions, messages, characterId });
  const emotionHasDecayed = emotions.user.decay || emotions.character.decay;
  const topicHasEnded = flow.state === "naturally-completed";

  return {
    topic: {
      status: flow.state,
    },
    emotion: {
      userEmotion: emotions.user.emotion,
      characterEmotion: emotions.character.emotion,
      // One compact signal is enough for the adapter: retain the stronger
      // current tone without inventing a durable combined emotion.
      intensity: clamp(Math.max(emotions.user.intensity, emotions.character.intensity)),
    },
    strategy: strategy.strategy,
    guidance: {
      shouldChangeTopic: topicHasEnded || flow.shouldTransition || emotionHasDecayed,
      shouldAvoidRepetition: flow.repeatedTopicTurns >= 2 || flow.repeatedEmotionTurns >= 2 || emotionHasDecayed,
    },
  };
}
