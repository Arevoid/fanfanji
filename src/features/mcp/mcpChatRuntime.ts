import type { ApiChatParams, ApiToolCall, ApiToolDefinition } from "../../utils/apiHelper";
import type { McpRequestScope, McpServerConfig, McpToolRequest, McpToolAccess } from "../../domain/mcp/mcpTypes";
import { loadMcpServers } from "../../core/storage/repositories/mcpServerRepository";
import { isMcpEnabledForScope, isMcpServerAllowedForScope } from "../../core/storage/repositories/mcpPolicyRepository";
import { callMcpTool, formatMcpToolResult } from "./mcpClient";

type RequestAiResult = { text: string; toolCalls?: ApiToolCall[] };
type RequestAi = (params: ApiChatParams) => Promise<RequestAiResult>;

const OPEN_MARKER = "[[MCP_TOOL_REQUEST]]";
const CLOSE_MARKER = "[[/MCP_TOOL_REQUEST]]";
const MAX_TOOL_SCHEMA_CHARS = 8_000;
const MCP_IMAGE_MARKDOWN_PATTERN = /(?:!?\[[^\]]*\]\(|\()https?:\/\/[^\s)]+/iu;
const MCP_IMAGE_TOKEN_PATTERN = /(?:!?\[[^\]]*\]\(\s*https?:\/\/mcp\.yoww2026\.cn\/i\/[^\s)]+\s*\)|\(\s*https?:\/\/mcp\.yoww2026\.cn\/i\/[^\s)]+\s*\)|https?:\/\/mcp\.yoww2026\.cn\/i\/[^\s)]+)/giu;
const DEFAULT_EMOJI_RESULT_LIMIT = 1;
const MULTI_EMOJI_REQUEST_PATTERN = /(?:\u591a\u5f20|\u51e0\u5f20|\u591a\u4e2a|\u4e00\u7ec4|\u6574\u5305|\u5168\u90e8|\u6240\u6709|\u591a\u4e9b|\u6279\u91cf|\b(?:all|pack)\b)/iu;
const MCP_INTERFACE_ECHO_PATTERN = /(?:^|[\s：:])(?:我的\s*[→>-]\s*)?MCP\s*(?:接口|工具)(?:$|[\s。.!！])/iu;
const URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’]+/giu;
const WEB_READ_INTENT_PATTERN = /(看看|查看|打开|读一下|读取|阅读|浏览|网页|文章|新闻|链接|网址|总结|概括|内容|刷到|搜到|查一下|查查|what(?:'s| is) this|read|open|fetch|summari[sz]e|article|news)/iu;

function toolAccess(tool: McpServerConfig["discoveredTools"][number]): McpToolAccess {
  return tool.access || (tool.readOnly ? "read" : "unknown");
}
function isToolAvailable(server: McpServerConfig, tool: McpServerConfig["discoveredTools"][number]): boolean {
  const access = toolAccess(tool);
  return tool.enabled && (access === "read" || (server.permissionMode === "operate" && access === "operate"));
}
function normalizeUrl(raw: string): string {
  return raw.replace(/[，。！？；：、）》】\]}>'"”’]+$/u, "");
}
function extractUrls(text: unknown): string[] {
  return typeof text === "string" ? [...text.matchAll(URL_PATTERN)].map((m) => normalizeUrl(m[0])).filter(Boolean) : [];
}
function resolveUrlReadIntent(request: ApiChatParams): { url: string } | null {
  const urls = extractUrls(request.message || "");
  if (urls.length && (request.message.trim() === urls[0] || WEB_READ_INTENT_PATTERN.test(request.message))) return { url: urls[0] };
  if (!WEB_READ_INTENT_PATTERN.test(request.message || "")) return null;
  const history = Array.isArray(request.history) ? request.history : [];
  for (let i = history.length - 1; i >= 0 && i >= history.length - 8; i -= 1) {
    const item = history[i];
    if (item && typeof item === "object" && String((item as any).role || "").toLowerCase() === "user") {
      const found = extractUrls((item as any).text || (item as any).content);
      if (found.length) return { url: found[0] };
    }
  }
  return null;
}
function scopedServers(scope?: McpRequestScope): McpServerConfig[] {
  if (!isMcpEnabledForScope(scope)) return [];
  return loadMcpServers().filter((server) =>
    isMcpServerAllowedForScope(server.id, scope)
    && server.enabled
    && server.connectionStatus === "connected"
    && server.discoveredTools.some((tool) => isToolAvailable(server, tool)));
}
function buildToolInstruction(servers: McpServerConfig[]): string {
  const tools = servers.flatMap((server) => server.discoveredTools.filter((tool) => isToolAvailable(server, tool)).map((tool) => ({ serverId: server.id, serverName: server.name, access: toolAccess(tool), ...tool })));
  if (!tools.length) return "";
  const descriptions = tools.map((tool) => JSON.stringify({ serverId: tool.serverId, server: tool.serverName, name: tool.name, description: tool.description || "", inputSchema: tool.inputSchema || {} })).join("\n").slice(0, MAX_TOOL_SCHEMA_CHARS);
  return "\n\n[MCP 只读工具（本轮临时调用）]\n需要外部信息时输出严格 JSON：" + OPEN_MARKER + "{\"serverId\":\"...\",\"toolName\":\"...\",\"arguments\":{}}" + CLOSE_MARKER + "。不需要工具时正常回答。可用工具：\n" + descriptions;
}
function buildNativeTools(servers: McpServerConfig[]): ApiToolDefinition[] {
  return servers.flatMap((server) => server.discoveredTools.filter((tool) => isToolAvailable(server, tool)).map((tool) => ({
    type: "function" as const,
    function: { name: server.id + "__" + tool.name, description: server.name + ": " + (tool.description || tool.name), parameters: tool.inputSchema || { type: "object", properties: {} } },
  })));
}
function resolveNativeToolCall(call: ApiToolCall, servers: McpServerConfig[]) {
  const separator = call.name.indexOf("__");
  const serverId = separator > 0 ? call.name.slice(0, separator) : "";
  const toolName = separator > 0 ? call.name.slice(separator + 2) : call.name;
  const server = servers.find((item) => item.id === serverId) || servers.find((item) => item.discoveredTools.some((tool) => tool.name === toolName));
  const tool = server?.discoveredTools.find((item) => item.name === toolName);
  return server && tool ? { server, tool, arguments: call.arguments || {} } : null;
}
function extractQuotedSearchTerm(message: string): string | undefined {
  return message.match(/[“"「『]([^”"」』]{1,80})[”"」』]/u)?.[1]?.trim() || undefined;
}
function limitEmojiMediaResult(formatted: string, limit: number): string {
  const seenUrls = new Set<string>();
  let emitted = 0;
  MCP_IMAGE_TOKEN_PATTERN.lastIndex = 0;
  const limited = formatted.replace(MCP_IMAGE_TOKEN_PATTERN, (token) => {
    const url = token.match(/https?:\/\/mcp\.yoww2026\.cn\/i\/[^\s)]+/iu)?.[0] || token;
    if (seenUrls.has(url) || emitted >= limit) return "";
    seenUrls.add(url);
    emitted += 1;
    return token;
  });
  return limited.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}
function containsMcpMedia(value: string): boolean {
  MCP_IMAGE_TOKEN_PATTERN.lastIndex = 0;
  return MCP_IMAGE_TOKEN_PATTERN.test(value);
}
function resolveEmojiResultLimit(message: string): number {
  return MULTI_EMOJI_REQUEST_PATTERN.test(message) ? 3 : DEFAULT_EMOJI_RESULT_LIMIT;
}
function findEmojiSearchIntent(message: string, servers: McpServerConfig[]) {
  if (!/(yoww|表情|表情包|emoji|sticker)/iu.test(message) || !/(调用|使用|搜索|查找|找|发|发送|挑|选|直接)/iu.test(message)) return null;
  const server = servers.find((candidate) => /yoww|表情/iu.test(candidate.id + " " + candidate.name + " " + candidate.url)) || servers.find((candidate) => candidate.discoveredTools.some((tool) => tool.name === "search_emojis"));
  const tool = server?.discoveredTools.find((candidate) => candidate.name === "search_emojis") || server?.discoveredTools.find((candidate) => /emoji|表情/iu.test(candidate.name + " " + (candidate.description || "")));
  if (!server || !tool || toolAccess(tool) !== "read" || !isToolAvailable(server, tool)) return null;
  const query = extractQuotedSearchTerm(message) || (/(收到|谢谢|感谢)/u.test(message) ? "收到" : "表情");
  const properties = tool.inputSchema?.properties;
  const queryKey = properties && typeof properties === "object" && !Array.isArray(properties)
    ? Object.keys(properties).find((key) => /^(?:query|q|keyword|search|term)$/iu.test(key)) || Object.keys(properties).find((key) => /query|keyword|search|term/iu.test(key))
    : undefined;
  return { server, tool, arguments: { [queryKey || "query"]: query } };
}
function markerTextCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = [text, trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim()];
  for (const candidate of [...candidates]) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const queue: unknown[] = [parsed];
      while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== "object" || Array.isArray(current)) continue;
        for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
          if (typeof value === "string" && ["reply", "text", "content", "message", "response", "result", "output"].includes(key)) candidates.push(value);
          else if (value && typeof value === "object" && !Array.isArray(value)) queue.push(value);
        }
      }
    } catch { /* plain text */ }
  }
  return [...new Set(candidates)];
}
function parseToolRequest(text: string): McpToolRequest | null {
  for (const candidate of markerTextCandidates(text)) {
    for (const decoded of [candidate, candidate.replaceAll('\\"', '"')]) {
      const start = decoded.indexOf(OPEN_MARKER);
      const end = start < 0 ? -1 : decoded.indexOf(CLOSE_MARKER, start + OPEN_MARKER.length);
      if (start < 0 || end < 0) continue;
      try {
        const parsed = JSON.parse(decoded.slice(start + OPEN_MARKER.length, end).trim());
        if (typeof parsed.serverId === "string" && typeof parsed.toolName === "string") return { serverId: parsed.serverId, toolName: parsed.toolName, arguments: parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments) ? parsed.arguments : {} };
      } catch { /* try another envelope */ }
    }
  }
  return null;
}
function withInstruction(request: ApiChatParams, addition: string): ApiChatParams {
  return { ...request, systemInstruction: [request.systemInstruction, addition].filter(Boolean).join("\n\n") };
}
function confirmOperation(server: McpServerConfig, tool: McpServerConfig["discoveredTools"][number], request: McpToolRequest): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false;
  return window.confirm("即将执行 MCP 操作\n\n服务：" + server.name + "\n工具：" + tool.name + "\n参数：\n" + JSON.stringify(request.arguments || {}, null, 2).slice(0, 2000) + "\n\n确认后才会向外部服务发送请求。");
}
function shouldUseRawToolResult(reply: string, formatted: string): boolean {
  return !reply.trim() || parseToolRequest(reply) !== null || MCP_INTERFACE_ECHO_PATTERN.test(reply) || (MCP_IMAGE_MARKDOWN_PATTERN.test(formatted) && !MCP_IMAGE_MARKDOWN_PATTERN.test(reply));
}
export function createMcpAwareRequestAi(base: RequestAi, scope?: McpRequestScope): RequestAi {
  return async (request) => {
    const servers = scopedServers(scope);
    const emoji = findEmojiSearchIntent(request.message || "", servers);
    const operationTools = servers.some((server) => server.permissionMode === "operate" && server.discoveredTools.some((tool) => isToolAvailable(server, tool) && toolAccess(tool) === "operate"));
    const instruction = buildToolInstruction(servers) + (operationTools ? "\n\n[操作权限]\n操作工具必须先等待用户确认。" : "");
    if (!instruction) return base(request);
    const urlIntent = resolveUrlReadIntent(request);
    if (urlIntent) {
      const fetchTool = servers.flatMap((server) => server.discoveredTools.filter((tool) => isToolAvailable(server, tool) && toolAccess(tool) === "read").map((tool) => ({ server, tool }))).find(({ tool }) => tool.name.toLowerCase() === "web_fetch_exa" || /fetch|read|open/iu.test(tool.name));
      if (fetchTool) {
        try {
          const properties = fetchTool.tool.inputSchema?.properties;
          const urlKey = properties && typeof properties === "object" && !Array.isArray(properties) ? Object.keys(properties).find((key) => /url|link|uri|page/iu.test(key)) : undefined;
          const descriptor = urlKey && properties && typeof properties[urlKey] === "object" ? properties[urlKey] as { type?: unknown } : undefined;
          const toolArguments = { [urlKey || "url"]: descriptor?.type === "array" ? [urlIntent.url] : urlIntent.url };
          const result = await callMcpTool(fetchTool.server, { serverId: fetchTool.server.id, toolName: fetchTool.tool.name, arguments: toolArguments }, request.signal);
          return base(withInstruction(request, instruction + "\n\n[网页读取结果]\nURL: " + urlIntent.url + "\n" + formatMcpToolResult(result) + "\n请基于结果回答，不要输出 MCP 标记。"));
        } catch { return base(withInstruction(request, instruction + "\n\n本轮网页读取失败，请如实说明。")); }
      }
    }
    if (emoji) {
      try {
        const result = await callMcpTool(emoji.server, { serverId: emoji.server.id, toolName: emoji.tool.name, arguments: emoji.arguments }, request.signal);
        const formatted = formatMcpToolResult(result);
        const limitedFormatted = limitEmojiMediaResult(formatted, resolveEmojiResultLimit(request.message || ""));
        if (containsMcpMedia(limitedFormatted) || MCP_IMAGE_MARKDOWN_PATTERN.test(limitedFormatted)) return { text: limitedFormatted };
        const composed = await base(withInstruction(request, instruction + "\n\n[Yoww result]\n" + formatted + "\n请保留图片结果，不要再次调用工具。"));
        return shouldUseRawToolResult(composed.text, formatted) ? { text: formatted } : composed;
      } catch { return { text: "Yoww 表情工具暂时不可用，请稍后重试。" }; }
    }
    const nativeTools = buildNativeTools(servers);
    const first = await base({ ...withInstruction(request, instruction), ...(nativeTools.length ? { tools: nativeTools } : {}) });
    if (first.toolCalls?.length) {
      const contexts: string[] = [];
      for (const call of first.toolCalls.slice(0, 3)) {
        const resolved = resolveNativeToolCall(call, servers);
        if (!resolved) { contexts.push("Unknown MCP tool: " + call.name); continue; }
        const access = toolAccess(resolved.tool);
        if (access === "operate" && !confirmOperation(resolved.server, resolved.tool, { serverId: resolved.server.id, toolName: resolved.tool.name, arguments: resolved.arguments })) { contexts.push("Operation cancelled: " + resolved.tool.name); continue; }
        try {
          const result = await callMcpTool(resolved.server, { serverId: resolved.server.id, toolName: resolved.tool.name, arguments: resolved.arguments, confirmed: access === "operate" }, request.signal);
          contexts.push("Tool " + resolved.tool.name + " result:\n" + formatMcpToolResult(result));
        } catch { contexts.push("Tool " + resolved.tool.name + " failed; external data was unavailable."); }
      }
      return base(withInstruction({ ...request, tools: undefined }, instruction + "\n\n[Native MCP tool results]\n" + contexts.join("\n\n") + "\nAnswer from these results. Do not call tools again or output MCP markers."));
    }
    const toolRequest = parseToolRequest(first.text);
    if (!toolRequest) return first;
    const server = servers.find((item) => item.id === toolRequest.serverId);
    const tool = server?.discoveredTools.find((item) => item.name === toolRequest.toolName);
    const access = tool ? toolAccess(tool) : "unknown";
    if (!server || !tool || !isToolAvailable(server, tool)) return { text: "该 MCP 工具未被启用，请先在 MCP 设置中选择权限并开启对应工具。" };
    if (access === "operate" && !confirmOperation(server, tool, toolRequest)) return { text: "已取消 MCP 操作，未向外部服务发送请求。" };
    try {
      const result = await callMcpTool(server, { ...toolRequest, confirmed: access === "operate" }, request.signal);
      const second = await base(withInstruction(request, instruction + "\n\n[本轮 MCP 工具结果]\n" + formatMcpToolResult(result) + "\n请基于该结果直接回答，不要再次调用工具。"));
      return parseToolRequest(second.text) ? { text: "工具查询已完成，请根据已获得的信息直接回答。" } : second;
    } catch {
      const fallback = await base(withInstruction(request, instruction + "\n\n本轮工具调用失败，请如实说明无法获取外部信息。"));
      return parseToolRequest(fallback.text) ? { text: "外部工具暂时不可用，我无法可靠获取这次结果。" } : fallback;
    }
  };
}
