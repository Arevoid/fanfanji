import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker";

const assets = { fetch: async () => new Response("asset", { status: 200 }) };
const originalFetch = globalThis.fetch;

try {
  const methodResult = await worker.fetch(new Request("https://app.example/api/image/models"), { ASSETS: assets });
  assert.equal(methodResult.status, 405);

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://provider.example/v1/models");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key-not-logged");
    return Response.json({ data: [{ id: "gemini-2.5-flash-image" }] });
  };
  const modelsResult = await worker.fetch(new Request("https://app.example/api/image/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "test-key-not-logged", apiEndpoint: "https://provider.example/v1", protocol: "gemini-native-image" }),
  }), { ASSETS: assets });
  assert.equal(modelsResult.status, 200);
  assert.deepEqual((await modelsResult.json()).models, ["gemini-2.5-flash-image"]);

  const blockedResult = await worker.fetch(new Request("https://app.example/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trigger: "explicit-user-text", userText: "不要发照片" }),
  }), { ASSETS: assets });
  assert.equal(blockedResult.status, 403);

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.mosi.cn/v1/audio/speech");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer moss-key-not-logged");
    return new Response(new Uint8Array([4, 5, 6]), { headers: { "Content-Type": "audio/mpeg" } });
  };
  const mosslandResult = await worker.fetch(new Request("https://app.example/api/mossland-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiEndpoint: "https://api.mosi.cn/v1/audio/speech", apiKey: "moss-key-not-logged", model: "moss-tts", voiceId: "voice-a", text: "你好" }),
  }), { ASSETS: assets });
  assert.equal(mosslandResult.status, 200);
  assert.equal(mosslandResult.headers.get("Content-Type"), "audio/mpeg");
  assert.equal((await mosslandResult.arrayBuffer()).byteLength, 3);

  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /api\.minimax\.chat\/v1\/t2a_v2/);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer mini-key-not-logged");
    return Response.json({ data: { audio: "010203" } });
  };
  const minimaxResult = await worker.fetch(new Request("https://app.example/api/minimax-tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "mini-key-not-logged", groupId: "group-a", model: "speech-2.8-hd", voiceId: "voice-a", text: "你好" }),
  }), { ASSETS: assets });
  assert.equal(minimaxResult.status, 200);
  assert.equal(minimaxResult.headers.get("Content-Type"), "audio/mpeg");
  assert.equal((await minimaxResult.arrayBuffer()).byteLength, 3);

  console.log("cloudflareImageProxy.test passed");
} finally {
  globalThis.fetch = originalFetch;
}
