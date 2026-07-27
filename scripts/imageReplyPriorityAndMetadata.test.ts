import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isExplicitImageRequest } from "../src/features/chat/services/imageGenerationIntent";
import { createDirectReplyCandidates } from "../src/features/chat/services/directChatService";
import { isInternalDeliveryMarkerOnly, stripInternalDeliveryMarkers } from "../src/features/chat/services/messageParser";
import { createGeneratedImageMessages } from "../src/features/chat/services/characterImageService";

for (const request of ["给我发张照片", "发图", "图呢", "照片呢", "来张自拍", "把照片发给我"]) {
  assert.equal(isExplicitImageRequest(request), true, `${request} must use the real image path`);
}
for (const ordinaryText of ["不要发照片", "他说过给我发张照片", "我觉得这张照片很好看"]) {
  assert.equal(isExplicitImageRequest(ordinaryText), false, `${ordinaryText} must not use the image path`);
}

assert.equal(stripInternalDeliveryMarkers("[发送于: 2026-07-27 22:14]"), "");
assert.equal(isInternalDeliveryMarkerOnly("[发送于: 2026-07-27 22:14]"), true);
assert.equal(stripInternalDeliveryMarkers("[发送时间：2026-07-27 22:14]\n你好"), "你好");
assert.equal(isInternalDeliveryMarkerOnly("你好 [发送于: 2026-07-27 22:14]"), false);

const fakeReply = createDirectReplyCandidates({
  rawText: "等会\n我在翻相册\n就这张\n（发送了一张自拍）",
  disableBracketActions: false,
  keepPeriods: false,
  characterId: "char",
  createId: () => "fake",
  currentTime: () => 1,
});
assert.equal(fakeReply.messages.length, 0, "failed image generation must not persist fake sending narration");
const ordinaryPhotoTalk = createDirectReplyCandidates({
  rawText: "我在翻相册，看到以前的照片了",
  disableBracketActions: false,
  keepPeriods: false,
  characterId: "char",
  createId: () => "ordinary",
  currentTime: () => 1,
});
assert.equal(ordinaryPhotoTalk.messages[0]?.content, "我在翻相册，看到以前的照片了", "ordinary photo discussion must remain visible");

const actual = createGeneratedImageMessages({
  messageId: "image-1",
  characterId: "char",
  imageAssetId: "asset-1",
  imageMimeType: "image/png",
  trigger: "explicit-user-text",
  scope: { kind: "direct", relationId: "rel-a", conversationId: "direct:rel-a" },
  timestamp: 1,
});
assert.equal(actual.message.imageAssetId, "asset-1");
assert.equal(actual.message.relationId, "rel-a");
assert.equal(actual.message.conversationId, "direct:rel-a");

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const priorityStart = appChat.indexOf("if (shouldGenerateExplicitImage)");
const priorityEnd = appChat.indexOf("let currentMessagesWithNewUser", priorityStart);
assert.ok(priorityStart >= 0 && priorityEnd > priorityStart, "explicit image branch must precede normal reply");
const priorityBranch = appChat.slice(priorityStart, priorityEnd);
assert.match(priorityBranch, /await generateAndSendCharacterImage\("explicit-user-text", rawUserRequest\)/);
assert.match(priorityBranch, /return;/);
assert.doesNotMatch(priorityBranch, /generateResponseForUserMessage/);
assert.match(appChat, /messages=\{visibleChatMessages\}/);

console.log("imageReplyPriorityAndMetadata.test passed");
