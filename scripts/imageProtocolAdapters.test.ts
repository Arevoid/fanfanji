import assert from "node:assert/strict";
import { fetchImageModels, generateImageWithProtocol } from "../src/server/imageProtocolAdapters";

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; init?: RequestInit }> = [];

try {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/models")) return new Response(JSON.stringify({ models: [] }), { status: 200 });
    if (String(url).includes("gemini")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/webp", data: "R0VNSU5J" } }] } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [{ b64_json: "T1BFTkFJ" }] }), { status: 200 });
  }) as typeof fetch;

  const openAi = await generateImageWithProtocol({ protocol: "openai-images", apiEndpoint: "https://example.invalid/v1", apiKey: "key", model: "gpt-image-test", prompt: "portrait" });
  assert.equal(openAi, "data:image/png;base64,T1BFTkFJ");
  assert.equal(calls[0].url, "https://example.invalid/v1/images/generations");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { model: "gpt-image-test", prompt: "portrait", n: 1, size: "1024x1024" });

  const gemini = await generateImageWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "x-goog-api-key", referenceImageSupported: true, apiEndpoint: "https://gemini.invalid/v1beta", apiKey: "gem-key", model: "gemini-2.5-flash-image", prompt: "portrait", referenceImage: { mimeType: "image/jpeg", base64: "UkVG" } });
  assert.equal(gemini, "data:image/webp;base64,R0VNSU5J");
  assert.equal(calls[1].url, "https://gemini.invalid/v1beta/models/gemini-2.5-flash-image:generateContent");
  assert.equal(new Headers(calls[1].init?.headers).get("x-goog-api-key"), "gem-key");
  const geminiBody = JSON.parse(String(calls[1].init?.body));
  assert.deepEqual(geminiBody.contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "UkVG" } });

  await assert.rejects(
    generateImageWithProtocol({ protocol: "imagen-text", apiEndpoint: "https://imagen.invalid", apiKey: "key", model: "imagen-test", prompt: "portrait", referenceImage: { base64: "UkVG" } }),
    /参考图|reference/i,
  );
  assert.equal(calls.length, 2, "Imagen must be blocked before an unsupported reference-image request reaches upstream");
  await assert.rejects(
    generateImageWithProtocol({ protocol: "unknown-protocol" as any, apiEndpoint: "https://invalid", apiKey: "key", model: "model", prompt: "portrait" }),
    /不支持的图片 API 协议/,
  );
  await assert.rejects(
    fetchImageModels({ protocol: "gemini-native-image", apiEndpoint: "https://gemini.invalid/v1beta", apiKey: "gem-key", geminiAuthMode: "bearer" }),
    /不会伪造可用模型/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("imageProtocolAdapters.test passed");
