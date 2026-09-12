import assert from "node:assert/strict";
import {
  RECENT_USER_IMAGE_MAX_AGE_MS,
  isLikelyImageReference,
  resolveRecentUserImageForTurn,
} from "../src/features/chat/services/recentUserImageContext";
import type { ChatRuntimeContext } from "../src/features/chat/context/chatRuntimeContext";

const scope: ChatRuntimeContext = {
  characterId: "character-a",
  relationId: "relation-a",
  conversationId: "conversation-a",
  userIdentityId: "identity-a",
  isGroup: false,
};
const image = "data:image/png;base64,IMAGE_A";
const imageMessage = {
  id: "image-a",
  characterId: scope.characterId!,
  relationId: scope.relationId!,
  conversationId: scope.conversationId!,
  sender: "user",
  content: image,
  timestamp: 1_000,
} as const;

assert.equal(isLikelyImageReference("你看看这张图片里的东西"), true);
assert.equal(isLikelyImageReference("我们明天再聊工作"), false);
assert.equal(resolveRecentUserImageForTurn({
  messages: [imageMessage],
  userMessage: imageMessage,
  scope,
}), image, "the image message itself is sent as visual input");

const followUp = {
  ...imageMessage,
  id: "text-a",
  content: "你看看这张图，里面是什么？",
  timestamp: 2_000,
};
assert.equal(resolveRecentUserImageForTurn({ messages: [imageMessage, followUp], userMessage: followUp, scope }), image);
assert.equal(resolveRecentUserImageForTurn({
  messages: [imageMessage, { ...followUp, content: "朋友说这个很好吃", id: "text-about-image" }],
  userMessage: { ...followUp, content: "朋友说这个很好吃", id: "text-about-image" },
  scope,
}), image, "an immediately following text turn keeps the preceding photo visible to the model");
assert.equal(resolveRecentUserImageForTurn({
  messages: [imageMessage, { ...followUp, id: "text-long-delay", content: "你还没看清楚这张图吗？", timestamp: 1_000 + 2 * 60 * 60 * 1000 }],
  userMessage: { ...followUp, id: "text-long-delay", content: "你还没看清楚这张图吗？", timestamp: 1_000 + 2 * 60 * 60 * 1000 },
  scope,
}), image, "the same unbroken image turn survives a delayed provider reply");
const unrelatedEarlierText = { ...followUp, id: "text-between", content: "先聊点别的", timestamp: 1_500 };
const unrelatedCurrentText = { ...followUp, id: "text-unrelated", content: "今天吃什么？", timestamp: 2_000 };
assert.equal(resolveRecentUserImageForTurn({
  messages: [imageMessage, unrelatedEarlierText, unrelatedCurrentText],
  userMessage: unrelatedCurrentText,
  scope,
}), undefined, "unrelated text must not acquire an old image");
assert.equal(resolveRecentUserImageForTurn({
  messages: [{ ...imageMessage, relationId: "relation-other" }, followUp],
  userMessage: followUp,
  scope,
}), undefined, "an image from another relation must never cross the scope boundary");
assert.equal(resolveRecentUserImageForTurn({
  messages: [
    { ...imageMessage, timestamp: 1_000 },
    { ...followUp, id: "text-between-stale-image", content: "先聊点别的", timestamp: 2_000 },
    { ...followUp, id: "text-stale-reference", timestamp: 1_000 + RECENT_USER_IMAGE_MAX_AGE_MS + 1 },
  ],
  userMessage: { ...followUp, id: "text-stale-reference", timestamp: 1_000 + RECENT_USER_IMAGE_MAX_AGE_MS + 1 },
  scope,
}), undefined, "stale images must not be attached");
assert.equal(resolveRecentUserImageForTurn({
  messages: [],
  userMessage: followUp,
  recentImage: { dataUrl: image, timestamp: 1_500 },
  scope,
}), image, "the render-boundary fallback stays scoped to the same direct turn");
assert.equal(resolveRecentUserImageForTurn({
  messages: [],
  userMessage: { ...followUp, content: "我朋友说这个很好吃", timestamp: 2_000 },
  recentImage: { dataUrl: image, timestamp: 1_500 },
  scope,
}), image, "a just-sent photo remains attached while the message list catches up");
assert.equal(resolveRecentUserImageForTurn({
  messages: [imageMessage],
  userMessage: followUp,
  scope: { ...scope, isGroup: true },
}), undefined, "group callers keep their existing current-message-only image path");

console.log("PASS recent direct-chat image context is explicit, scoped, and bounded");
