import assert from "node:assert/strict";
import { apiChat, isProhibitedContentError } from "../src/utils/apiHelper";

const originalFetch = globalThis.fetch;
const request = {
  message: "生成一条动态",
  history: [],
  systemInstruction: "角色资料",
  apiKey: "test-key",
  model: "gemini-test",
  apiEndpoint: "https://example.test/v1",
};

try {
  let blockedCalls = 0;
  globalThis.fetch = (async () => {
    blockedCalls += 1;
    return new Response(JSON.stringify({
      error: '自定义接口请求失败 (400): {"detail":"request blocked by Gemini API: PROHIBITED_CONTENT"}',
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await assert.rejects(
    () => apiChat(request),
    (error) => isProhibitedContentError(error),
    "Gemini 内容安全拦截必须保留为可识别错误",
  );
  assert.equal(blockedCalls, 1, "有效的 HTTP 400 不得再通过客户端重复请求");

  let emptyRoute404Calls = 0;
  globalThis.fetch = (async () => {
    emptyRoute404Calls += 1;
    if (emptyRoute404Calls === 1) {
      return new Response("", { status: 404 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "空 404 后直连成功" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  assert.deepEqual(await apiChat(request), { text: "空 404 后直连成功" });
  assert.equal(emptyRoute404Calls, 2, "静态部署缺少 /api/chat 时必须回退到自定义接口直连");

  let provider404Calls = 0;
  globalThis.fetch = (async () => {
    provider404Calls += 1;
    return new Response(JSON.stringify({ error: "provider model not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  await assert.rejects(() => apiChat(request), /provider model not found/);
  assert.equal(provider404Calls, 1, "带供应商错误正文的 404 不得重复直连");

  let networkFallbackCalls = 0;
  globalThis.fetch = (async () => {
    networkFallbackCalls += 1;
    if (networkFallbackCalls === 1) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ choices: [{ message: { content: "直连成功" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  assert.deepEqual(await apiChat(request), { text: "直连成功" });
  assert.equal(networkFallbackCalls, 2, "真正的后端网络故障仍应允许一次客户端直连");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS chat API error preservation, prohibited-content no-retry, and network fallback");
