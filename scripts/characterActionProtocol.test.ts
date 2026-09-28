import assert from "node:assert/strict";
import {
  CHARACTER_ACTION_END,
  CHARACTER_ACTION_START,
  formatCharacterActionPrompt,
  parseCharacterActionDirective,
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

console.log("PASS character action protocol");
