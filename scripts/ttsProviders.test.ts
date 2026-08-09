import assert from "node:assert/strict";
import { buildCharacterTtsOptions, getTtsProvider } from "../src/features/voice/ttsConfig";
import { fetchSingleTtsSegment } from "../src/utils/minimaxTts";

const mosslandSettings: any = {
  ttsProvider: "mossland",
  mosslandApiEndpoint: "https://voice.example/v1/audio/speech",
  mosslandApiKey: "moss-key",
  mosslandModel: "moss-tts",
};
assert.equal(getTtsProvider({}), "minimax", "legacy settings must remain on MiniMax");
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

  await assert.rejects(
    () => fetchSingleTtsSegment("你好", buildCharacterTtsOptions(mosslandSettings)),
    /Mossland Voice ID/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("TTS provider tests passed");
