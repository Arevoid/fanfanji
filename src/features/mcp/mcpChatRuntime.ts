import type { ApiChatParams } from "../../utils/apiHelper";
import type { McpRequestScope, McpServerConfig, McpToolRequest } from "../../domain/mcp/mcpTypes";
import { loadMcpServers } from "../../core/storage/repositories/mcpServerRepository";
import { callMcpTool, formatMcpToolResult } from "./mcpClient";

type RequestAi = (params: ApiChatParams) => Promise<{ text: string }>;

const OPEN_MARKER = "[[MCP_TOOL_REQUEST]]";
const CLOSE_MARKER = "[[/MCP_TOOL_REQUEST]]";
const MAX_TOOL_SCHEMA_CHARS = 8_000;

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
