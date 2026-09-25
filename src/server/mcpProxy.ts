const LOOPBACK_HOST = /^(?:localhost|localhost\.localdomain|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\])$/iu;
const PRIVATE_HOST = /^(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})$/iu;

export class McpProxyError extends Error {
  constructor(message: string, readonly status: 400 | 502) {
    super(message);
    this.name = "McpProxyError";
  }
}

export function validateMcpProxyUrl(value: unknown): URL {
  if (typeof value !== "string" || !value.trim()) throw new Error("MCP 地址不能为空。");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("MCP 地址无效。"); }
  const runtimeMode = typeof process !== "undefined" ? process.env.NODE_ENV : "production";
  const localDev = runtimeMode !== "production" && LOOPBACK_HOST.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localDev)) throw new Error("代理仅允许 HTTPS；HTTP 只可用于本机开发地址。");
  if (url.username || url.password || PRIVATE_HOST.test(url.hostname) || (LOOPBACK_HOST.test(url.hostname) && !localDev)) throw new Error("MCP 地址指向了不允许的主机。");
  return url;
}

export async function proxyMcpRequest(input: { url: unknown; body: unknown; headers?: unknown }): Promise<Response> {
  const target = validateMcpProxyUrl(input.url);
  const incoming = input.headers && typeof input.headers === "object" ? input.headers as Record<string, unknown> : {};
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  for (const key of ["authorization", "mcp-session-id"]) {
    // JSON-serialized Fetch headers can arrive with any casing (for example
    // `Mcp-Session-Id`). Resolve them case-insensitively so streamable HTTP
    // sessions survive the same-origin proxy hop.
    const matchingKey = Object.keys(incoming).find((candidate) => candidate.toLowerCase() === key);
    const value = matchingKey ? incoming[matchingKey] : undefined;
    if (typeof value === "string" && value.length <= 2048) headers[key] = value;
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, { method: "POST", headers, body: JSON.stringify(input.body) });
  } catch {
    throw new McpProxyError("MCP 上游连接失败，请检查服务地址或网络。", 502);
  }
  const text = await upstream.text();
  if (text.length > 1_500_000) return Response.json({ error: "MCP 响应过大。" }, { status: 502 });
  const responseHeaders = new Headers({ "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
  const sessionId = upstream.headers.get("mcp-session-id");
  if (sessionId) responseHeaders.set("Mcp-Session-Id", sessionId);
  return new Response(text, { status: upstream.status, headers: responseHeaders });
}
