import assert from "node:assert/strict";
import { ImageApiError, baseFor, fetchImageModels, generateImageWithProtocol, testImageConnectionWithProtocol } from "../src/server/imageProtocolAdapters";

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; init?: RequestInit }> = [];
const key = "test-key-must-not-appear-in-errors";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

try {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const target = String(url);
    if (target.includes("unauthorized")) return response(401, { error: "bad credential" });
    if (target.includes("forbidden")) return response(403, { error: "forbidden" });
    if (target.includes("limited")) return response(429, { error: "limited" });
    if (target.includes("missing")) return response(404, { error: "missing" });
    if (target.includes("unsupported")) return response(400, { error: "model does not support image generation" });
    if (target.endsWith("/models")) return response(200, { data: [{ id: "gpt-image-test" }] });
    if (target.includes("/images/generations")) return response(200, { data: [{ b64_json: "T1BFTkFJ" }] });
    if (target.includes("snake") && target.includes(":generateContent")) return response(200, { candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/webp", data: "U05BS0U=" } }] } }] });
    if (target.includes("text-only") && target.includes(":generateContent")) return response(200, { candidates: [{ content: { parts: [{ text: "I cannot provide an image." }] } }], usageMetadata: {} });
    if (target.includes(":generateContent")) return response(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/webp", data: "R0VNSU5J" } }] } }] });
    return response(200, { name: "models/gemini-2.5-flash-image" });
  }) as typeof fetch;

  assert.equal(baseFor("https://host/v1", "gemini-native-image"), "https://host/v1");
  assert.equal(baseFor("https://host/v1/", "gemini-native-image"), "https://host/v1");
  assert.equal(baseFor("https://host", "gemini-native-image"), "https://host");
  assert.equal(baseFor("https://host/v1/models", "gemini-native-image"), "https://host/v1");

  const models = await fetchImageModels({ protocol: "openai-images", apiEndpoint: "https://models.example/v1", apiKey: key });
  assert.deepEqual(models, ["gpt-image-test"]);
  assert.equal(calls[0].url, "https://models.example/v1/models");
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"), `Bearer ${key}`);

  const geminiTest = await testImageConnectionWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", apiEndpoint: "https://gemini.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "unused" });
  assert.equal(geminiTest.kind, "image-path");
  assert.equal(calls[1].url, "https://gemini.example/v1/models/gemini-2.5-flash-image");
  assert.equal(new Headers(calls[1].init?.headers).get("authorization"), `Bearer ${key}`);
  assert.equal(calls[1].init?.method, undefined, "Gemini test must be a safe GET and must not generate an image");
  const geminiFallback = await testImageConnectionWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", apiEndpoint: "https://missing.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "unused" });
  assert.equal(geminiFallback.kind, "manual-model");
  assert.match(geminiFallback.message, /安全模型查询接口/);

  const openAi = await generateImageWithProtocol({ protocol: "openai-images", apiEndpoint: "https://openai.example/v1", apiKey: key, model: "gpt-image-test", prompt: "portrait" });
  assert.equal(openAi, "data:image/png;base64,T1BFTkFJ");
  assert.equal(calls[3].url, "https://openai.example/v1/images/generations");
  assert.deepEqual(JSON.parse(String(calls[3].init?.body)), { model: "gpt-image-test", prompt: "portrait", n: 1, size: "1024x1024" });

  const gemini = await generateImageWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", referenceImageSupported: true, apiEndpoint: "https://gemini.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "portrait", referenceImage: { mimeType: "image/jpeg", base64: "UkVG" } });
  assert.equal(gemini, "data:image/webp;base64,R0VNSU5J");
  assert.equal(calls[4].url, "https://gemini.example/v1/models/gemini-2.5-flash-image:generateContent");
  assert.equal(new Headers(calls[4].init?.headers).get("authorization"), `Bearer ${key}`);
  assert.deepEqual(JSON.parse(String(calls[4].init?.body)).contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "UkVG" } });

  const snakeCaseGemini = await generateImageWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", apiEndpoint: "https://snake.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "portrait" });
  assert.equal(snakeCaseGemini, "data:image/webp;base64,U05BS0U=");
  await assert.rejects(
    generateImageWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", apiEndpoint: "https://text-only.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "portrait" }),
    /只返回了文字|未输出图片数据/,
  );

  for (const [host, expected] of [["unauthorized", /模型列表认证失败/], ["forbidden", /没有读取模型列表的权限/], ["limited", /过于频繁|额度受限/], ["missing", /未能读取模型列表/]] as const) {
    await assert.rejects(fetchImageModels({ protocol: "openai-images", apiEndpoint: `https://${host}.example/v1`, apiKey: key }), (error: unknown) => {
      assert.ok(error instanceof ImageApiError);
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, new RegExp(key));
      return true;
    });
  }
  await assert.rejects(generateImageWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", apiEndpoint: "https://unsupported.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "portrait" }), /模型不支持图片生成/);
  await assert.rejects(generateImageWithProtocol({ protocol: "gemini-native-image", geminiAuthMode: "bearer", apiEndpoint: "https://missing.example/v1", apiKey: key, model: "gemini-2.5-flash-image", prompt: "portrait" }), /不支持 Gemini 图片接口路径/);
  await assert.rejects(generateImageWithProtocol({ protocol: "imagen-text", apiEndpoint: "https://missing.example/v1", apiKey: key, model: "imagen-test", prompt: "portrait", referenceImage: { base64: "UkVG" } }), /参考图/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("imageProtocolAdapters.test passed");
