import assert from "node:assert/strict";
import { proxyMcpRequest, validateMcpProxyUrl } from "../src/server/mcpProxy";

assert.equal(validateMcpProxyUrl("https://example.com/mcp").protocol, "https:");
assert.equal(validateMcpProxyUrl("http://127.0.0.1:8787/mcp").hostname, "127.0.0.1");
assert.throws(() => validateMcpProxyUrl("http://10.0.0.2/mcp"), /不允许|仅允许/);
assert.throws(() => validateMcpProxyUrl("https://user:pass@example.com/mcp"), /不允许/);

const previousFetch = globalThis.fetch;
let forwardedHeaders: Record<string, string> = {};
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  forwardedHeaders = Object.fromEntries(new Headers(init?.headers).entries());
  return new Response("{\"jsonrpc\":\"2.0\",\"result\":{}}", {
    status: 200,
    headers: { "Content-Type": "application/json", "Mcp-Session-Id": "session-2" },
  });
}) as typeof fetch;
try {
  const response = await proxyMcpRequest({
    url: "https://example.com/mcp",
    body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    headers: { "Mcp-Session-Id": "session-1" },
  });
  assert.equal(forwardedHeaders["mcp-session-id"], "session-1");
  assert.equal(response.headers.get("mcp-session-id"), "session-2");
} finally {
  globalThis.fetch = previousFetch;
}
console.log("PASS MCP proxy URL guards and case-insensitive streamable HTTP session forwarding");
