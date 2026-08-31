import assert from "node:assert/strict";
import { parseChatTurnResponse } from "../src/features/chat/services/chatTurnResponseProtocol";

const parsedArrayReply = parseChatTurnResponse([
  "```json",
  "{",
  "  \"reply\": [\"好\", \"想吃什么口味的，姐姐？\"],",
  "  \"translation\": null,",
  "  \"innerVoice\": {\"content\": \"刚坐进车里\", \"emotionalState\": \"自然\"}",
  "}",
  "```",
].join("\n"));
assert.equal(parsedArrayReply.reply, "好\n想吃什么口味的，姐姐？");
assert.deepEqual(parsedArrayReply.innerVoice, { content: "刚坐进车里", emotionalState: "自然" });
assert.equal(parsedArrayReply.translation, undefined);

const parsedStringReply = parseChatTurnResponse('{"reply":"正常回复","translation":"translation"}');
assert.equal(parsedStringReply.reply, "正常回复");
assert.equal(parsedStringReply.translation, "translation");

assert.throws(
  () => parseChatTurnResponse('{"reply": {"unexpected": true}, "innerVoice": {"content": "不可泄露", "emotionalState": "测试"}}'),
  /无法识别的结构化回复格式/,
);

assert.equal(parseChatTurnResponse("普通文本 {不是结构化回复}").reply, "普通文本 {不是结构化回复}");
console.log("PASS chat turn response protocol normalizes reply arrays and blocks leaked structured JSON");
