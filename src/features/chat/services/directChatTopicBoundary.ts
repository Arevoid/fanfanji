import type { Message } from "../../../types";

export type DirectChatTopicBoundaryMode = "continue" | "shift" | "uncertain";

export interface DirectChatTopicBoundaryDecision {
  mode: DirectChatTopicBoundaryMode;
  confidence: number;
  reasons: string[];
}

type TopicMessage = Pick<Message, "sender" | "content" | "timestamp" | "imageAssetId">;

const EXPLICIT_SHIFT_PATTERN = /(?:换个话题|换个聊法|聊点别的|说点别的|不聊(?:这个|了)|先不说(?:这个|了)|重新开始|开始新话题|另一个话题|对了(?:[，,、]\s*(?:换个|聊点|说点|另外|另一件|我想聊|今天|现在)))/u;
const EXPLICIT_CONTINUE_PATTERN = /(?:继续|上次|之前|刚才|还记得|后来|结果|接着|那个(?:问题|事情|话题|图片)|你说的|这件事)/u;
const PRIOR_REFERENCE_PATTERN = /(?:刚才|上次|之前|那个(?:问题|事情|话题|图片)|你说的|还记得|后来|结果)/u;
const CLOSURE_PATTERN = /(?:晚安|先这样|回头聊|下次再说|我先忙|拜拜|睡了|到家再聊|改天聊|先不聊了|先去忙)/u;
const OPEN_THREAD_PATTERN = /(?:[?？]|要不要|什么时候|等你|回来|记得|答应|还没|没完|待会|之后|下次)/u;

const normalizeTopicText = (value: string): string => value
  .replace(/data:image\/[a-z0-9.+-]+;base64,[^\s]+/giu, " ")
  .replace(/\[[^\]]*\]/gu, " ")
  .replace(/\s+/gu, " ")
  .trim()
  .toLocaleLowerCase();

const isImageMessage = (message: Pick<TopicMessage, "content" | "imageAssetId">): boolean => Boolean(
  message.imageAssetId
  || /^data:image\//iu.test(message.content.trim())
  || /^\[图片\](?:$|\|)/u.test(message.content.trim())
  || /^\[image\](?:$|\|)/iu.test(message.content.trim()),
);

const topicUnits = (value: string): Set<string> => {
  const normalized = normalizeTopicText(value).replace(/[^\p{L}\p{N}\p{Script=Han}]/gu, "");
  if (normalized.length <= 4) return new Set(Array.from(normalized));
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
};

const calculateTopicOverlap = (currentText: string, previousText: string): number => {
  const currentUnits = topicUnits(currentText);
  if (currentUnits.size === 0) return 0;
  const previousUnits = topicUnits(previousText);
  let overlap = 0;
  currentUnits.forEach((unit) => {
    if (previousUnits.has(unit)) overlap += 1;
  });
  return overlap / currentUnits.size;
};

const sameCalendarDay = (left: number, right: number): boolean => {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate();
};

/**
 * Decide whether a direct-chat turn starts a fresh topic without another AI
 * request. Time is only one signal; explicit wording, closure, references,
 * lexical continuity, and fresh media are combined here.
 */
export function decideDirectChatTopicBoundary(input: {
  currentMessage?: Pick<TopicMessage, "content" | "timestamp" | "imageAssetId">;
  previousMessages: readonly TopicMessage[];
  enableTimeAwareness: boolean;
}): DirectChatTopicBoundaryDecision {
  const current = input.currentMessage;
  if (!current) return { mode: "uncertain", confidence: 0, reasons: ["no_current_message"] };

  const currentText = normalizeTopicText(current.content);
  const previous = [...input.previousMessages]
    .filter((message) => Number.isFinite(message.timestamp) && message.timestamp <= current.timestamp)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (previous.length === 0) return { mode: "uncertain", confidence: 0, reasons: ["no_previous_messages"] };

  const recent = previous.slice(-8);
  const recentText = recent.map((message) => normalizeTopicText(message.content)).filter(Boolean).join(" ");
  const latest = recent[recent.length - 1];
  const gapMs = Math.max(0, current.timestamp - latest.timestamp);
  const longGap = gapMs >= 30 * 60 * 1000;
  const crossDay = !sameCalendarDay(current.timestamp, latest.timestamp);
  const currentIsImage = isImageMessage(current);
  const explicitShift = EXPLICIT_SHIFT_PATTERN.test(currentText);
  const explicitContinue = EXPLICIT_CONTINUE_PATTERN.test(currentText);
  const priorReference = PRIOR_REFERENCE_PATTERN.test(currentText);
  const priorClosed = CLOSURE_PATTERN.test(normalizeTopicText(recent.slice(-2).map((message) => message.content).join(" ")));
  const priorOpen = OPEN_THREAD_PATTERN.test(normalizeTopicText(recent.slice(-2).map((message) => message.content).join(" ")));
  const overlap = calculateTopicOverlap(currentText, recentText);
  const lowOverlap = currentText.length > 0 && overlap < 0.2;
  const reasons: string[] = [];

  if (explicitShift) {
    return { mode: "shift", confidence: 0.99, reasons: ["explicit_topic_shift"] };
  }
  if (explicitContinue || priorReference) {
    reasons.push(explicitContinue ? "explicit_continuation" : "prior_topic_reference");
    return { mode: "continue", confidence: explicitContinue ? 0.99 : 0.86, reasons };
  }

  let score = 0;
  if (input.enableTimeAwareness && longGap) {
    score += 0.2;
    reasons.push("long_gap_support");
  }
  if (input.enableTimeAwareness && crossDay) {
    score += 0.2;
    reasons.push("cross_day_support");
  }
  if (lowOverlap) {
    score += 0.3;
    reasons.push("low_recent_topic_overlap");
  }
  if (priorClosed) {
    score += 0.2;
    reasons.push("prior_turn_closed");
  }
  if (priorOpen) {
    score -= 0.35;
    reasons.push("prior_turn_open");
  }

  // A new image after a long pause has no reliable local text signal. Unless
  // the user explicitly referred to the old topic (handled above), treat it
  // as a fresh topic so stale chat prose cannot dominate its interpretation.
  if (currentIsImage && (longGap || crossDay)) {
    score += 0.45;
    reasons.push("fresh_media_after_pause");
  }

  if (score >= 0.5) {
    return { mode: "shift", confidence: Math.min(0.95, 0.55 + score / 2), reasons };
  }
  if (score <= -0.25) {
    return { mode: "continue", confidence: Math.min(0.9, 0.55 + Math.abs(score) / 2), reasons };
  }
  return { mode: "uncertain", confidence: Math.max(0.2, Math.min(0.7, 0.5 + score / 2)), reasons };
}
