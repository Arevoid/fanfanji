import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCharacterTtsOptions, canPlayTtsMessage, getTtsProvider, normalizeMosslandApiEndpoint, resolveTtsCharacter, shouldQueueCallSpeech } from "../src/features/voice/ttsConfig";
import { fetchSingleTtsSegment, getTtsCacheKey } from "../src/utils/minimaxTts";
import { synthesizeElevenLabsSpeech } from "../src/server/elevenLabsTts";

const mosslandSettings: any = {
  ttsProvider: "mossland",
  mosslandApiEndpoint: "https://voice.example/v1/audio/speech",
  mosslandApiKey: "moss-key",
  mosslandModel: "moss-tts",
};
assert.equal(getTtsProvider({}), "minimax", "legacy settings must remain on MiniMax");
assert.equal(getTtsProvider({ ttsProvider: "elevenlabs" }), "elevenlabs", "ElevenLabs provider must be selectable");
assert.equal(normalizeMosslandApiEndpoint("https://mossland.mosi.cn"), "https://api.mosi.cn/v1/audio/speech");
assert.equal(normalizeMosslandApiEndpoint("https://mossland.studio/"), "https://api.mosi.cn/v1/audio/speech");
assert.equal(normalizeMosslandApiEndpoint("https://proxy.example/custom/speech"), "https://proxy.example/custom/speech");
assert.equal(canPlayTtsMessage({ isOfflineModeActive: false, isVoiceMessage: false, isQueuedCallSpeech: true }), true, "plain call subtitles must reach TTS");
assert.equal(canPlayTtsMessage({ isOfflineModeActive: false, isVoiceMessage: false, isQueuedCallSpeech: false }), false, "plain online text stays blocked");
assert.equal(shouldQueueCallSpeech("character", "电话里的回复"), true, "character call subtitles are eligible for TTS when the global switch is on");
assert.equal(shouldQueueCallSpeech("user", "用户说话"), false, "user call subtitles are never synthesized as character speech");
assert.equal(shouldQueueCallSpeech("character", "   "), false, "empty call subtitles are ignored");
const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
const directReplyDeliverySource = readFileSync(new URL("../src/features/chat/services/directReplyDeliveryService.ts", import.meta.url), "utf8");
const voiceBubbleEligibilitySource = readFileSync(new URL("../src/features/chat/services/voiceBubbleEligibility.ts", import.meta.url), "utf8");
const chatDeliverySource = readFileSync(new URL("../src/features/chat/services/chatMessageDelivery.ts", import.meta.url), "utf8");
const callPlaybackSource = readFileSync(new URL("../src/features/chat/hooks/useChatCallSpeechPlayback.ts", import.meta.url), "utf8");
assert.match(callPlaybackSource, /callTtsAudioRef\.current \|\| new Audio\(\)/, "call playback must reuse the gesture-unlocked audio element");
assert.match(appChatSource, /if \(!incoming\) unlockCallTtsPlayback\(\)/, "outgoing call taps must unlock mobile audio");
assert.match(chatDeliverySource, /options\.settings\.enableMiniMaxTts && shouldQueueCallSpeech/, "the global TTS switch must govern call synthesis");
assert.match(voiceBubbleEligibilitySource, /if \(!enabled\) return false/, "the global TTS switch must disable automatic normal-chat voice conversion");
assert.match(directReplyDeliverySource, /if \(callSpeechCompletion\) await callSpeechCompletion/, "the next call bubble must wait until the current speech finishes");
assert.match(
  callPlaybackSource,
  /const playback = audio\.play\(\);[\s\S]*revealCallSubtitleOnce\(\);[\s\S]*await playback/,
  "a character call subtitle must be revealed in the same turn that starts audio playback",
);
assert.match(callPlaybackSource, /callSpeechGenerationRef\.current \+= 1/, "clearing a call must invalidate in-flight speech synthesis");
assert.match(callPlaybackSource, /const blob = await getSpeechForText[\s\S]*if \(isCancelledCallSpeech\(\)\) return/, "late TTS results must be discarded after hang-up");
assert.match(callPlaybackSource, /if \(callTtsObjectUrlRef\.current\)[\s\S]*URL\.revokeObjectURL/, "hang-up must revoke the active call audio URL");
assert.match(callPlaybackSource, /audioDb\.getTrackFile\(msg\.audioAssetId\)/, "message playback must prefer the durable saved audio asset");
assert.match(callPlaybackSource, /onUpdateMessage\(msg\.id, \{ audioAssetId: cacheKey \}/, "first synthesis must link its cache asset back to the message");
assert.match(callPlaybackSource, /msg\.audioUrl \|\| msg\.audioAssetId/, "saved voice assets must remain eligible for playback even after a reload");
assert.match(readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8"), /triggerMessageSpeech\(bm\)/, "favorites must reuse the shared message speech playback path");
assert.match(
  directReplyDeliverySource,
  /if \(input\.shouldCancel\(\) \|\| input\.signal\?\.aborted\) break/,
  "hang-up must stop unsent bubbles from the cancelled call turn",
);
const canonicalCharacter: any = { id: "profile", name: "角色", mosslandVoiceId: "canonical-voice" };
const contactCharacter: any = { id: "contact", name: "联系人", isContactInstance: true, profileSourceId: "profile" };
assert.equal(
  resolveTtsCharacter([contactCharacter, canonicalCharacter], "profile", "contact")?.mosslandVoiceId,
  "canonical-voice",
  "a contact copy must not shadow the canonical profile voice",
);
assert.deepEqual(buildCharacterTtsOptions(mosslandSettings, { mosslandVoiceId: "moss-voice" }), {
  provider: "mossland",
  apiEndpoint: "https://voice.example/v1/audio/speech",
  apiKey: "moss-key",
  model: "moss-tts",
  voiceId: "moss-voice",
});

const minimaxOptions = buildCharacterTtsOptions({
  minimaxApiKey: "mini-key",
  minimaxGroupId: "group",
  minimaxModel: "speech-2.8-hd",
  minimaxSpeed: 1.1,
  minimaxPitch: 2,
  minimaxVol: 0.9,
} as any, { minimaxVoiceId: "mini-voice", minimaxSpeed: 1.3 });
assert.equal(minimaxOptions.provider, "minimax");
assert.equal(minimaxOptions.voiceId, "mini-voice");
assert.equal(minimaxOptions.speed, 1.3);
assert.equal(
  getTtsCacheKey("（轻声）你好", minimaxOptions),
  getTtsCacheKey("你好", minimaxOptions),
  "action-only markup must not create a second billable audio asset",
);
assert.notEqual(
  getTtsCacheKey("你好", minimaxOptions),
  getTtsCacheKey("你好", { ...minimaxOptions, voiceId: "another-voice" }),
  "different voices must keep separate audio assets",
);

const elevenLabsSettings: any = {
  ttsProvider: "elevenlabs",
  elevenlabsApiEndpoint: "https://api.elevenlabs.io",
  elevenlabsApiKey: "eleven-key",
  elevenlabsModel: "eleven_multilingual_v2",
};
const elevenLabsOptions = buildCharacterTtsOptions(elevenLabsSettings, { elevenlabsVoiceId: "eleven-voice" });
assert.deepEqual(elevenLabsOptions, {
  provider: "elevenlabs",
  apiEndpoint: "https://api.elevenlabs.io",
  apiKey: "eleven-key",
  model: "eleven_multilingual_v2",
  voiceId: "eleven-voice",
});

const originalFetch = globalThis.fetch;
let capturedUrl = "";
let capturedInit: RequestInit | undefined;
let fetchCount = 0;
globalThis.fetch = async (input, init) => {
  fetchCount += 1;
  capturedUrl = String(input);
  capturedInit = init;
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
};

try {
  const blob = await fetchSingleTtsSegment("你好", buildCharacterTtsOptions(
    mosslandSettings,
    { mosslandVoiceId: "moss-voice" },
  ));
  assert.equal(capturedUrl, "/api/mossland-tts");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    apiEndpoint: "https://voice.example/v1/audio/speech",
    apiKey: "moss-key",
    model: "moss-tts",
    text: "你好",
    voiceId: "moss-voice",
  });
  assert.equal(blob.type, "audio/mpeg");

  const minimaxBlob = await fetchSingleTtsSegment("你好", minimaxOptions);
  assert.equal(capturedUrl, "/api/minimax-tts", "MiniMax must use the app proxy by default");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    text: "你好",
    apiKey: "mini-key",
    groupId: "group",
    model: "speech-2.8-hd",
    voiceId: "mini-voice",
    speed: 1.3,
    pitch: 2,
    vol: 0.9,
  });
  assert.equal(minimaxBlob.type, "audio/mpeg");

  const minimaxEmotionBlob = await fetchSingleTtsSegment("太好了！", {
    ...minimaxOptions,
    emotion: "happy",
    emotionEnabled: true,
  });
  assert.equal(capturedUrl, "/api/minimax-tts");
  assert.equal(JSON.parse(String(capturedInit?.body)).text, "(chuckle) 太好了！");
  assert.equal(minimaxEmotionBlob.type, "audio/mpeg");

  const mosslandEmotionBlob = await fetchSingleTtsSegment("我真的很难过。", {
    ...buildCharacterTtsOptions({ ...mosslandSettings, mosslandModel: "moss-tts-1.5-flash" }, { mosslandVoiceId: "moss-voice" }),
    emotion: "sad",
    emotionEnabled: true,
  });
  assert.equal(capturedUrl, "/api/mossland-tts");
  assert.equal(JSON.parse(String(capturedInit?.body)).text, "……我真的很难过。");
  assert.equal(mosslandEmotionBlob.type, "audio/mpeg");

  const elevenLabsBlob = await fetchSingleTtsSegment("你好", elevenLabsOptions);
  assert.equal(capturedUrl, "/api/elevenlabs-tts", "ElevenLabs must use the app proxy by default");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    apiEndpoint: "https://api.elevenlabs.io",
    apiKey: "eleven-key",
    model: "eleven_multilingual_v2",
    text: "你好",
    voiceId: "eleven-voice",
  });
  assert.equal(elevenLabsBlob.type, "audio/mpeg");

  const elevenLabsEmotionBlob = await fetchSingleTtsSegment("太好了！", {
    ...elevenLabsOptions,
    model: "eleven_v4",
    emotion: "happy",
    emotionEnabled: true,
  });
  assert.equal(capturedUrl, "/api/elevenlabs-tts");
  assert.equal(JSON.parse(String(capturedInit?.body)).text, "[happy] 太好了！");
  assert.equal(elevenLabsEmotionBlob.type, "audio/mpeg");

  const beforeConcurrentSynthesis = fetchCount;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await Promise.all([
      import("../src/utils/minimaxTts").then(({ getSpeechForText }) => getSpeechForText("并发去重测试", elevenLabsOptions)),
      import("../src/utils/minimaxTts").then(({ getSpeechForText }) => getSpeechForText("并发去重测试", elevenLabsOptions)),
    ]);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(fetchCount - beforeConcurrentSynthesis, 1, "same audio synthesis must share one in-flight provider request");

  await assert.rejects(
    () => fetchSingleTtsSegment("你好", buildCharacterTtsOptions(mosslandSettings)),
    /Mossland Voice ID/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

let upstreamUrl = "";
let upstreamInit: RequestInit | undefined;
const upstreamResult = await synthesizeElevenLabsSpeech({
  apiEndpoint: "https://api.elevenlabs.io",
  apiKey: "eleven-key",
  model: "eleven_multilingual_v2",
  voiceId: "eleven-voice",
  text: "测试",
}, async (input, init) => {
  upstreamUrl = String(input);
  upstreamInit = init;
  return new Response(new Uint8Array([4, 5, 6]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
});
assert.equal(upstreamUrl, "https://api.elevenlabs.io/v1/text-to-speech/eleven-voice?output_format=mp3_44100_128");
assert.equal(new Headers(upstreamInit?.headers).get("xi-api-key"), "eleven-key");
assert.deepEqual(JSON.parse(String(upstreamInit?.body)), { text: "测试", model_id: "eleven_multilingual_v2" });
assert.equal(upstreamResult.contentType, "audio/mpeg");
await assert.rejects(
  () => synthesizeElevenLabsSpeech({ apiKey: "eleven-key", model: "eleven_multilingual_v2", text: "测试" }, async () => new Response()),
  /ElevenLabs Voice ID/,
);

console.log("TTS provider tests passed");
