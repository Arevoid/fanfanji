import assert from "node:assert/strict";
import { storageKeys } from "../src/core/storage/storageKeys";
import { loadMcpServers, saveMcpServers } from "../src/core/storage/repositories/mcpServerRepository";
import { callMcpTool, discoverMcpTools, setMcpSessionToken } from "../src/features/mcp/mcpClient";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
const server = { id: "demo", name: "Demo", url: "https://mcp.example.test/mcp", enabled: true, directFetch: true, readOnlyOnly: true as const, discoveredTools: [], updatedAt: Date.now() };
assert.equal(saveMcpServers([server]).success, true);
assert.equal(loadMcpServers()[0]?.id, "demo");
assert.equal(localStorage.getItem(storageKeys.mcpServers)?.includes("readOnlyOnly"), true);

const calls: Array<{ body: any; headers: HeadersInit }> = [];
const previousFetch = globalThis.fetch;
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ body: JSON.parse(String(init?.body || "{}")), headers: init?.headers || {} });
  const body = calls.at(-1)?.body;
  if (body?.method === "initialize") {
    const payload = { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "demo", version: "1" } } };
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, { headers: { "Content-Type": "text/event-stream", "Mcp-Session-Id": "session-1" } });
  }
  if (body?.method === "tools/list") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "lookup", description: "Read data", annotations: { readOnlyHint: true }, inputSchema: { type: "object" } }, { name: "write", annotations: { readOnlyHint: false } }] } }), { headers: { "Content-Type": "application/json" } });
  if (body?.method === "tools/call") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "safe result" }] } }), { headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ jsonrpc: "2.0", result: {} }), { headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
try {
  const tools = await discoverMcpTools(server);
  assert.equal(tools.length, 2);
  assert.equal(tools[0].readOnly, true);
  assert.equal(tools[0].enabled, true);
  assert.equal(tools[1].enabled, false);
  const ready = { ...server, discoveredTools: tools, connectionStatus: "connected" as const };
  setMcpSessionToken("demo", "session-token");
  const result = await callMcpTool(ready, { serverId: "demo", toolName: "lookup", arguments: { q: "x" } });
  assert.equal(result.content[0].text, "safe result");
  assert.equal(calls.some((call) => String((call.headers as Record<string, string>).Authorization || "").includes("session-token")), true);
} finally {
  globalThis.fetch = previousFetch;
}
console.log("PASS MCP persistence, read-only discovery, JSON-RPC call, and session-only token behavior");
