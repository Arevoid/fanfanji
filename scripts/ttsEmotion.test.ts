import assert from "node:assert/strict";
import {
  buildTtsSynthesisText,
  cleanTtsText,
  emotionTagForTts,
  inferTtsEmotion,
  supportsTtsEmotion,
} from "../src/utils/ttsEmotion";
import { getTtsCacheKey, splitTextIntoChunks } from "../src/utils/minimaxTts";

assert.equal(supportsTtsEmotion("elevenlabs", "eleven_v3"), true);
assert.equal(supportsTtsEmotion("elevenlabs", "eleven_v4_turbo"), true);
assert.equal(supportsTtsEmotion("elevenlabs", "eleven_multilingual_v2"), false);
assert.equal(supportsTtsEmotion("minimax", "speech-2.8-hd"), true);
assert.equal(supportsTtsEmotion("minimax", "speech-2"), false);
assert.equal(supportsTtsEmotion("mossland", "moss-tts-1.5-flash"), true);

assert.equal(inferTtsEmotion("真的假的！居然是你。"), "surprised");
assert.equal(inferTtsEmotion("放心吧，我会陪着你。"), "reassuring");
assert.equal(inferTtsEmotion("被你这样夸，我有点害羞。"), "embarrassed");
assert.equal(inferTtsEmotion("我等了这么久，真的很失望。"), "disappointed");
assert.equal(inferTtsEmotion("我已经迫不及待了！"), "excited");

assert.equal(inferTtsEmotion("你怎么现在才告诉我，真的很担心。"), "anxious");
assert.equal(inferTtsEmotion("太好了！你真的来了。"), "happy");
assert.equal(inferTtsEmotion("我去忙了，晚安。"), "neutral");
assert.equal(emotionTagForTts("angry", "strong"), "shouts");

assert.equal(
  buildTtsSynthesisText("太好了！", {
    provider: "elevenlabs",
    model: "eleven_v4",
    emotion: "happy",
    emotionEnabled: true,
  }),
  "[happy] 太好了！",
);
assert.equal(
  buildTtsSynthesisText("太好了！", {
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    emotion: "happy",
    emotionEnabled: true,
  }),
  "太好了！",
);
assert.equal(
  buildTtsSynthesisText("太好了！", {
    provider: "minimax",
    model: "speech-2.8-hd",
    emotion: "happy",
    emotionEnabled: true,
  }),
  "(chuckle) 太好了！",
);
assert.equal(
  buildTtsSynthesisText("我真的很难过。", {
    provider: "mossland",
    model: "moss-tts-1.5-flash",
    emotion: "sad",
    emotionEnabled: true,
  }),
  "……我真的很难过。",
);
assert.equal(cleanTtsText("[happy] 太好了！", false), "太好了！");
assert.equal(cleanTtsText("[happy] 太好了！", true), "[happy] 太好了！");

const taggedKey = getTtsCacheKey("太好了！", {
  provider: "elevenlabs",
  model: "eleven_v4",
  voiceId: "voice-1",
  emotion: "happy",
  emotionEnabled: true,
});
const neutralKey = getTtsCacheKey("太好了！", {
  provider: "elevenlabs",
  model: "eleven_v4",
  voiceId: "voice-1",
  emotion: "neutral",
  emotionEnabled: true,
});
assert.ok(taggedKey && neutralKey && taggedKey !== neutralKey);
assert.match(getTtsCacheKey("你好", { provider: "elevenlabs", model: "eleven_v4", voiceId: "voice-1" }) || "", /^tts_v4:/);
assert.match(taggedKey || "", /^tts_v5:/);

const chunks = splitTextIntoChunks("[sad] 第一段。第二段。", 6, true);
assert.match(chunks[0], /^\[sad\] /);
assert.ok(chunks.length >= 2);

console.log("PASS TTS emotion: model gating, hidden tags, inference, and cache isolation");
