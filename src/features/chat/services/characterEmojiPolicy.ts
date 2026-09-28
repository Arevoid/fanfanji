/**
 * Character media is opt-in per reply.  This is intentionally a short-lived
 * output policy: it never changes a user's own messages or any stored persona.
 */
const STICKER_MARKUP = /\[表情\]\|[^\r\n]*/gu;
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|[\u{1F3FB}-\u{1F3FF}]/gu;

const EXPLICIT_STICKER_REQUEST = /(?:发|发送|给我|来个|来一个|用|把).{0,16}(?:表情包|表情|贴图)|(?:表情包|表情|贴图).{0,16}(?:发|发送|给我|来)/u;
const NEGATED_STICKER_REQUEST = /(?:不要|别|不用|不发|拒绝|禁止).{0,8}(?:表情包|表情|贴图)/u;
const QUOTED_STICKER_MARKUP = /\[表情\]\|[^|\r\n]+\|sticker:\/\/[^|\r\n]+(?:\|[^\r\n」”』]*)?/u;
const STICKER_DELIVERY_ACCEPTANCE = /(?:发过去了|发给你了|已经发(?:给你)?了?|已发送|发好了|发来了|这就发|马上发|我发|给你发|发这个|发一个|(?:好|行|可以|当然|没问题)[，,、。！! ]{0,4}(?:我)?(?:这就|马上)?发)/u;
const STICKER_DELIVERY_REFUSAL = /(?:不发|别想|不会发|不想发|才不发|没发|还没发|拒绝发)/u;

function matchesMedia(value: string): boolean {
  STICKER_MARKUP.lastIndex = 0;
  EMOJI.lastIndex = 0;
  return STICKER_MARKUP.test(value) || EMOJI.test(value);
}

export function mayCharacterUseEmoji(input: {
  latestUserMessage?: string;
  recentCharacterMessages: readonly string[];
}): boolean {
  // A character can mirror an explicitly expressive user only once in its
  // recent cadence. This prevents standalone, out-of-context emoji bubbles.
  const latestUserMessage = input.latestUserMessage?.trim() || "";
  const explicitStickerRequest = EXPLICIT_STICKER_REQUEST.test(latestUserMessage)
    && !NEGATED_STICKER_REQUEST.test(latestUserMessage);
  const userInvitedEmoji = Boolean(latestUserMessage && (matchesMedia(latestUserMessage) || explicitStickerRequest));
  const characterRecentlyUsedEmoji = input.recentCharacterMessages.slice(-10).some(matchesMedia);
  return explicitStickerRequest || (userInvitedEmoji && !characterRecentlyUsedEmoji);
}

/**
 * If the user explicitly asked for a quoted sticker and the character's
 * reply clearly agrees or claims it was sent, make the executable sticker
 * event explicit. This repairs the common model behavior of saying “发过去了”
 * without emitting the client protocol, while leaving refusals and ordinary
 * media conversation untouched.
 */
export function ensureExplicitStickerDelivery(replyText: string, userMessage?: string): string {
  const reply = replyText.trim();
  const user = userMessage?.trim() || "";
  if (!reply || !user || /\[表情\]\|/u.test(reply)) return replyText;
  if (!EXPLICIT_STICKER_REQUEST.test(user) || NEGATED_STICKER_REQUEST.test(user)) return replyText;
  if (STICKER_DELIVERY_REFUSAL.test(reply) || !STICKER_DELIVERY_ACCEPTANCE.test(reply)) return replyText;
  const quotedSticker = user.match(QUOTED_STICKER_MARKUP)?.[0];
  if (!quotedSticker) return replyText;
  // cleanOnlineMessage keeps only Chinese-quoted dialogue when a provider
  // uses dialogue quotes. Wrap the synthetic marker as its own quoted bubble
  // so it survives that normalizer and reaches the sticker renderer.
  const marker = /[“「『]/u.test(replyText) ? `“${quotedSticker}”` : quotedSticker;
  return `${replyText.trimEnd()}\n\n${marker}`;
}

export function suppressCharacterEmoji(value: string, allowEmoji = false): string {
  if (allowEmoji) return value.trim();
  return value
    .replace(STICKER_MARKUP, "")
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
