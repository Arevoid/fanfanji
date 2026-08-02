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
  createId: (index: number) => `id-${index}`,
  currentTime: (index: number) => 100 + index,
});

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
assert.deepEqual(createDirectReplyCandidates(candidateContext("你好。再见！")).messages.map((message) => message.content), ["你好", "再见！"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("第一句\n[15:10]\n第二句\n【15：10】")).messages.map((message) => message.content), ["第一句", "第二句"]);
assert.deepEqual(createDirectReplyCandidates(candidateContext("第一句\n[消息发送于 2026-08-02 18:11]\n第二句\n[消息发送于 2026-08-02 18:11]")).messages.map((message) => message.content), ["第一句", "第二句"]);
assert.equal(createDirectReplyCandidates(candidateContext("引用回复")).messages[0].content, "引用回复");
assert.equal(request.systemInstruction.includes("worldbook"), true);
assert.equal(request.systemInstruction.includes("memory"), true);
assert.equal(request.systemInstruction.includes("time"), true);
assert.equal(request.systemInstruction.includes("moments"), true);
assert.equal(request.systemInstruction.includes("boundary"), true);

// J-L: empty, rejected, and special-message paths do not manufacture extra requests/messages.
assert.deepEqual(createDirectReplyCandidates(candidateContext("")).messages, []);
await assert.rejects(() => requestAiReply(async () => { throw new Error("network"); }, request), /network/);
assert.deepEqual(createDirectReplyCandidates(candidateContext("[红包]|8.88|恭喜发财")).messages.map((message) => message.content), ["[红包]|8.88|恭喜发财"]);

// M-R: regeneration retains its legacy parse path and only returns candidates for AppChat to send/save.
const regenerated = createRegeneratedReplyCandidates(candidateContext("第一句。第二句。"));
assert.deepEqual(regenerated.messages.map((message) => message.content), ["第一句", "第二句"]);
assert.deepEqual(regenerated.messages.map((message) => message.id), ["id-0", "id-1"]);
assert.deepEqual(regenerated.messages.map((message) => message.timestamp), [100, 101]);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("[微信红包]|1|x")).messages.map((message) => message.content), ["[微信红包]|1|x"]);
assert.equal(createRegeneratedReplyCandidates(candidateContext("旧消息")).messages.length, 1);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("新的回复\n[15:10]")).messages.map((message) => message.content), ["新的回复"]);
assert.deepEqual(createRegeneratedReplyCandidates(candidateContext("[消息发送于 2026-08-02 18:11]")).messages, []);
assert.deepEqual(createDirectReplyCandidates(candidateContext("[第2秒]")).messages, []);
assert.equal(requestCount, 1);

console.log("Direct chat reply services: 20 fixed acceptance checks passed");
