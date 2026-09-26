import type { Message } from "../../../types";

export type CharacterCallIntent = "voice" | "video";

// This is deliberately narrower than the user's call-request matcher. It
// looks for a character claiming that the call is being placed or has already
// arrived, rather than every mention of a phone or a future possibility.
const CHARACTER_CALL_COMPLETION_PATTERN = /(?:拨过去了|打过去了|拨过来了|打过来了|给你(?:打|拨)(?:电话)?(?:过去|过来|回来)了|(?:已经|马上|现在就|这就|正在).{0,8}(?:给你)?(?:打|拨)(?:个|一下)?(?:电话)?(?:过去|过来|回来|了))/u;
const CHARACTER_VIDEO_CALL_COMPLETION_PATTERN = /(?:视频|视频通话|视频电话).{0,8}(?:打过来|拨过来|接一下|接吧|来了|了)/u;

export function resolveCharacterCallIntent(messages: readonly Message[]): CharacterCallIntent | undefined {
  const text = messages
    .filter((message) => message.sender === "character")
    .map((message) => message.content || "")
    .join("\n");
  if (!text || !CHARACTER_CALL_COMPLETION_PATTERN.test(text)) return undefined;
  return CHARACTER_VIDEO_CALL_COMPLETION_PATTERN.test(text) ? "video" : "voice";
}
