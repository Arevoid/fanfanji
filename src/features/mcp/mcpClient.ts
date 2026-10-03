import type { McpDiscoveredTool, McpServerConfig, McpToolAccess, McpToolRequest, McpToolResult } from "../../domain/mcp/mcpTypes";

const MCP_PROTOCOL_VERSION = "2025-03-26";
const MAX_RESULT_CHARS = 12_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const MCP_REQUEST_TIMEOUT_MS = 15_000;
const sessionTokens = new Map<string, string>();
const mcpSessions = new Map<string, string>();
const sessionHeaders = new Map<string, Record<string, string>>();

/** Tokens are intentionally memory-only and are never written to localStorage. */
export function setMcpSessionToken(serverId: string, token: string): void {
  const normalized = token.trim();
  if (normalized) sessionTokens.set(serverId, normalized);
  else sessionTokens.delete(serverId);
  // A token change must not reuse a session authenticated with the old token.
  mcpSessions.delete(serverId);
}

/** Custom auth headers are kept in memory for the same reason as tokens. */
export function setMcpSessionHeaders(serverId: string, headers: Record<string, string> | undefined): void {
  const safe = Object.fromEntries(Object.entries(headers || {})
    .filter(([key, value]) => /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}$/u.test(key) && typeof value === "string" && value.length <= 2_048)
    .filter(([key]) => !/^(?:host|content-length|content-type|cookie|origin|referer)$/iu.test(key))
    .slice(0, 32)
    .map(([key, value]) => [key, value.trim()]));
  if (Object.keys(safe).length > 0) sessionHeaders.set(serverId, safe);
  else sessionHeaders.delete(serverId);
  mcpSessions.delete(serverId);
}

function applySessionHeaders(serverId: string | undefined, headers: Record<string, string>): Record<string, string> {
  if (!serverId) return headers;
  return { ...headers, ...(sessionHeaders.get(serverId) || {}) };
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
  const finalHeaders = applySessionHeaders(options.serverId, headers);
  const target = options.directFetch ? url.toString() : "/api/mcp-proxy";
  const requestBody = options.directFetch ? body : { url: url.toString(), body, headers: finalHeaders };
  const response = await fetch(target, { method: "POST", headers: options.directFetch ? finalHeaders : { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: options.signal });
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
  const finalHeaders = applySessionHeaders(server.id, headers);
  const target = server.directFetch ? url.toString() : "/api/mcp-proxy";
  const requestBody = server.directFetch ? { jsonrpc: "2.0", method, params } : { url: url.toString(), body: { jsonrpc: "2.0", method, params }, headers: finalHeaders };
  await fetch(target, { method: "POST", headers: server.directFetch ? finalHeaders : { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal });
}

async function initialize(server: McpServerConfig, signal?: AbortSignal): Promise<{ sessionId?: string }> {
  const result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "fanfanji", version: "1.0" } } }, { directFetch: server.directFetch, serverId: server.id, signal });
  await sendNotification(server, "notifications/initialized", {}, result.sessionId, signal).catch(() => undefined);
  if (result.sessionId) mcpSessions.set(server.id, result.sessionId);
  return { sessionId: result.sessionId };
}

async function ensureSession(server: McpServerConfig, signal?: AbortSignal): Promise<{ sessionId?: string }> {
  const sessionId = mcpSessions.get(server.id);
  return sessionId ? { sessionId } : initialize(server, signal);
}

function requestSignal(signal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("MCP 请求超时。")), MCP_REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) forwardAbort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", forwardAbort);
    },
  };
}

export async function discoverMcpTools(server: McpServerConfig, signal?: AbortSignal): Promise<McpDiscoveredTool[]> {
  if (!server.enabled) throw new Error("MCP 服务已停用。");
  const timed = requestSignal(signal);
  try {
    const session = await initialize(server, timed.signal);
    const result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { directFetch: server.directFetch, serverId: server.id, sessionId: session.sessionId, signal: timed.signal });
    const rawTools = (result.payload.result as Record<string, unknown> | undefined)?.tools;
    if (!Array.isArray(rawTools)) return [];
    return rawTools.slice(0, 100).flatMap((tool): McpDiscoveredTool[] => {
      if (!tool || typeof tool !== "object" || Array.isArray(tool)) return [];
      const item = tool as Record<string, unknown>;
      if (typeof item.name !== "string" || !item.name.trim()) return [];
      // MCP has no universal read/write flag. Servers may opt in using the
      // conventional annotations.readOnlyHint; unknown tools stay disabled.
      const annotations = item.annotations && typeof item.annotations === "object" ? item.annotations as Record<string, unknown> : {};
      const toolName = item.name.trim();
      const locallyTrustedReadOnly = server.readOnlyToolAllowlist?.includes(toolName) === true;
      const readOnly = locallyTrustedReadOnly || annotations.readOnlyHint === true || annotations.readOnly === true;
      const operation = annotations.readOnlyHint === false || annotations.readOnly === false;
      const access: McpToolAccess = readOnly ? "read" : operation ? "operate" : "unknown";
      return [{ name: toolName, description: typeof item.description === "string" ? item.description.slice(0, 1000) : undefined, inputSchema: item.inputSchema && typeof item.inputSchema === "object" ? item.inputSchema as Record<string, unknown> : undefined, readOnly, access, requiresConfirmation: access !== "read", enabled: access === "read" }];
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("MCP 连接超时（15 秒）。");
    throw error;
  } finally {
    timed.dispose();
  }
}

export async function callMcpTool(server: McpServerConfig, request: McpToolRequest, signal?: AbortSignal): Promise<McpToolResult> {
  if (server.connectionStatus !== "connected") throw new Error("该 MCP 尚未通过实时连接验证，请先重新发现工具。");
  const tool = server.discoveredTools.find((item) => item.name === request.toolName);
  const access = tool?.access || (tool?.readOnly ? "read" : "unknown");
  const canRead = Boolean(tool?.enabled && access === "read");
  const canOperate = Boolean(tool?.enabled && access === "operate" && server.permissionMode === "operate" && request.confirmed === true);
  if (!tool || (!canRead && !canOperate)) throw new Error("MCP tool is not authorized: check the server mode, tool toggle, and confirmation");
  const timed = requestSignal(signal);
  let result: { payload: Record<string, unknown>; sessionId?: string };
  try {
    let session = await ensureSession(server, timed.signal);
    try {
      result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: request.toolName, arguments: request.arguments || {} } }, { directFetch: server.directFetch, serverId: server.id, sessionId: session.sessionId, signal: timed.signal });
    } catch (error) {
      // Streamable HTTP sessions can expire server-side. Re-initialize once,
      // then retry the same authorized call with the fresh session.
      // Never replay an operation automatically: the first request may have
      // reached the server even if its response was lost.
      if (!session.sessionId || access !== "read") throw error;
      mcpSessions.delete(server.id);
      session = await initialize(server, timed.signal);
      result = await fetchResponse(assertUrl(server.url), { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: request.toolName, arguments: request.arguments || {} } }, { directFetch: server.directFetch, serverId: server.id, sessionId: session.sessionId, signal: timed.signal });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("MCP 调用超时（15 秒）。");
    throw error;
  } finally {
    timed.dispose();
  }
  const raw = (result.payload.result || {}) as Record<string, unknown>;
  const content = Array.isArray(raw.content) ? raw.content.slice(0, 100).flatMap((entry): McpToolResult["content"] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [{ type: typeof item.type === "string" ? item.type : "text", text: typeof item.text === "string" ? item.text.slice(0, MAX_RESULT_CHARS) : undefined, data: typeof item.data === "string" ? item.data.slice(0, 2000) : undefined, mimeType: typeof item.mimeType === "string" ? item.mimeType : undefined, uri: typeof item.uri === "string" ? item.uri.slice(0, 4_000) : undefined, resource: item.resource }];
  }) : [];
  return { isError: raw.isError === true, content, structuredContent: raw.structuredContent };
}

export function formatMcpToolResult(result: McpToolResult): string {
  const text = result.content.map((entry) => {
    if (entry.text) return entry.text;
    if (entry.type === "image" && entry.data && entry.mimeType) return `![MCP image](data:${entry.mimeType};base64,${entry.data})`;
    if ((entry.type === "image" || entry.type === "resource") && entry.uri && /^https?:\/\//iu.test(entry.uri)) return `![MCP image](${entry.uri})`;
    if (entry.data) return `[${entry.mimeType || "binary"} data omitted]`;
    return "";
  }).filter(Boolean).join("\n").slice(0, MAX_RESULT_CHARS);
  return result.isError ? `工具返回错误：${text || "未知错误"}` : text || JSON.stringify(result.structuredContent ?? "（工具未返回文本）");
}
