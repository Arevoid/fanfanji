import assert from "node:assert/strict";
import worker from "../src/cloudflare/worker";
import { apiFetchModels, apiTranslate } from "../src/utils/apiHelper";
import { callTextProvider } from "../src/server/textProtocolAdapters";

const originalFetch = globalThis.fetch;
const selectedModel = "gemini-custom-through-openai-proxy";

try {
  let providerPayload: any;
  globalThis.fetch = async (_input, init) => {
    providerPayload = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: "译文" } }] });
  };
  assert.equal(await callTextProvider({ message: "translate", apiKey: "key", model: selectedModel, apiEndpoint: "https://provider.example/v1" }), "译文");
  assert.equal(providerPayload.model, selectedModel, "text helpers must preserve the selected custom-endpoint model");

  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (calls === 1) return new Response("", { status: 404 });
    providerPayload = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: "客户端回退译文" } }] });
  };
  assert.deepEqual(await apiTranslate({ text: "안녕", apiKey: "key", model: selectedModel, apiEndpoint: "https://provider.example/v1" }), { text: "客户端回退译文" });
  assert.equal(providerPayload.model, selectedModel);

  let assetCalls = 0;
  globalThis.fetch = async (_input, init) => {
    providerPayload = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: "Worker 译文" } }] });
  };
  const translationResponse = await worker.fetch(new Request("https://app.example/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "안녕", apiKey: "key", model: selectedModel, apiEndpoint: "https://provider.example/v1" }),
  }), { ASSETS: { fetch: async () => { assetCalls += 1; return new Response("asset"); } } });
  assert.equal(translationResponse.status, 200);
  assert.equal((await translationResponse.json() as any).text, "Worker 译文");
  assert.equal(providerPayload.model, selectedModel);
  assert.equal(assetCalls, 0, "Cloudflare must handle translation instead of sending it to static assets");

  globalThis.fetch = async () => { throw new TypeError("model endpoint unavailable"); };
  await assert.rejects(() => apiFetchModels({ apiKey: "key", apiEndpoint: "https://provider.example/v1" }), /unavailable/);

  console.log("PASS selected-model preservation, Cloudflare translation routing, and honest model-list errors");
} finally {
  globalThis.fetch = originalFetch;
}
