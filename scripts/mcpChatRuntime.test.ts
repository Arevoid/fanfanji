import assert from "node:assert/strict";
import { saveMcpServers } from "../src/core/storage/repositories/mcpServerRepository";
import { createMcpAwareRequestAi } from "../src/features/mcp/mcpChatRuntime";

class MemoryStorage { private readonly values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } removeItem(key: string) { this.values.delete(key); } }
const localStorage = new MemoryStorage();
const appWindow: { localStorage: MemoryStorage; confirm: () => boolean } = { localStorage, confirm: () => false };
Object.defineProperty(globalThis, "window", { configurable: true, value: appWindow });
const server = { id: "demo", name: "Demo", url: "https://mcp.example.test/mcp", enabled: true, directFetch: true, readOnlyOnly: true as const, discoveredTools: [{ name: "lookup", description: "read", inputSchema: { type: "object" }, readOnly: true, enabled: true }], connectionStatus: "connected" as const, updatedAt: Date.now() };
saveMcpServers([server]);
const previousFetch = globalThis.fetch;
const mcpBodies: any[] = [];
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body || "{}"));
  mcpBodies.push(body);
  if (String(_input).includes("failing.example.test")) throw new Error("offline MCP");
  if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "Content-Type": "application/json" } });
  if (body.method === "tools/call" && String(_input).includes("mcp.yoww2026.cn")) return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "![收到](https://cdn.example.test/received.png)" }] } }), { headers: { "Content-Type": "application/json" } });
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

  const structuredCalls: any[] = [];
  const structuredMarker = '[[MCP_TOOL_REQUEST]]{"serverId":"demo","toolName":"lookup","arguments":{"q":"澶╂皵"}}[[/MCP_TOOL_REQUEST]]';
  const structured = await createMcpAwareRequestAi(async (request: any) => {
    structuredCalls.push(request);
    return structuredCalls.length === 1
      ? { text: JSON.stringify({ reply: structuredMarker }) }
      : { text: JSON.stringify({ reply: "structured reply" }) };
  })({ message: "structured request", history: [], systemInstruction: "system", apiKey: "", model: "m" });
  assert.equal(structuredCalls.length, 2);
  assert.match(structuredCalls[1].systemInstruction, /工具结果/);
  assert.match(structured.text, /structured reply/);

  const failingServer = { ...server, id: "failing", url: "https://failing.example.test/mcp" };
  saveMcpServers([failingServer]);
  const failedToolReply = await createMcpAwareRequestAi(async () => ({
    text: '[[MCP_TOOL_REQUEST]]{"serverId":"failing","toolName":"lookup","arguments":{}}[[/MCP_TOOL_REQUEST]]',
  }))({ message: "故障回退", history: [], systemInstruction: "system", apiKey: "", model: "m" });
  assert.equal(failedToolReply.text, "外部工具暂时不可用，我无法可靠获取这次结果。");

  assert.match(calls[0].systemInstruction, /MCP 只读工具/);
  assert.match(calls[1].systemInstruction, /外部只读结果/);
  saveMcpServers([]);
  const untouched: any[] = [];
  const plain = await createMcpAwareRequestAi(async (request) => { untouched.push(request); return { text: "普通回复" }; })({ message: "普通", history: [], systemInstruction: "原始", apiKey: "", model: "m" });
  assert.equal(plain.text, "普通回复");
  assert.equal(untouched.length, 1);
  assert.equal(untouched[0].systemInstruction, "原始");

  const yowwServer = {
    ...server,
    id: "yoww-mcp",
    name: "表情包",
    url: "https://mcp.yoww2026.cn/mcp",
    discoveredTools: [{ name: "search_emojis", description: "按关键词搜索表情图片", inputSchema: { type: "object", properties: { query: { type: "string" } } }, readOnly: true, access: "read" as const, enabled: true }],
  };
  saveMcpServers([yowwServer]);
  const yowwCalls: any[] = [];
  const yowwReply = await createMcpAwareRequestAi(async (request: any) => {
    yowwCalls.push(request);
    return { text: "我的 → MCP 接口" };
  })({ message: "请调用 Yoww 表情工具搜索“收到”，把结果直接发给我。", history: [], systemInstruction: "人设", apiKey: "", model: "m" });
  assert.match(yowwReply.text, /!\[收到\]\(https:\/\/cdn\.example\.test\/received\.png\)/);
  assert.equal(yowwCalls.length, 0);
  const yowwToolCall = [...mcpBodies].reverse().find((body) => body.method === "tools/call" && body.params?.name === "search_emojis");
  assert.deepEqual(yowwToolCall.params.arguments, { query: "收到" });

  const toolBodiesBeforeOrdinaryChat = mcpBodies.length;
  await createMcpAwareRequestAi(async () => ({ text: "普通回复" }))({ message: "今天过得怎么样？", history: [], systemInstruction: "人设", apiKey: "", model: "m" });
  assert.equal(mcpBodies.length, toolBodiesBeforeOrdinaryChat);

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

  const operationServer = {
    ...server,
    id: "operation-demo",
    permissionMode: "operate" as const,
    discoveredTools: [{ name: "create_item", description: "create", inputSchema: { type: "object" }, readOnly: false, access: "operate" as const, requiresConfirmation: true, enabled: true }],
  };
  saveMcpServers([operationServer]);
  const operationCalls: any[] = [];
  const toolCallsBeforeOperation = mcpBodies.filter((body) => body.method === "tools/call").length;
  appWindow.confirm = () => false;
  const cancelled = await createMcpAwareRequestAi(async (request: any) => {
    operationCalls.push(request);
    return { text: '[[MCP_TOOL_REQUEST]]{"serverId":"operation-demo","toolName":"create_item","arguments":{"name":"x"}}[[/MCP_TOOL_REQUEST]]' };
  })({ message: "创建一个项目", history: [], systemInstruction: "操作", apiKey: "", model: "m" });
  assert.match(cancelled.text, /取消 MCP 操作/);
  assert.equal(mcpBodies.filter((body) => body.method === "tools/call").length, toolCallsBeforeOperation);

  appWindow.confirm = () => true;
  operationCalls.length = 0;
  const operated = await createMcpAwareRequestAi(async (request: any) => {
    operationCalls.push(request);
    return operationCalls.length === 2 ? { text: "已创建" } : { text: '[[MCP_TOOL_REQUEST]]{"serverId":"operation-demo","toolName":"create_item","arguments":{"name":"x"}}[[/MCP_TOOL_REQUEST]]' };
  })({ message: "创建一个项目", history: [], systemInstruction: "操作", apiKey: "", model: "m" });
  assert.equal(operated.text, "已创建");
  assert.equal(mcpBodies.filter((body) => body.method === "tools/call").length, toolCallsBeforeOperation + 1);
  saveMcpServers([]);
} finally { globalThis.fetch = previousFetch; }
console.log("PASS MCP chat temporary loop, deterministic webpage fetch, history URL lookup, and no-config compatibility");
