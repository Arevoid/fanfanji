import assert from "node:assert/strict";
import { saveMcpServers } from "../src/core/storage/repositories/mcpServerRepository";
import { createMcpAwareRequestAi } from "../src/features/mcp/mcpChatRuntime";

class MemoryStorage { private readonly values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); } }
const localStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
const server = { id: "demo", name: "Demo", url: "https://mcp.example.test/mcp", enabled: true, directFetch: true, readOnlyOnly: true as const, discoveredTools: [{ name: "lookup", description: "read", inputSchema: { type: "object" }, readOnly: true, enabled: true }], updatedAt: Date.now() };
saveMcpServers([server]);
const previousFetch = globalThis.fetch;
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body || "{}"));
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
} finally { globalThis.fetch = previousFetch; }
console.log("PASS MCP chat temporary loop, bounded second call, and no-config compatibility");
