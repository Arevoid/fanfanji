import assert from "node:assert/strict";
import { parseProactiveActionDirective } from "../src/features/chat/services/proactiveActionProtocol";

const parsed = parseProactiveActionDirective({
  text: "我刚好也想听听你的声音。\n[[PROACTIVE_ACTION]]{\"type\":\"call\",\"reason\":\"刚才的对话明确提到想听声音\"}[[/PROACTIVE_ACTION]]",
});
assert.equal(parsed.visibleText, "我刚好也想听听你的声音。", "internal action metadata must stay invisible");
assert.deepEqual(parsed.directive, { type: "call", reason: "刚才的对话明确提到想听声音" });

const video = parseProactiveActionDirective({
  text: "那我们视频见。[[PROACTIVE_ACTION]]{\"type\":\"video_call\",\"reason\":\"双方刚约好视频\"}[[/PROACTIVE_ACTION]]",
});
assert.equal(video.directive?.type, "video_call");

const malformed = parseProactiveActionDirective({ text: "正常文字\n[[PROACTIVE_ACTION]]{bad}[[/PROACTIVE_ACTION]]" });
assert.deepEqual(malformed, { visibleText: "正常文字", error: "malformed_json" });

const invalid = parseProactiveActionDirective({ text: "正常文字[[PROACTIVE_ACTION]]{\"type\":\"message\",\"reason\":\"x\"}[[/PROACTIVE_ACTION]]" });
assert.equal(invalid.directive, undefined);
assert.equal(invalid.error, "invalid_directive");

const incomplete = parseProactiveActionDirective({ text: "正常文字\n[[PROACTIVE_ACTION]]{\"type\":\"call\"" });
assert.equal(incomplete.visibleText, "正常文字");
assert.equal(incomplete.directive, undefined);

const duplicate = parseProactiveActionDirective({
  text: "a [[PROACTIVE_ACTION]]{\"type\":\"call\",\"reason\":\"a\"}[[/PROACTIVE_ACTION]] b [[PROACTIVE_ACTION]]{\"type\":\"call\",\"reason\":\"b\"}[[/PROACTIVE_ACTION]]",
});
assert.equal(duplicate.error, "multiple_directives");
assert.doesNotMatch(duplicate.visibleText, /PROACTIVE_ACTION/);

console.log("PASS proactive action protocol validation and visibility checks");
