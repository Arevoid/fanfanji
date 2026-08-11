import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCharacterTtsOptions, canPlayTtsMessage, getTtsProvider, normalizeMosslandApiEndpoint, resolveTtsCharacter, shouldQueueCallSpeech } from "../src/features/voice/ttsConfig";
import { fetchSingleTtsSegment } from "../src/utils/minimaxTts";

const mosslandSettings: any = {
  ttsProvider: "mossland",
  mosslandApiEndpoint: "https://voice.example/v1/audio/speech",
  mosslandApiKey: "moss-key",
  mosslandModel: "moss-tts",
};
assert.equal(getTtsProvider({}), "minimax", "legacy settings must remain on MiniMax");
assert.equal(normalizeMosslandApiEndpoint("https://mossland.mosi.cn"), "https://api.mosi.cn/v1/audio/speech");
assert.equal(normalizeMosslandApiEndpoint("https://mossland.studio/"), "https://api.mosi.cn/v1/audio/speech");
assert.equal(normalizeMosslandApiEndpoint("https://proxy.example/custom/speech"), "https://proxy.example/custom/speech");
assert.equal(canPlayTtsMessage({ isOfflineModeActive: false, isVoiceMessage: false, isQueuedCallSpeech: true }), true, "plain call subtitles must reach TTS");
assert.equal(canPlayTtsMessage({ isOfflineModeActive: false, isVoiceMessage: false, isQueuedCallSpeech: false }), false, "plain online text stays blocked");
assert.equal(shouldQueueCallSpeech("character", "电话里的回复"), true, "character call subtitles are eligible for TTS when the global switch is on");
assert.equal(shouldQueueCallSpeech("user", "用户说话"), false, "user call subtitles are never synthesized as character speech");
assert.equal(shouldQueueCallSpeech("character", "   "), false, "empty call subtitles are ignored");
const appChatSource = readFileSync(new URL("../src/components/AppChat.tsx", import.meta.url), "utf8");
assert.match(appChatSource, /callTtsAudioRef\.current \|\| new Audio\(\)/, "call playback must reuse the gesture-unlocked audio element");
assert.match(appChatSource, /if \(!incoming\) unlockCallTtsPlayback\(\)/, "outgoing call taps must unlock mobile audio");
assert.match(appChatSource, /settings\.enableMiniMaxTts && shouldQueueCallSpeech/, "the global TTS switch must govern call synthesis");
assert.match(appChatSource, /if \(!settings\.enableMiniMaxTts\) return false/, "the global TTS switch must disable automatic normal-chat voice conversion");
assert.match(appChatSource, /if \(callSpeechCompletion\) await callSpeechCompletion/, "the next call bubble must wait until the current speech finishes");
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

const originalFetch = globalThis.fetch;
let capturedUrl = "";
let capturedInit: RequestInit | undefined;
globalThis.fetch = async (input, init) => {
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

  await assert.rejects(
    () => fetchSingleTtsSegment("你好", buildCharacterTtsOptions(mosslandSettings)),
    /Mossland Voice ID/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("TTS provider tests passed");
