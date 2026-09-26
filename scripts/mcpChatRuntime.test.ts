import assert from "node:assert/strict";
import { saveMcpServers } from "../src/core/storage/repositories/mcpServerRepository";
import { createMcpAwareRequestAi } from "../src/features/mcp/mcpChatRuntime";

class MemoryStorage { private readonly values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); } }
const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
const server = { id: "demo", name: "Demo", url: "https://mcp.example.test/mcp", enabled: true, directFetch: true, readOnlyOnly: true as const, discoveredTools: [{ name: "lookup", description: "read", inputSchema: { type: "object" }, readOnly: true, enabled: true }], connectionStatus: "connected" as const, updatedAt: Date.now() };
saveMcpServers([server]);
const previousFetch = globalThis.fetch;
const mcpBodies: any[] = [];
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body || "{}"));
  mcpBodies.push(body);
  if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "Content-Type": "application/json" } });
  if (body.method === "tools/call") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "外部只读结果" }] } }), { headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
try {
  const calls: any[] = [];
  const base = async (request: any) => {
    calls.push(request);
    if (calls.length === 1) return { text: '[[MCP_TOOL_REQUEST]]{"serverId":"demo","toolName":"lookup","arguments":{"q":"天气"}}[[/MCP_TOOL_REQUEST]]' };
    return { text: "基于外部只读结果的自然回复" };
  };
  const result = await createMcpAwareRequestAi(base)( { message: "查一下", history: [], systemInstruction: "人设", apiKey: "", model: "m" });
  assert.equal(result.text, "基于外部只读结果的自然回复");
  assert.equal(calls.length, 2);
  assert.match(calls[0].systemInstruction, /MCP 只读工具/);
  assert.match(calls[1].systemInstruction, /外部只读结果/);
  saveMcpServers([]);
  const untouched: any[] = [];
  const plain = await createMcpAwareRequestAi(async (request) => { untouched.push(request); return { text: "普通回复" }; })({ message: "普通", history: [], systemInstruction: "原始", apiKey: "", model: "m" });
  assert.equal(plain.text, "普通回复");
  assert.equal(untouched.length, 1);
  assert.equal(untouched[0].systemInstruction, "原始");

  const fetchServer = {
    ...server,
    id: "exa",
    name: "联网",
    discoveredTools: [{ name: "web_fetch_exa", description: "读取网页正文", inputSchema: { type: "object", properties: { url: { type: "string" } } }, readOnly: true, enabled: true }],
  };
  saveMcpServers([fetchServer]);
  const fetchCalls: any[] = [];
  const fetched = await createMcpAwareRequestAi(async (request: any) => {
    fetchCalls.push(request);
    return { text: "这是基于网页正文的回复" };
  })({ message: "请读取这个网页并告诉我重点：https://example.com/article", history: [], systemInstruction: "人设", apiKey: "", model: "m" });
  assert.equal(fetched.text, "这是基于网页正文的回复");
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].systemInstruction, /网页读取结果/);
  assert.match(fetchCalls[0].systemInstruction, /外部只读结果/);

  const fetchArrayServer = {
    ...fetchServer,
    id: "exa-array",
    discoveredTools: [{ name: "web_fetch_exa", description: "读取网页正文", inputSchema: { type: "object", properties: { urls: { type: "array", items: { type: "string" } } } }, readOnly: true, enabled: true }],
  };
  saveMcpServers([fetchArrayServer]);
  const fetchArrayCalls: any[] = [];
  await createMcpAwareRequestAi(async (request: any) => {
    fetchArrayCalls.push(request);
    return { text: "这是基于数组网址结果的回复" };
  })({ message: "读取 https://example.com/array", history: [], systemInstruction: "人设", apiKey: "", model: "m" });
  assert.equal(fetchArrayCalls.length, 1);
  assert.match(fetchArrayCalls[0].systemInstruction, /网页读取结果/);
  const lastToolCall = [...mcpBodies].reverse().find((body) => body.method === "tools/call");
  assert.deepEqual(lastToolCall.params.arguments, { urls: ["https://example.com/array"] });

  const historyFetched = await createMcpAwareRequestAi(async (request: any) => {
    fetchCalls.push(request);
    return { text: "这是基于历史链接的回复" };
  })({ message: "你刷到这个新闻了吗？", history: [{ role: "user", text: "https://example.com/history" }], systemInstruction: "人设", apiKey: "", model: "m" });
  assert.equal(historyFetched.text, "这是基于历史链接的回复");
  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[1].systemInstruction, /https:\/\/example\.com\/history/);
  saveMcpServers([]);
} finally { globalThis.fetch = previousFetch; }
console.log("PASS MCP chat temporary loop, deterministic webpage fetch, history URL lookup, and no-config compatibility");
