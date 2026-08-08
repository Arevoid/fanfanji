import type { Message } from "../../../types";

/** Request-time emotion labels. They are never persisted as character data. */
export type ChatEmotion =
  | "happy"
  | "playful"
  | "sad"
  | "angry"
  | "anxious"
  | "affectionate"
  | "neutral";

export interface ShortTermEmotionState {
  emotion: ChatEmotion;
  /** A bounded presentation signal for this turn only. */
  intensity: number;
  /** True when the same speaker has already expressed this emotion repeatedly. */
  decay: boolean;
}

/**
 * A per-turn online-chat projection. This type deliberately contains no
 * relation IDs, identity IDs, Memory, or durable character state.
 */
export interface ChatEmotionSnapshot {
  user: ShortTermEmotionState;
  character: ShortTermEmotionState;
}

const EMOTION_PATTERNS: readonly { emotion: Exclude<ChatEmotion, "neutral">; pattern: RegExp }[] = [
  { emotion: "angry", pattern: /(生气|气死|火大|烦死|讨厌|别理|吵架|滚|烦)/ },
  { emotion: "sad", pattern: /(难过|伤心|委屈|失落|想哭|哭了|难受|心酸)/ },
  { emotion: "anxious", pattern: /(担心|害怕|紧张|焦虑|不安|睡不着|慌|忐忑)/ },
  { emotion: "affectionate", pattern: /(想你|想念|喜欢|爱你|抱抱|亲亲|宝宝|宝贝|老公|老婆|乖乖|摸摸)/ },
  { emotion: "playful", pattern: /(哼|才不|略略|逗你|笨蛋|坏蛋|调皮|撒娇|嘿嘿)/ },
  { emotion: "happy", pattern: /(开心|高兴|好耶|哈哈|笑死|乐死|快乐|太好了|嘿)/ },
];
const CLOSING_PATTERN = /(晚安|先睡|睡吧|再见|拜拜|回头聊|下次聊|先这样|我去忙)/;
const SHORT_CLOSING_PATTERN = /^(好啦|好了|行了|收到)[！!。…~～]*$/;

function isOnlineConversationMessage(message: Message, characterId: string): boolean {
  return message.characterId === characterId
    && !message.isOffline
    && !message.isNarration
    && !message.content.startsWith("[System");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function detectEmotion(content: string): Omit<ShortTermEmotionState, "decay"> {
  const normalized = content.trim();
  // Clear endings intentionally release the previous emotional thread rather
  // than carrying a stale feeling into a new subject.
  if (!normalized || CLOSING_PATTERN.test(normalized) || SHORT_CLOSING_PATTERN.test(normalized)) {
    return { emotion: "neutral", intensity: 0 };
  }

  const matched = EMOTION_PATTERNS.filter(({ pattern }) => pattern.test(normalized));
  const selected = matched.at(0);
  if (!selected) return { emotion: "neutral", intensity: 0 };

  const emphasis = (normalized.match(/[!！]/g)?.length ?? 0) * 0.05;
  const keywordBoost = Math.min(0.2, Math.max(0, matched.length - 1) * 0.1);
  return { emotion: selected.emotion, intensity: clamp(0.65 + keywordBoost + emphasis) };
}

function calculateSpeakerEmotion(messages: readonly Message[], sender: Message["sender"]): ShortTermEmotionState {
  const speakerMessages = messages.filter((message) => message.sender === sender);
  const latest = speakerMessages.at(-1);
  if (!latest) return { emotion: "neutral", intensity: 0, decay: false };

  const latestEmotion = detectEmotion(latest.content);
  if (latestEmotion.emotion === "neutral") return { ...latestEmotion, decay: false };

  let consecutiveExpressions = 0;
  for (let index = speakerMessages.length - 1; index >= 0; index -= 1) {
    const detected = detectEmotion(speakerMessages[index].content);
    if (detected.emotion !== latestEmotion.emotion) break;
    consecutiveExpressions += 1;
  }

  // First expression keeps its natural strength. Repeated delivery tapers
  // quickly (roughly 0.8 -> 0.6 -> 0.3) so the model has room to soften,
  // conclude, or change topics instead of escalating the same feeling.
  const decayMultiplier = consecutiveExpressions <= 1
    ? 1
    : consecutiveExpressions === 2
      ? 0.75
      : consecutiveExpressions === 3
        ? 0.4
        : 0.25;
  return {
    emotion: latestEmotion.emotion,
    intensity: clamp(latestEmotion.intensity * decayMultiplier),
    decay: consecutiveExpressions >= 2,
  };
}

/**
 * Calculates the current short-term emotional tone from supplied online
 * messages only. It has no side effects and is safe to call before every AI
 * reply.
 */
export function trackShortTermChatEmotion(
  messages: readonly Message[],
  characterId: string,
  limit = 12,
): ChatEmotionSnapshot {
  const recentMessages = messages
    .filter((message) => isOnlineConversationMessage(message, characterId))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-limit);

  return {
    user: calculateSpeakerEmotion(recentMessages, "user"),
    character: calculateSpeakerEmotion(recentMessages, "character"),
  };
}
