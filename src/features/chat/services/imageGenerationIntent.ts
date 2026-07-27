import type { Message } from "../../../types";

const IMAGE_NOUN = "(?:照片|图片|图像|相片|自拍|图)";

const NEGATED_OR_QUOTED = new RegExp(
  `(?:不要|别|无需|不用|禁止|不想|别再|没让你|我没让你|并非|不是).{0,24}(?:发|发送|生成|拍|传)?.{0,12}${IMAGE_NOUN}|(?:你说|他说|她说|别人说|引用|提到).{0,28}(?:发|发送|生成|拍|传).{0,12}${IMAGE_NOUN}|[“”「」『』].{0,50}(?:发|发送|生成|拍|传).{0,12}${IMAGE_NOUN}`,
  "i",
);

const EXPLICIT_IMAGE_REQUEST = new RegExp(
  `(?:给我|给咱|发我|发给我|把).{0,12}(?:发|发送|来|拍|生成|传).{0,12}${IMAGE_NOUN}|(?:给我|给咱|让我).{0,12}(?:看看|看下|看一眼).{0,8}${IMAGE_NOUN}|${IMAGE_NOUN}.{0,12}(?:发|发送|传).{0,12}(?:给我|给咱|发我)|(?:发|发送|来|拍|生成|传)(?:一?张|个).{0,28}${IMAGE_NOUN}|(?:发|发送|来|拍|生成|传)(?:你的|你现在的)?${IMAGE_NOUN}(?:给我|给咱|发我)?|^(?:图|照片|图片|自拍)(?:呢|呢[？?]|在哪|在哪里|给我)$|^(?:发图|来图|来张自拍|照片呢|图呢)[！!？?。.]?$`,
  "i",
);

/** Conservative by design: uncertainty, negation, and quoted text never spend image quota. */
export function isExplicitImageRequest(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && !NEGATED_OR_QUOTED.test(normalized) && EXPLICIT_IMAGE_REQUEST.test(normalized);
}

const IMAGE_RETRY_FOLLOW_UP = /^(?:现在|现在可以了吗|再试一次|重试|重新(?:发|生成)|再发(?:一张)?|再来(?:一张)?)[？?！!。…]*$/;

/**
 * A terse follow-up only becomes an image request when it belongs to the same
 * scoped thread as an earlier explicit request that still has no real image.
 * This makes changing a model after a reference-image error retryable without
 * allowing ordinary chat to spend image quota.
 */
export function getPendingExplicitImageRequest(text: string, messages: readonly Message[]): string | null {
  if (isExplicitImageRequest(text)) return text.trim();
  if (!IMAGE_RETRY_FOLLOW_UP.test(text.trim())) return null;
  const lastUserIndex = [...messages].map((message, index) => ({ message, index })).reverse().find(({ message }) => message.sender === "user")?.index;
  if (lastUserIndex === undefined) return null;
  const lastUser = messages[lastUserIndex];
  if (!isExplicitImageRequest(lastUser.content)) return null;
  const hasRealImageAfterRequest = messages.slice(lastUserIndex + 1).some((message) =>
    message.sender === "character" && message.imageSource === "generated" && Boolean(message.imageAssetId),
  );
  return hasRealImageAfterRequest ? null : lastUser.content.trim();
}

export function assertImageGenerationTrigger(trigger: "manual" | "explicit-user-text", userText?: string): void {
  if (trigger === "manual") return;
  if (trigger === "explicit-user-text" && isExplicitImageRequest(userText || "")) return;
  throw new Error("图片生成已拦截：只有明确的用户图片请求或手动确认可以调用图片 API。");
}
