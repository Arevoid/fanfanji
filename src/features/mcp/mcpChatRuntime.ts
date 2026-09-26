import type { ApiChatParams } from "../../utils/apiHelper";
import type { McpRequestScope, McpServerConfig, McpToolRequest } from "../../domain/mcp/mcpTypes";
import { loadMcpServers } from "../../core/storage/repositories/mcpServerRepository";
import { callMcpTool, formatMcpToolResult } from "./mcpClient";

type RequestAi = (params: ApiChatParams) => Promise<{ text: string }>;

const OPEN_MARKER = "[[MCP_TOOL_REQUEST]]";
const CLOSE_MARKER = "[[/MCP_TOOL_REQUEST]]";
const MAX_TOOL_SCHEMA_CHARS = 8_000;
const URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’]+/giu;
const WEB_READ_INTENT_PATTERN = /(看看|查看|打开|读一下|读取|阅读|浏览|网页|文章|新闻|链接|网址|总结|概括|内容|刷到|搜到|查一下|查查|what(?:'s| is) this|read|open|fetch|summari[sz]e|article|news)/iu;

type UrlReadIntent = {
  url: string;
  source: "message" | "history";
};

function normalizeUrl(raw: string): string {
  return raw.replace(/[，。！？；：、）》】\]}>'"”’]+$/u, "");
}

function extractUrls(text: unknown): string[] {
  if (typeof text !== "string") return [];
  return [...text.matchAll(URL_PATTERN)].map((match) => normalizeUrl(match[0])).filter(Boolean);
}

function resolveUrlReadIntent(request: ApiChatParams): UrlReadIntent | null {
  const message = request.message || "";
  const messageUrls = extractUrls(message);
  if (messageUrls.length > 0 && (message.trim() === messageUrls[0] || WEB_READ_INTENT_PATTERN.test(message))) {
    return { url: messageUrls[0], source: "message" };
  }

  // A common flow is: send a URL first, then ask "你看到了吗？" in the next
  // turn. Keep the lookup request-local by considering only recent user turns.
  if (WEB_READ_INTENT_PATTERN.test(message)) {
    const history = Array.isArray(request.history) ? request.history : [];
    for (let index = history.length - 1; index >= 0 && index >= history.length - 8; index -= 1) {
      const entry = history[index];
      if (!entry || typeof entry !== "object") continue;
      if (String((entry as { role?: unknown }).role || "").toLowerCase() !== "user") continue;
      const urls = extractUrls((entry as { text?: unknown }).text);
      if (urls.length > 0) return { url: urls[0], source: "history" };
    }
  }
  return null;
}

function findWebFetchTool(servers: McpServerConfig[]): { server: McpServerConfig; tool: McpServerConfig["discoveredTools"][number] } | null {
  const tools = servers.flatMap((server) => server.discoveredTools.filter((tool) => tool.enabled && tool.readOnly).map((tool) => ({ server, tool })));
  const preferred = tools.find(({ tool }) => tool.name.toLowerCase() === "web_fetch_exa");
  return preferred || tools.find(({ tool }) => /(?:fetch|read|open)/iu.test(tool.name)) || null;
}

function buildUrlToolArguments(tool: McpServerConfig["discoveredTools"][number], url: string): Record<string, unknown> {
  const properties = tool.inputSchema?.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    const urlProperty = Object.keys(properties).find((key) => /url|link|uri|page/i.test(key));
    if (urlProperty) {
      const descriptor = properties[urlProperty];
      const type = descriptor && typeof descriptor === "object" && !Array.isArray(descriptor)
        ? (descriptor as { type?: unknown }).type
        : undefined;
      return { [urlProperty]: type === "array" ? [url] : url };
    }
  }
  return { url };
}

function scopedServers(scope?: McpRequestScope): McpServerConfig[] {
  // Scope is intentionally accepted now so future server policies can be
  // identity-bound without changing the chat controller contract.
  void scope;
  return loadMcpServers().filter((server) => server.enabled && server.connectionStatus === "connected" && server.discoveredTools.some((tool) => tool.enabled && tool.readOnly));
}

function buildToolInstruction(servers: McpServerConfig[]): string {
  const tools = servers.flatMap((server) => server.discoveredTools.filter((tool) => tool.enabled && tool.readOnly).map((tool) => ({ serverId: server.id, serverName: server.name, ...tool })));
  if (tools.length === 0) return "";
  const descriptions = tools.map((tool) => JSON.stringify({ serverId: tool.serverId, server: tool.serverName, name: tool.name, description: tool.description || "", inputSchema: tool.inputSchema || {} })).join("\n").slice(0, MAX_TOOL_SCHEMA_CHARS);
  return `\n\n[MCP 只读工具（本轮临时调用）]\n你可以在确实需要外部只读信息时调用工具。不要猜测工具结果，也不要修改外部数据。需要调用时，只输出一段严格 JSON：${OPEN_MARKER}{"serverId":"...","toolName":"...","arguments":{}}${CLOSE_MARKER}。不需要工具时正常回答，绝不要向用户展示上述标记。可用工具：\n${descriptions}`;
}

function parseToolRequest(text: string): McpToolRequest | null {
  const start = text.indexOf(OPEN_MARKER);
  if (start < 0) return null;
  const end = text.indexOf(CLOSE_MARKER, start + OPEN_MARKER.length);
  if (end < 0) return null;
  try {
    const parsed = JSON.parse(text.slice(start + OPEN_MARKER.length, end).trim()) as Record<string, unknown>;
    if (typeof parsed.serverId !== "string" || typeof parsed.toolName !== "string") return null;
    return { serverId: parsed.serverId, toolName: parsed.toolName, arguments: parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments) ? parsed.arguments as Record<string, unknown> : {} };
  } catch {
    return null;
  }
}

function withInstruction(request: ApiChatParams, addition: string): ApiChatParams {
  return { ...request, systemInstruction: [request.systemInstruction, addition].filter(Boolean).join("\n\n") };
}

/**
 * Provider-neutral, request-local MCP loop. The current text adapters do not
 * expose native tool calls, so the model emits a bounded marker, the browser
 * executes one read-only MCP call, then the same turn is completed with the
 * result. Nothing is persisted or sent to memory extraction.
 */
export function createMcpAwareRequestAi(base: RequestAi, scope?: McpRequestScope): RequestAi {
  return async (request) => {
    const servers = scopedServers(scope);
    const instruction = buildToolInstruction(servers);
    if (!instruction) return base(request);

    const urlReadIntent = resolveUrlReadIntent(request);
    if (urlReadIntent) {
      const fetchTool = findWebFetchTool(servers);
      if (fetchTool) {
        try {
          const result = await callMcpTool(fetchTool.server, {
            serverId: fetchTool.server.id,
            toolName: fetchTool.tool.name,
            arguments: buildUrlToolArguments(fetchTool.tool, urlReadIntent.url),
          }, request.signal);
          const toolContext = `[网页读取结果，仅供当前回复使用，不写入记忆，也不要暴露工具协议]\n网址：${urlReadIntent.url}\n工具：${fetchTool.tool.name}\n结果：${formatMcpToolResult(result)}`;
          return base(withInstruction(request, `${instruction}\n\n${toolContext}\n用户要求查看这个网页。请严格基于读取结果回答；如果结果为空或工具返回错误，明确说明无法读取，不要猜测网页内容，也不要输出 MCP 标记。`));
        } catch (error) {
          console.warn("[mcp] deterministic webpage fetch failed", error);
          return base(withInstruction(request, `${instruction}\n\n本轮网页读取失败（网址：${urlReadIntent.url}）。请明确告诉用户暂时无法读取该网页，不要编造或假装看过网页内容。`));
        }
      }
    }

    const first = await base(withInstruction(request, instruction));
    const toolRequest = parseToolRequest(first.text);
    if (!toolRequest) return first;
    const server = servers.find((item) => item.id === toolRequest.serverId);
    if (!server) return { text: "暂时找不到对应的只读工具，请直接告诉我你要查询的内容。" };
    try {
      const result = await callMcpTool(server, toolRequest, request.signal);
      const toolContext = `[本轮 MCP 工具结果，仅供当前回复使用，不写入记忆，也不要暴露工具协议]\n工具：${toolRequest.toolName}\n结果：${formatMcpToolResult(result)}`;
      const second = await base(withInstruction(request, `${instruction}\n\n${toolContext}\n请基于该结果直接回答用户。不要再次调用工具，不要输出 MCP 标记。`));
      return parseToolRequest(second.text) ? { text: "工具查询已完成，请根据已获得的信息直接回答。" } : second;
    } catch (error) {
      console.warn("[mcp] read-only tool call failed", error);
      return base(withInstruction(request, `${instruction}\n\n本轮工具调用失败，请不要编造结果，直接说明暂时无法读取外部信息。`));
    }
  };
}
