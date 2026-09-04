import assert from "node:assert/strict";
import {
  ApiRequestError,
  describeApiRequestError,
  fetchWithTimeout,
  isApiRequestError,
  readResponseTextWithTimeout,
} from "../src/utils/fetchWithTimeout";

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  await assert.rejects(
    () => fetchWithTimeout("https://slow.example", {}, 10),
    (error: unknown) => isApiRequestError(error, "timeout") && /10ms/.test((error as Error).message),
  );

  globalThis.fetch = (async () => { throw new TypeError("socket closed"); }) as typeof fetch;
  await assert.rejects(
    () => fetchWithTimeout("https://offline.example", {}, 100),
    (error: unknown) => isApiRequestError(error, "network"),
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => fetchWithTimeout("https://cancelled.example", { signal: controller.signal }, 100),
    (error: unknown) => isApiRequestError(error, "aborted"),
  );

  const activeController = new AbortController();
  globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  const activeRequest = fetchWithTimeout("https://cancelled-during-request.example", { signal: activeController.signal }, 100);
  activeController.abort();
  await assert.rejects(activeRequest, (error: unknown) => isApiRequestError(error, "aborted"));

  globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
  assert.equal(await (await fetchWithTimeout("https://ok.example", {}, 100)).text(), "ok");

  let cancelledBody = false;
  const stalledResponse = {
    text: () => new Promise<string>(() => undefined),
    body: { cancel: async () => { cancelledBody = true; } },
  } as unknown as Response;
  await assert.rejects(
    () => readResponseTextWithTimeout(stalledResponse, 10),
    (error: unknown) => isApiRequestError(error, "timeout"),
  );
  assert.equal(cancelledBody, true, "cancels a stalled response body after headers have arrived");

  assert.match(describeApiRequestError(new ApiRequestError("timeout", "timeout", { timeoutMs: 20_000 }), "聊天 API"), /聊天 API请求超时（20 秒）/);
  assert.match(describeApiRequestError(new ApiRequestError("network", "network"), "翻译 API"), /网络连接失败/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS API timeout, cancellation, network classification, and cleanup");
