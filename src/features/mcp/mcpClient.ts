import type { McpDiscoveredTool, McpServerConfig, McpToolRequest, McpToolResult } from "../../domain/mcp/mcpTypes";

const MCP_PROTOCOL_VERSION = "2025-03-26";
const MAX_RESULT_CHARS = 12_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const sessionTokens = new Map<string, string>();

/** Tokens are intentionally memory-only and are never written to localStorage. */
export function setMcpSessionToken(serverId: string, token: string): void {
  const normalized = token.trim();
  if (normalized) sessionTokens.set(serverId, normalized);
  else sessionTokens.delete(serverId);
}

function assertUrl(urlText: string): URL {
  let url: URL;
  try { url = new URL(urlText); } catch { throw new Error("MCP 地址无效。"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("MCP 只允许 HTTP(S) 地址。");
  return url;
}

function parseJsonRpc(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("MCP 服务返回了空响应。");
  if (trimmed.startsWith("data:") || trimmed.includes("\ndata:")) {
    const dataLines = trimmed.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
    const last = dataLines[dataLines.length - 1];
    if (last === "[DONE]") throw new Error("MCP 服务未返回 JSON-RPC 响应。");
    return JSON.parse(last) as Record<string, unknown>;
  }
  return JSON.parse(trimmed) as Record<string, unknown>;
}

async function fetchResponse(url: URL, body: unknown, options: { directFetch: boolean; serverId?: string; sessionId?: string; signal?: AbortSignal }): Promise<{ payload: Record<string, unknown>; sessionId?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (options.sessionId) headers["Mcp-Session-Id"] = options.sessionId;
  if (options.serverId && sessionTokens.has(options.serverId)) headers.Authorization = `Bearer ${sessionTokens.get(options.serverId)}`;
  const target = options.directFetch ? url.toString() : "/api/mcp-proxy";
  const requestBody = options.directFetch ? body : { url: url.toString(), body, headers };
  const response = await fetch(target, { method: "POST", headers: options.directFetch ? headers : { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: options.signal });
  const raw = await response.text();
  if (raw.length > MAX_RESPONSE_BYTES) throw new Error("MCP 返回内容过大，已拒绝读取。");
  if (!response.ok) throw new Error(`MCP 请求失败（${response.status}）：${raw.slice(0, 240)}`);
  const payload = parseJsonRpc(raw);
  if (payload.error && typeof payload.error === "object") {
    const error = payload.error as Record<string, unknown>;
    throw new Error(`MCP 错误 ${String(error.code ?? "unknown")}：${String(error.message ?? "请求失败")}`);
  }
  const sessionId = response.headers.get("Mcp-Session-Id") || response.headers.get("mcp-session-id") || undefined;
  return { payload, sessionId };
}

async function sendNotification(server: McpServerConfig, method: string, params: Record<string, unknown>, sessionId: string | undefined, signal?: AbortSignal): Promise<void> {
  const url = assertUrl(server.url);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  if (sessionTokens.has(server.id)) headers.Authorization = `Bearer ${sessionTokens.get(server.id)}`;
  const target = server.directFetch ? url.toString() : "/api/mcp-proxy";
  const requestBody = server.directFetch ? { jsonrpc: "2.0", method, params } : { url: url.toString(), body: { jsonrpc: "2.0", method, params }, headers };
  await fetch(target, { method: "POST", headers: server.directFetch ? headers : { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal });
}

async function initialize(server: McpServerConfig, signal?: AbortSignal): Promise<{ sessionId?: string }> {
  const result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "fanfanji", version: "1.0" } } }, { directFetch: server.directFetch, serverId: server.id, signal });
  await sendNotification(server, "notifications/initialized", {}, result.sessionId, signal).catch(() => undefined);
  return { sessionId: result.sessionId };
}

export async function discoverMcpTools(server: McpServerConfig, signal?: AbortSignal): Promise<McpDiscoveredTool[]> {
  if (!server.enabled) throw new Error("MCP 服务已停用。");
  const session = await initialize(server, signal);
  const result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { directFetch: server.directFetch, serverId: server.id, sessionId: session.sessionId, signal });
  const rawTools = (result.payload.result as Record<string, unknown> | undefined)?.tools;
  if (!Array.isArray(rawTools)) return [];
  return rawTools.slice(0, 100).flatMap((tool): McpDiscoveredTool[] => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return [];
    const item = tool as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim()) return [];
    // MCP has no universal read-only flag. Servers may opt in using the
    // conventional annotations.readOnlyHint; unknown tools stay disabled.
    const annotations = item.annotations && typeof item.annotations === "object" ? item.annotations as Record<string, unknown> : {};
    const readOnly = annotations.readOnlyHint === true || annotations.readOnly === true;
    return [{ name: item.name.trim(), description: typeof item.description === "string" ? item.description.slice(0, 1000) : undefined, inputSchema: item.inputSchema && typeof item.inputSchema === "object" ? item.inputSchema as Record<string, unknown> : undefined, readOnly, enabled: readOnly }];
  });
}

export async function callMcpTool(server: McpServerConfig, request: McpToolRequest, signal?: AbortSignal): Promise<McpToolResult> {
  const tool = server.discoveredTools.find((item) => item.name === request.toolName && item.enabled && item.readOnly);
  if (!tool) throw new Error("该 MCP 工具未被允许（仅支持已确认的只读工具）。");
  const session = await initialize(server, signal);
  const result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: request.toolName, arguments: request.arguments || {} } }, { directFetch: server.directFetch, serverId: server.id, sessionId: session.sessionId, signal });
  const raw = (result.payload.result || {}) as Record<string, unknown>;
  const content = Array.isArray(raw.content) ? raw.content.slice(0, 100).flatMap((entry): McpToolResult["content"] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [{ type: typeof item.type === "string" ? item.type : "text", text: typeof item.text === "string" ? item.text.slice(0, MAX_RESULT_CHARS) : undefined, data: typeof item.data === "string" ? item.data.slice(0, 2000) : undefined, mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined }];
  }) : [];
  return { isError: raw.isError === true, content, structuredContent: raw.structuredContent };
}

export function formatMcpToolResult(result: McpToolResult): string {
  const text = result.content.map((entry) => entry.text || (entry.data ? `[${entry.mimeType || "binary"} data omitted]` : "")).filter(Boolean).join("\n").slice(0, MAX_RESULT_CHARS);
  return result.isError ? `工具返回错误：${text || "未知错误"}` : text || JSON.stringify(result.structuredContent ?? "（工具未返回文本）");
}
