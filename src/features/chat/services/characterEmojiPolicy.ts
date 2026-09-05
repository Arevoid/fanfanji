/**
 * Character media is opt-in per reply.  This is intentionally a short-lived
 * output policy: it never changes a user's own messages or any stored persona.
 */
const STICKER_MARKUP = /\[表情\]\|[^\r\n]*/gu;
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|[\u{1F3FB}-\u{1F3FF}]/gu;

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
  const userInvitedEmoji = Boolean(input.latestUserMessage && matchesMedia(input.latestUserMessage));
  const characterRecentlyUsedEmoji = input.recentCharacterMessages.slice(-10).some(matchesMedia);
  return userInvitedEmoji && !characterRecentlyUsedEmoji;
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
