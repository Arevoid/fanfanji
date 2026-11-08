import assert from "node:assert/strict";
import { CHARACTER_ACTION_END, CHARACTER_ACTION_START, parseCharacterActionDirective } from "../src/features/chat/services/characterActionProtocol";
import { parseChatTurnResponse, parseInnerVoiceResponse } from "../src/features/chat/services/chatTurnResponseProtocol";

assert.deepEqual(
  parseInnerVoiceResponse('```json\n{"content":"我其实有点开心","emotionalState":"嘴上不说，心里已经悄悄软下来了"}\n```'),
  { content: "我其实有点开心", emotionalState: "嘴上不说，心里已经悄悄软下来了" },
);
assert.deepEqual(
  parseInnerVoiceResponse('{"data":"{\\"content\\":\\"被你说中了\\",\\"emotionalState\\":\\"有点慌，但还在装镇定\\"}"}'),
  { content: "被你说中了", emotionalState: "有点慌，但还在装镇定" },
);
assert.deepEqual(
  parseInnerVoiceResponse('{"result":{"innerVoice":{"content":"不想承认自己在期待","emotionalState":"明明期待，却还想故意嘴硬"}}}'),
  { content: "不想承认自己在期待", emotionalState: "明明期待，却还想故意嘴硬" },
);
assert.equal(parseInnerVoiceResponse('{"content":"只有正文"}'), undefined);

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

const parsedNestedReply = parseChatTurnResponse('{"reply":{"content":"嵌套回复"},"innerVoice":{"content":"没有说出口","emotionalState":"平静"}}');
assert.equal(parsedNestedReply.reply, "嵌套回复");
assert.deepEqual(parsedNestedReply.innerVoice, { content: "没有说出口", emotionalState: "平静" });

const invalidStructuredReply = parseChatTurnResponse('{"reply": {"unexpected": true}, "innerVoice": {"content": "不可泄露", "emotionalState": "测试"}}');
assert.equal(invalidStructuredReply.reply, "");
assert.equal(invalidStructuredReply.formatIssue, "invalid-structured-response");

const emptyStructuredReply = parseChatTurnResponse('{"reply":"", "innerVoice":{"content":"没有说出口","emotionalState":"平静"}}');
assert.equal(emptyStructuredReply.reply, "");
assert.equal(emptyStructuredReply.formatIssue, "invalid-structured-response");

const innerVoiceOnly = parseChatTurnResponse('{"innerVoice":{"content":"没有说出口","emotionalState":"平静"}}');
assert.equal(innerVoiceOnly.reply, "");
assert.equal(innerVoiceOnly.formatIssue, "invalid-structured-response");

const translationOnly = parseChatTurnResponse('{"translation":"只是一段翻译"}');
assert.equal(translationOnly.reply, "");
assert.equal(translationOnly.formatIssue, "invalid-structured-response");

const parsedProviderEnvelope = parseChatTurnResponse('{"data":{"message":{"content":"中转接口回复"}}}');
assert.equal(parsedProviderEnvelope.reply, "中转接口回复");

assert.equal(
  parseChatTurnResponse("普通文本 {不是结构化回复}").reply,
  "普通文本 {不是结构化回复}",
);

const transfer = parseChatTurnResponse(JSON.stringify({
  reply: "我给你转今天的。",
  translation: "I transferred today's amount.",
  actions: [{
    type: "send_transfer",
    actor: "character",
    amount: 5.21,
    memo: "今天的",
    confirmed: true,
  }],
}));
assert.equal(transfer.actions?.[0]?.type, "send_transfer");
assert.equal(transfer.actions?.[0]?.amount, 5.21);
assert.ok(transfer.reply.includes(CHARACTER_ACTION_START));
assert.ok(transfer.reply.includes("send_transfer"));
assert.ok(transfer.reply.includes(CHARACTER_ACTION_END));
assert.equal(transfer.translation, "I transferred today's amount.");
assert.equal(parseCharacterActionDirective({ text: transfer.reply }).directive?.type, "send_transfer");
assert.equal(parseCharacterActionDirective({ text: transfer.reply }).directive?.amount, 5.21);

const nested = parseChatTurnResponse(JSON.stringify({
  data: {
    reply: "给你发个红包。",
    actions: [{ type: "send_red_packet", actor: "character", amount: 8.88, greeting: "收下" }],
  },
}));
assert.equal(nested.actions?.[0]?.type, "send_red_packet");
assert.match(nested.reply, /send_red_packet/u);

const wrappedAction = parseChatTurnResponse(JSON.stringify({
  actions: [{ type: "send_location", actor: "character", location: "公司" }],
  data: { reply: "我把位置发给你。" },
}));
assert.equal(wrappedAction.actions?.[0]?.type, "send_location");
assert.match(wrappedAction.reply, /send_location/u);

const invalid = parseChatTurnResponse(JSON.stringify({
  reply: "我已经转账了。",
  actions: [{ type: "send_transfer", actor: "character" }],
}));
assert.equal(invalid.actions, undefined);
assert.doesNotMatch(invalid.reply, /CHAR_ACTION/u);

const multiple = parseChatTurnResponse(JSON.stringify({
  reply: "我处理好了。",
  actions: [
    { type: "send_transfer", actor: "character", amount: 1 },
    { type: "send_red_packet", actor: "character", amount: 2 },
  ],
}));
assert.equal(multiple.actions, undefined);
assert.doesNotMatch(multiple.reply, /CHAR_ACTION/u);

console.log("PASS chat turn response protocol normalizes structured actions and preserves legacy parsing");
