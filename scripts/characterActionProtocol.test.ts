import assert from "node:assert/strict";
import {
  CHARACTER_ACTION_END,
  CHARACTER_ACTION_START,
  formatCharacterActionPrompt,
  parseCharacterActionDirective,
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

console.log("PASS character action protocol");
