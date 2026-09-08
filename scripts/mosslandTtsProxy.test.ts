import assert from "node:assert/strict";
import { MosslandTtsError, synthesizeMosslandSpeech } from "../src/server/mosslandTts";

let capturedUrl = "";
let capturedInit: RequestInit | undefined;
const result = await synthesizeMosslandSpeech({
  apiEndpoint: "https://api.mosi.cn/v1/audio/speech",
  apiKey: "test-key-not-logged",
  model: "moss-tts",
  voiceId: "voice-a",
  text: "测试语音",
}, async (input, init) => {
  capturedUrl = String(input);
  capturedInit = init;
  return new Response(new Uint8Array([1, 2, 3]), {
    headers: { "Content-Type": "audio/mpeg" },
  });
});

assert.equal(capturedUrl, "https://api.mosi.cn/v1/audio/speech");
assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer test-key-not-logged");
assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
  model: "moss-tts",
  input: "测试语音",
  voice_id: "voice-a",
  response_format: "mp3",
  delivery_method: "audio",
}, "the provider receives only its strict documented fields");
assert.equal(result.contentType, "audio/mpeg");
assert.equal(result.audio.byteLength, 3);

await assert.rejects(
  () => synthesizeMosslandSpeech({ apiEndpoint: "file:///secret", apiKey: "key", voiceId: "voice", text: "text" }),
  (error: unknown) => error instanceof MosslandTtsError && /HTTP\(S\)/.test(error.message),
);

console.log("Mossland TTS proxy tests passed");
