import { strict as assert } from "node:assert";
import { requestAiReply } from "../src/features/chat/services/aiReplyService";
import { createDirectReplyCandidates } from "../src/features/chat/services/directChatService";
import { createRegeneratedReplyCandidates } from "../src/features/chat/services/regenerateService";
import type { AiChatRequest } from "../src/features/chat/services/chatServiceTypes";

const candidateContext = (rawText: string) => ({
  rawText,
  disableBracketActions: false,
  keepPeriods: false,
  characterId: "char-a",
  characterName: "阿砚",
  userName: "饭饭",
  createId: (index: number) => `id-${index}`,
  currentTime: (index: number) => 100 + index,
});

const quotedStickerRequest = {
  requestedStickerMessage: "「引用 我：[表情]|兔兔|sticker://sticker-local-1|语义」\n等会你发这个表情",
  allowEmoji: true,
};

let requestCount = 0;
const request: AiChatRequest = { message: "hello", history: [], systemInstruction: "worldbook memory time moments boundary", apiKey: "test", model: "test-model" };
const response = await requestAiReply(async (input) => {
  requestCount += 1;
  assert.equal(input, request);
  return { text: "你好。再见！" };
}, request);

// A-I: direct-reply candidates preserve parsing, IDs/timestamps, and prepared context is passed once.
assert.equal(requestCount, 1);
assert.equal(response.text, "你好。再见！");
assert.deepEqual(createDirectReplyCandidates(candidateContext("你好")).messages.map((message) => message.content), ["你好"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("“就这一次”")).messages.map((message) => message.content), ["就这一次"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("“他说‘别急’”")).messages.map((message) => message.content), ["他说‘别急’"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("你好。再见！")).messages.map((message) => message.content), ["你好。再见！"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("第一句。第二句。第三句。第四句。")).messages.map((message) => message.content), ["第一句。第二句。第三句。第四句。"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("第一条。\n\n第二条。\n\n第三条。")).messages.map((message) => message.content), ["第一条", "第二条", "第三条"], "repeated trailing stops are normalized only across multiple short bubbles");
assert.deepEqual(createDirectReplyCandidates({ ...candidateContext("第一条。\n\n第二条。"), keepPeriods: true }).messages.map((message) => message.content), ["第一条。", "第二条。"], "persona punctuation preference is preserved");
assert.deepEqual(createDirectReplyCandidates(candidateContext("第一句\n[15:10]\n第二句\n【15：10】")).messages.map((message) => message.content), ["第一句", "第二句"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("第一句\n[消息发送于 2026-08-02 18:11]\n第二句\n[消息发送于 2026-08-02 18:11]")).messages.map((message) => message.content), ["第一句", "第二句"]);
assert.equal(createDirectReplyCandidates(candidateContext("引用回复")).messages[0].content, "引用回复");
assert.deepEqual(createDirectReplyCandidates(candidateContext("阿砚：我到了\n饭饭：那你进来吧\n阿砚：好")).messages.map((message) => message.content), ["我到了"], "invented user turns and the character's self-answer must be discarded");
const translatedVoice = createDirectReplyCandidates({
  ...candidateContext("Hello"),
  translationText: "[语音]|4|你好",
  transformBubble: (text) => `[语音]|2|${text}`,
});
assert.equal(translatedVoice.messages[0].translation, "你好", "voice translation wrappers are not persisted");
assert.equal(request.systemInstruction.includes("worldbook"), true);
assert.equal(request.systemInstruction.includes("memory"), true);
assert.equal(request.systemInstruction.includes("time"), true);
assert.equal(request.systemInstruction.includes("moments"), true);
assert.equal(request.systemInstruction.includes("boundary"), true);

// J-L: empty, rejected, and special-message paths do not manufacture extra requests/messages.
assert.deepEqual(createDirectReplyCandidates(candidateContext("")).messages, []);
await assert.rejects(() => requestAiReply(async () => { throw new Error("network"); }, request), /network/);
assert.deepEqual(createDirectReplyCandidates(candidateContext("[红包]|8.88|恭喜发财")).messages.map((message) => message.content), ["[红包]|8.88|恭喜发财"]);
assert.deepEqual(
  createDirectReplyCandidates({ ...candidateContext("好，我发过去了"), ...quotedStickerRequest }).messages.map((message) => message.content),
  ["好，我发过去了", "[表情]|兔兔|sticker://sticker-local-1|语义"],
  "an agreed quoted-sticker request becomes a real sticker message",
);
assert.deepEqual(
  createDirectReplyCandidates({ ...candidateContext("“好，我发过去了”"), ...quotedStickerRequest }).messages.map((message) => message.content),
  ["好，我发过去了", "[表情]|兔兔|sticker://sticker-local-1|语义"],
  "the sticker event survives quoted-dialogue normalization",
);

// M-R: regeneration retains its legacy parse path and only returns candidates for AppChat to send/save.
const regenerated = createRegeneratedReplyCandidates(candidateContext("第一句。第二句。"));
assert.deepEqual(regenerated.messages.map((message) => message.content), ["第一句。第二句。"]);
assert.deepEqual(regenerated.messages.map((message) => message.id), ["id-0"]);
assert.deepEqual(regenerated.messages.map((message) => message.timestamp), [100]);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("[微信红包]|1|x")).messages.map((message) => message.content), ["[红包]|1.00|x"]);
assert.equal(createRegeneratedReplyCandidates(candidateContext("旧消息")).messages.length, 1);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("第一句\n用户：我替你回答\n第二句")).messages.map((message) => message.content), ["第一句"]);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("新的回复\n[15:10]")).messages.map((message) => message.content), ["新的回复"]);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("[消息发送于 2026-08-02 18:11]")).messages, []);
assert.deepEqual(createDirectReplyCandidates(candidateContext("[第2秒]")).messages, []);
assert.equal(requestCount, 1);

console.log("Direct chat reply services: 22 fixed acceptance checks passed");
