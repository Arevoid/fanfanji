import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Message } from "../src/types";
import { createCallRecordMarkup, createTextImageMarkup } from "../src/features/chat/services/messageParser";
import {
  serializeMessageContentForPrompt,
  serializeMessagesAsTranscript,
  serializeMessageToPromptTurns,
} from "../src/features/chat/prompts/messagePromptSerializer";

const message = (content: string, extra: Partial<Message> = {}): Message => ({
  id: `m-${Math.random()}`,
  characterId: "character-1",
  relationId: "relation-1",
  conversationId: "conversation-1",
  sender: "user",
  content,
  timestamp: 1_786_400_000_000,
  ...extra,
});

assert.equal(serializeMessageContentForPrompt(message("普通文字")), "普通文字");

const legacyImage = message("data:image/png;base64,VERY_SECRET_BASE64_PAYLOAD");
const imageHistory = serializeMessageContentForPrompt(legacyImage, { mode: "history", userName: "小明" });
assert.match(imageHistory, /小明发送了一张图片/);
assert.doesNotMatch(imageHistory, /VERY_SECRET|data:image|base64/);
const imageCurrent = serializeMessageContentForPrompt(legacyImage, { mode: "current" });
assert.match(imageCurrent, /发送图片\/照片/);
assert.doesNotMatch(imageCurrent, /VERY_SECRET/);
assert.match(serializeMessageContentForPrompt(message("[图片]", { sender: "character", imageAssetId: "asset-1" })), /角色发送了一张图片/);

const textImage = serializeMessageContentForPrompt(message(createTextImageMarkup("海边的晚霞")));
assert.equal(textImage, "[文字图：海边的晚霞]");
assert.match(serializeMessageContentForPrompt(message(createTextImageMarkup("海边的晚霞")), { mode: "current" }), /不要声称看到了真实照片/);

const voice = serializeMessageContentForPrompt(message("[语音]|3|我们接着刚才的话题"));
assert.match(voice, /准确转写/);
assert.match(voice, /我们接着刚才的话题/);
assert.match(serializeMessageContentForPrompt(message("[语音]|3|我们接着刚才的话题"), { mode: "current" }), /SAME CONVERSATION/);
assert.match(serializeMessageContentForPrompt(message("[语音: “旧格式内容” (5秒)]")), /旧格式内容/);

assert.match(serializeMessageContentForPrompt(message("[红包]|6.66|开心")), /6\.66 元红包/);
assert.match(serializeMessageContentForPrompt(message("[转账]|20.00|午饭|true")), /状态：已收款/);
assert.match(serializeMessageContentForPrompt(message("[位置]|北京站")), /不证明发送者本人身处该地点/);
assert.match(serializeMessageContentForPrompt(message("[音乐]|晴天|周杰伦")), /《晴天》— 周杰伦/);
assert.match(serializeMessageContentForPrompt(message(`[文件]|计划|${encodeURIComponent("第一行\n第二行")}`)), /第一行\n第二行/);
assert.match(serializeMessageContentForPrompt(message("[论坛分享] 测试帖子", { forumShareId: "forum-1" })), /帖子快照/);
assert.match(serializeMessageContentForPrompt(message("[日记分享]", { diaryShareId: "diary-1" })), /冻结内容/);
assert.match(serializeMessageContentForPrompt(message("[语音通话]|已结束")), /语音通话记录/);
assert.match(serializeMessageContentForPrompt(message("[视频通话]|已拒绝")), /视频通话记录/);

const sticker = serializeMessageContentForPrompt(message("[表情]|偷笑|blob:https://secret-sticker"));
assert.match(sticker, /偷笑/);
assert.doesNotMatch(sticker, /blob:|secret-sticker/);
const semanticSticker = serializeMessageContentForPrompt(message(`[表情]|震惊小狗|sticker:\/\/dog|${encodeURIComponent("小狗瞪大眼睛，表达震惊和意外")}`));
assert.match(semanticSticker, /小狗瞪大眼睛/);
assert.doesNotMatch(semanticSticker, /sticker:\/\//);

const callRecord = createCallRecordMarkup({
  callType: "语音通话",
  status: "completed",
  direction: "outgoing",
  duration: "02:43",
  transcript: [
    { id: "call-user", sender: "user", content: "喂，你在吗", timestamp: 100 },
    { id: "call-character", sender: "character", content: "我在", timestamp: 200 },
  ],
});
const callTurns = serializeMessageToPromptTurns(message(callRecord));
assert.deepEqual(callTurns.map((turn) => [turn.role, turn.text]), [["user", "喂，你在吗"], ["model", "我在"]]);
assert.match(serializeMessageContentForPrompt(message(callRecord), { includeCallTranscript: false }), /时长 02:43/);

const transcript = serializeMessagesAsTranscript([
  legacyImage,
  message("[表情]|偷笑|data:image/png;base64,STICKER_SECRET"),
  message("[转账]|20|午饭|false"),
], { userName: "用户", characterName: "角色" });
assert.match(transcript, /转账消息/);
assert.doesNotMatch(transcript, /VERY_SECRET|STICKER_SECRET|data:image|blob:/);

const appChat = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.equal((appChat.match(/serializeMessageToPromptTurns\(m,/g) || []).length, 2, "send and regeneration history must use the same serializer");
assert.equal((appChat.match(/mode: "current"/g) || []).length >= 2, true, "send and regeneration current messages must be serialized");
assert.doesNotMatch(appChat, /let promptMessage = userMsg \? userMsg\.content/);

for (const relativePath of [
  "../src/domain/memory/MemoryExtractor.ts",
  "../src/domain/prompt/innerVoicePrompt.ts",
  "../src/domain/prompt/characterImagePrompt.ts",
  "../src/features/diary/services/diaryGenerationService.ts",
  "../src/features/music/services/dualMusicRecommendationService.ts",
  "../src/components/AppOffline.tsx",
]) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  assert.match(source, /serializeMessageContentForPrompt|serializeMessageToPromptTurns/, `${relativePath} must use prompt-safe message serialization`);
}

console.log("Message prompt serializer coverage tests passed");
