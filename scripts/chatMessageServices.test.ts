import { strict as assert } from "node:assert";
import { createCharacterTextMessage, createGroupCharacterMessage, createUserTextMessage } from "../src/features/chat/services/messageFactory";
import { cleanAiReplyText, getChatMessageVisualType, isCallRecordMarkup, isInternalDeliveryMarkerOnly, isRedPacketMarkup, isTransferMarkup, normalizePaymentMarkup, parseCallRecord, splitAiReplyBubbles, stripInternalDeliveryMarkers } from "../src/features/chat/services/messageParser";

const clean = (text: string) => cleanAiReplyText(text, false);

// A-C: ordinary, multi-bubble, and whitespace behavior.
assert.equal(clean("你好"), "你好");
assert.deepEqual(splitAiReplyBubbles("你好。再见！", false), ["你好", "再见！"]);
assert.deepEqual(splitAiReplyBubbles("\n  第一段。\n\n 第二段  ", false), ["第一段", "第二段"]);

// D-I: all existing special markup stays a single bubble and retains its visual classification.
assert.deepEqual(splitAiReplyBubbles("[红包]|8.88|恭喜发财", false), ["[红包]|8.88|恭喜发财"]);
assert.deepEqual(splitAiReplyBubbles("[转账]|8.88|转账", false), ["[转账]|8.88|转账"]);
assert.equal(getChatMessageVisualType("[文件]|note|body"), "file");
assert.equal(getChatMessageVisualType("[位置]|上海"), "location");
assert.equal(getChatMessageVisualType("[语音]|3|你好"), "voice");
assert.equal(isCallRecordMarkup("[通话记录]|语音通话|00:02|%5B%5D"), true);

// J-L: group content, empty input, and mixed markup keep legacy ordering/fallbacks.
assert.deepEqual(splitAiReplyBubbles("成员A：你好。\n成员B：收到！", false), ["成员A：你好", "成员B：收到！"]);
assert.deepEqual(splitAiReplyBubbles("", false), []);
assert.deepEqual(splitAiReplyBubbles("普通文本。\n[红包]|1|hi\n结束！", false), ["普通文本", "[红包]|1|hi", "结束！"]);
assert.equal(stripInternalDeliveryMarkers("第一句\n[15:10]\n第二句\n【下午 3：10】"), "第一句\n\n第二句");
assert.equal(stripInternalDeliveryMarkers("催什么催\n[消息发送时间：2026年8月2日星期日\n17:52]"), "催什么催");
assert.equal(stripInternalDeliveryMarkers("第一句\n[消息发送于 2026-08-02 18:11]\n第二句"), "第一句\n\n第二句");
assert.equal(stripInternalDeliveryMarkers("第一句\n[第2秒]\n第二句"), "第一句\n\n第二句");
assert.equal(stripInternalDeliveryMarkers("剧情发生在第2秒"), "剧情发生在第2秒");
assert.equal(stripInternalDeliveryMarkers("那就15:10见\n今天[15:10]到"), "那就15:10见\n今天[15:10]到");
assert.deepEqual(splitAiReplyBubbles(clean("第一句\n[15:10]\n第二句\n[15:10]"), false), ["第一句", "第二句"]);
assert.equal(isInternalDeliveryMarkerOnly("[15:10]"), true);
assert.equal(isInternalDeliveryMarkerOnly("15:10见"), false);

// M-P: factories preserve exact caller-provided IDs, timestamps, ownership, and optional fields.
assert.deepEqual(createUserTextMessage({ id: "u1", characterId: "c1", content: "hi", timestamp: 1 }), { id: "u1", characterId: "c1", sender: "user", content: "hi", timestamp: 1 });
assert.deepEqual(createCharacterTextMessage({ id: "c1", characterId: "c1", content: "hello", timestamp: 2 }), { id: "c1", characterId: "c1", sender: "character", content: "hello", timestamp: 2 });
assert.deepEqual(createGroupCharacterMessage({ id: "g1", characterId: "group", senderId: "member", content: "group hello", timestamp: 3 }), { id: "g1", characterId: "group", sender: "character", senderId: "member", content: "group hello", timestamp: 3 });
assert.deepEqual(createUserTextMessage({ id: "q1", characterId: "c1", content: "引用内容", timestamp: 4, isOffline: true, isNarration: false }), { id: "q1", characterId: "c1", sender: "user", content: "引用内容", timestamp: 4, isOffline: true, isNarration: false });

assert.equal(normalizePaymentMarkup("[微信红包]|1|x"), "[红包]|1|x");
assert.equal(isRedPacketMarkup("[微信红包]|1|x"), true);
assert.equal(isTransferMarkup("[微信转账]|1|x"), true);
assert.deepEqual(parseCallRecord("[通话记录]|语音通话|00:02|%5B%5D"), { callType: "语音通话", duration: "00:02", transcript: [] });

console.log("Chat message services: 21 fixed acceptance checks passed");
