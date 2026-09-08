import assert from "node:assert/strict";
import { apiFetchImageModels, apiTestImageConnection } from "../src/utils/apiHelper";

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async () => new Response("<!doctype html><title>Not found</title>", {
    status: 404,
    headers: { "content-type": "text/html" },
  });

  await assert.rejects(
    () => apiFetchImageModels({ apiKey: "test-key-must-not-appear", apiEndpoint: "https://host/v1" }),
    /图片代理服务未响应（HTTP 404）/,
  );

  const testResult = await apiTestImageConnection({
    apiKey: "test-key-must-not-appear",
    apiEndpoint: "https://host/v1",
    selectedModel: "gemini-2.5-flash-image",
  });
  assert.equal(testResult.success, false);
  assert.match(testResult.message, /图片代理服务未响应（HTTP 404）/);

  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };
  await assert.rejects(
    () => apiFetchImageModels({ apiKey: "test-key-must-not-appear", apiEndpoint: "https://host/v1" }),
    /图片代理服务未响应/,
  );

  console.log("imageProxyResponse.test passed");
} finally {
  globalThis.fetch = originalFetch;
}
