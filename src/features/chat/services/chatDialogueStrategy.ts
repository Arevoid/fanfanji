import type { ConversationFlowAnalysis } from "../../../domain/prompt/conversationFlow";
import type { Message } from "../../../types";
import type { ChatEmotionSnapshot, ChatEmotion } from "./chatEmotionTracker";

export type DialogueStrategy = "comfort" | "ask" | "share" | "tease" | "continue" | "transition";

export interface DialogueStrategyDecision {
  strategy: DialogueStrategy;
}

export interface DialogueStrategyInput {
  flow: ConversationFlowAnalysis;
  emotions: ChatEmotionSnapshot;
  messages: readonly Message[];
  characterId: string;
}

const NEGATIVE_EMOTIONS: readonly ChatEmotion[] = ["sad", "angry", "anxious"];
const QUESTION_PATTERN = /[?？]|(怎么|什么|为何|为什么|能不能|可不可以|要不要|好吗|行吗|有没有|几点|谁|哪儿|哪里)/;
const CHARACTER_STATUS_QUESTION_PATTERN = /(你(?:今天|现在|刚刚|在)?(?:怎么样|在干嘛|干什么|好吗|还顺利吗|顺利吗)|你呢|说说你|你今天过得)/;
const USER_EVENT_PATTERN = /(我(?:今天|刚刚|刚才|这两天|上班|下班|去了|看到|遇到|做了|吃了|收到了|发生了)|今天.*(?:发生|遇到|看到|去了|做了)|刚刚.*(?:发生|遇到|看到|去了|做了))/;

function latestUserMessage(messages: readonly Message[], characterId: string): Message | undefined {
  return [...messages]
    .filter((message) => message.characterId === characterId && message.sender === "user" && !message.isOffline && !message.isNarration)
    .sort((left, right) => left.timestamp - right.timestamp)
    .at(-1);
}

/**
 * Selects the interaction direction for one online-chat reply. It is pure and
 * intentionally does not know about durable character facts, Memory, or any
 * relationship store.
 */
export function decideChatDialogueStrategy(input: DialogueStrategyInput): DialogueStrategyDecision {
  const { flow, emotions, messages, characterId } = input;
  const latestUser = latestUserMessage(messages, characterId)?.content.trim() ?? "";

  // A negative user state wins over pacing: acknowledge and support before
  // changing subjects or playfully deflecting.
  if (NEGATIVE_EMOTIONS.includes(emotions.user.emotion)) return { strategy: "comfort" };

  // Avoid escalating a repeated feeling from either side or a topic that has
  // already landed. This is deliberately before playful interaction.
  if (flow.state === "naturally-completed" || flow.shouldTransition || emotions.character.decay || emotions.user.decay) {
    return { strategy: "transition" };
  }

  // A direct question about the character invites a small in-character share;
  // the prompt still forbids inventing unestablished concrete events.
  if (CHARACTER_STATUS_QUESTION_PATTERN.test(latestUser)) return { strategy: "share" };

  // A user describing a real recent event benefits from a focused follow-up
  // question rather than reflexively redirecting back to the character.
  if (USER_EVENT_PATTERN.test(latestUser)) return { strategy: "ask" };

  if (emotions.user.emotion === "playful" && !emotions.user.decay && !emotions.character.decay) {
    return { strategy: "tease" };
  }

  // Keep an active question, promise, or ordinary exchange moving without
  // forcing a new subject.
  if (flow.state === "needs-follow-up" || QUESTION_PATTERN.test(latestUser) || flow.state === "active") {
    return { strategy: "continue" };
  }

  return { strategy: "continue" };
}
