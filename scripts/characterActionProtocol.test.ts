import assert from "node:assert/strict";
import {
  CHARACTER_ACTION_END,
  CHARACTER_ACTION_START,
  formatCharacterActionPrompt,
  parseCharacterActionEnvelope,
  parseCharacterActionDirective,
  serializeCharacterActionDirective,
  sanitizeCharacterActionText,
} from "../src/features/chat/services/characterActionProtocol";

const valid = parseCharacterActionDirective({
  text: `好，我去发。\n\n${CHARACTER_ACTION_START}{"type":"publish_moment","actor":"character","contentHint":"根据刚才的话发一条","visibility":"friends"}${CHARACTER_ACTION_END}`,
});
assert.equal(valid.visibleText, "好，我去发。");
assert.equal(valid.directive?.type, "publish_moment");
assert.equal(valid.directive?.actor, "character");
assert.equal(valid.directive?.visibility, "friends");

const malformed = parseCharacterActionDirective({
  text: `我先问清楚${CHARACTER_ACTION_START}{"type":"publish_moment"${CHARACTER_ACTION_END}`,
});
assert.equal(malformed.directive, undefined);
assert.equal(malformed.error, "malformed_json");
assert.equal(malformed.visibleText, "我先问清楚");

const truncatedMarker = parseCharacterActionDirective({
  text: `好啦，已经发出去了。\n[[CHAR_ACTION]{"type":"publish_moment","actor":"character","contentHint":"根据刚才的话发一条"}`,
});
assert.equal(truncatedMarker.visibleText, "好啦，已经发出去了。");
assert.equal(truncatedMarker.directive?.type, "publish_moment");
assert.equal(truncatedMarker.error, undefined);

const malformedClosingMarker = parseCharacterActionDirective({
  text: `已经发出语音。${CHARACTER_ACTION_START}{"type":"send_voice","actor":"character"}[/CHAR_ACTION]`,
});
assert.equal(malformedClosingMarker.visibleText, "已经发出语音。");
assert.equal(malformedClosingMarker.directive?.type, "send_voice");
assert.equal(sanitizeCharacterActionText(`只保留这句话${CHARACTER_ACTION_START}{"type":"send_voice","actor":"character"}[/CHAR_ACTION]`), "只保留这句话");
assert.equal(
  sanitizeCharacterActionText('好的，没问题。[[CHAR_ACTION]]{"type":"send_voice","actor":"character","contentHint":"辛苦了，饭饭。'),
  "好的，没问题。",
);

const quoted = parseCharacterActionDirective({
  text: `你是在引用那句话，不是现在要做。${CHARACTER_ACTION_START}{"type":"not_supported","actor":"character"}${CHARACTER_ACTION_END}`,
});
assert.equal(quoted.directive, undefined);
assert.equal(quoted.error, "invalid_directive");

const duplicate = parseCharacterActionDirective({
  text: `${CHARACTER_ACTION_START}{"type":"call","actor":"character"}${CHARACTER_ACTION_END}\n${CHARACTER_ACTION_START}{"type":"video_call","actor":"character"}${CHARACTER_ACTION_END}`,
});
assert.equal(duplicate.directive, undefined);
assert.equal(duplicate.error, "multiple_directives");

const prompt = formatCharacterActionPrompt(["publish_moment", "send_sticker"]);
assert.match(prompt, /publish_moment/u);
assert.match(prompt, /send_sticker/u);
assert.match(prompt, /引用/u);

const extendedPrompt = formatCharacterActionPrompt([
  "change_avatar",
  "send_image",
  "send_voice",
  "friend_request",
  "call",
  "video_call",
]);
for (const action of ["change_avatar", "send_image", "send_voice", "friend_request", "call", "video_call"]) {
  assert.match(extendedPrompt, new RegExp(action, "u"));
}
assert.match(extendedPrompt, /同一轮|本轮回复送达后/u);

const redPacket = parseCharacterActionDirective({
  text: `Take this. ${CHARACTER_ACTION_START}{"type":"send_red_packet","actor":"character","amount":"8.88","greeting":"for you"}${CHARACTER_ACTION_END}`,
});
assert.equal(redPacket.visibleText, "Take this.");
assert.equal(redPacket.directive?.type, "send_red_packet");
assert.equal(redPacket.directive?.amount, 8.88);
assert.equal(redPacket.directive?.greeting, "for you");

const missingRedPacketAmount = parseCharacterActionDirective({
  text: `${CHARACTER_ACTION_START}{"type":"send_red_packet","actor":"character","greeting":"for you"}${CHARACTER_ACTION_END}`,
});
assert.equal(missingRedPacketAmount.directive, undefined);
assert.equal(missingRedPacketAmount.error, "invalid_directive");

const redPacketPrompt = formatCharacterActionPrompt(["send_red_packet"]);
assert.match(redPacketPrompt, /send_red_packet/u);
assert.match(redPacketPrompt, /amount/u);
assert.match(redPacketPrompt, /greeting/u);

const attachmentActions = [
  { type: "send_location", location: "Home" },
  { type: "send_file", fileName: "notes.txt", fileContent: "hello" },
  { type: "send_music", musicTitle: "Song", musicArtist: "Artist" },
  { type: "send_transfer", amount: 12.34, memo: "Dinner", confirmed: true },
] as const;
for (const action of attachmentActions) {
  const parsed = parseCharacterActionDirective({
    text: `${CHARACTER_ACTION_START}${JSON.stringify({ ...action, actor: "character" })}${CHARACTER_ACTION_END}`,
  });
  assert.equal(parsed.directive?.type, action.type);
}
const attachmentPrompt = formatCharacterActionPrompt([
  "send_location",
  "send_file",
  "send_music",
  "send_transfer",
]);
for (const action of ["send_location", "send_file", "send_music", "send_transfer"]) {
  assert.match(attachmentPrompt, new RegExp(action, "u"));
}

const everySupportedAction = [
  { type: "publish_moment", actor: "character", contentHint: "分享今天的动态" },
  { type: "send_sticker", actor: "character", stickerId: "sticker-1", stickerName: "开心" },
  { type: "change_avatar", actor: "character" },
  { type: "send_image", actor: "character", contentHint: "一张窗边的照片" },
  { type: "send_voice", actor: "character", contentHint: "我想和你说句话" },
  { type: "send_red_packet", actor: "character", amount: 8.88, greeting: "收下" },
  { type: "send_location", actor: "character", location: "公司" },
  { type: "send_file", actor: "character", fileName: "notes.txt" },
  { type: "send_music", actor: "character", musicTitle: "Song" },
  { type: "send_transfer", actor: "character", amount: 5.21 },
  { type: "call", actor: "character", reason: "想听听你的声音" },
  { type: "video_call", actor: "character", reason: "想见你" },
  { type: "friend_request", actor: "character", reason: "重新联系" },
] as const;
for (const action of everySupportedAction) {
  const parsed = parseCharacterActionDirective({
    text: `${CHARACTER_ACTION_START}${JSON.stringify(action)}${CHARACTER_ACTION_END}`,
  });
  assert.equal(parsed.directive?.type, action.type);
  assert.equal(parsed.directive?.actor, "character");
}

const structuredEnvelope = parseCharacterActionEnvelope([{
  type: "send_transfer",
  actor: "character",
  amount: 5.21,
  memo: "今天的",
}]);
assert.equal(structuredEnvelope.length, 1);
assert.equal(structuredEnvelope[0]?.amount, 5.21);
assert.match(serializeCharacterActionDirective(structuredEnvelope[0]!), /\[\[CHAR_ACTION\]\]/u);
assert.deepEqual(parseCharacterActionEnvelope([
  { type: "send_transfer", actor: "character", amount: 5.21 },
  { type: "send_red_packet", actor: "character", amount: 8.88 },
]), []);
assert.deepEqual(parseCharacterActionEnvelope([{
  type: "send_transfer",
  actor: "character",
}]), []);

console.log("PASS character action protocol");
