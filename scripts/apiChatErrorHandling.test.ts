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
