import type { Message } from "../../../types";
import type { ChatRuntimeContext } from "../context/chatRuntimeContext";

/**
 * A short-lived image reference is enough to make a follow-up text turn
 * multimodal without attaching an unrelated old photo to every request.
 * The message itself remains the durable source of truth; this helper only
 * selects an image that is already present in the current direct-chat scope.
 */
export const RECENT_USER_IMAGE_MAX_AGE_MS = 30 * 60 * 1000;

const IMAGE_REFERENCE_PATTERN = /(?:图(?:片|像)?|照片|相片|截图|图中|图里|画面|看(?:看|一下)|识别|什么意思|什么(?:东西|内容)|好看吗|头像|情头|指甲|饺子)/iu;

export function isLikelyImageReference(text: string): boolean {
  return IMAGE_REFERENCE_PATTERN.test(text.trim());
}

const readImageDataUrl = (message: Message): string | undefined => {
  const content = message.content.trim();
  return /^data:image\//iu.test(content) ? content : undefined;
};

const isInScope = (message: Message, scope: ChatRuntimeContext): boolean =>
  !scope.isGroup
  && Boolean(scope.characterId && scope.relationId && scope.conversationId)
  && message.characterId === scope.characterId
  && message.relationId === scope.relationId
  && (!message.conversationId || message.conversationId === scope.conversationId);

export interface RecentUserImageCandidate {
  dataUrl: string;
  timestamp: number;
}

export interface RecentUserImageForTurnInput {
  messages: readonly Message[];
  userMessage?: Message | null;
  scope: ChatRuntimeContext;
  /** Covers the render boundary immediately after an image is sent. */
  recentImage?: RecentUserImageCandidate;
  nowMs?: number;
  maxAgeMs?: number;
}

/**
 * Resolve the image that should accompany one direct-chat request.
 *
 * An image message is always eligible for its own request. A text message sent
 * immediately after a same-scope image is also eligible; this supports the
 * common “send photo, then explain/ask about it” UI flow even when the text
 * does not literally say “图片”. Older images require an explicit image
 * reference. Another relation and stale images never acquire binary input.
 */
export function resolveRecentUserImageForTurn(input: RecentUserImageForTurnInput): string | undefined {
  const userMessage = input.userMessage;
  if (!userMessage || userMessage.sender !== "user" || !isInScope(userMessage, input.scope)) return undefined;

  const currentImage = readImageDataUrl(userMessage);
  if (currentImage) return currentImage;

  const nowMs = userMessage.timestamp || input.nowMs || Date.now();
  const maxAgeMs = input.maxAgeMs ?? RECENT_USER_IMAGE_MAX_AGE_MS;
  const scopedUserMessages = input.messages
    .filter((message) => message.sender === "user" && isInScope(message, input.scope) && message.timestamp <= nowMs)
    .sort((left, right) => right.timestamp - left.timestamp);
  const immediatelyPreviousMessage = scopedUserMessages.find((message) => message.id !== userMessage.id);
  const immediatelyPreviousImage = immediatelyPreviousMessage ? readImageDataUrl(immediatelyPreviousMessage) : undefined;
  if (immediatelyPreviousImage
    && nowMs - immediatelyPreviousMessage.timestamp >= 0
    && nowMs - immediatelyPreviousMessage.timestamp <= maxAgeMs) {
    return immediatelyPreviousImage;
  }
  const recentImageIsCurrentFollowUp = input.recentImage
    && input.recentImage.timestamp <= nowMs
    && nowMs - input.recentImage.timestamp <= maxAgeMs
    && !scopedUserMessages.some((message) => message.id !== userMessage.id && message.timestamp > input.recentImage!.timestamp);
  if (recentImageIsCurrentFollowUp) return input.recentImage.dataUrl;
  if (!isLikelyImageReference(userMessage.content)) return undefined;

  const candidates: RecentUserImageCandidate[] = scopedUserMessages.map((message) => {
      const dataUrl = readImageDataUrl(message);
      return dataUrl ? { dataUrl, timestamp: message.timestamp } : undefined;
    })
    .filter((candidate): candidate is RecentUserImageCandidate => Boolean(candidate));
  if (input.recentImage && input.recentImage.timestamp <= nowMs) candidates.push(input.recentImage);

  return candidates
    .sort((left, right) => right.timestamp - left.timestamp)
    .find((candidate) => nowMs - candidate.timestamp >= 0 && nowMs - candidate.timestamp <= maxAgeMs)
    ?.dataUrl;
}
