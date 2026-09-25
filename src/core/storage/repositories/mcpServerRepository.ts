import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { McpConnectionStatus, McpDiscoveredTool, McpServerConfig } from "../../../domain/mcp/mcpTypes";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function normalizeTool(value: unknown): McpDiscoveredTool | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  const readOnly = value.readOnly !== false;
  return {
    name: value.name.trim().slice(0, 160),
    description: typeof value.description === "string" ? value.description.slice(0, 1000) : undefined,
    inputSchema: isRecord(value.inputSchema) ? value.inputSchema : undefined,
    readOnly,
    enabled: readOnly && value.enabled !== false,
  };
}

function normalizeServer(value: unknown): McpServerConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string") return null;
  let url: URL;
  try { url = new URL(value.url); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const tools = Array.isArray(value.discoveredTools) ? value.discoveredTools.map(normalizeTool).filter((tool): tool is McpDiscoveredTool => Boolean(tool)).slice(0, 100) : [];
  const connectionStatus: McpConnectionStatus | undefined = ["unverified", "checking", "connected", "error"].includes(value.connectionStatus as string)
    ? value.connectionStatus as McpConnectionStatus
    : undefined;
  return {
    id: value.id.trim().slice(0, 120),
    name: (typeof value.name === "string" && value.name.trim() ? value.name : url.hostname).slice(0, 120),
    url: url.toString(),
    enabled: value.enabled !== false,
    directFetch: value.directFetch === true,
    readOnlyOnly: true,
    discoveredTools: tools,
    ...(connectionStatus ? { connectionStatus } : {}),
    ...(typeof value.lastError === "string" && value.lastError.trim() ? { lastError: value.lastError.slice(0, 500) } : {}),
    ...(typeof value.lastCheckedAt === "number" ? { lastCheckedAt: value.lastCheckedAt } : {}),
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
}

export function loadMcpServers(): McpServerConfig[] {
  const result = readJson<unknown>(storageKeys.mcpServers, []);
  if (!Array.isArray(result.value)) return [];
  return result.value.map(normalizeServer).filter((server): server is McpServerConfig => Boolean(server));
}

export function saveMcpServers(servers: McpServerConfig[]) {
  return writeJson(storageKeys.mcpServers, servers.map(normalizeServer).filter((server): server is McpServerConfig => Boolean(server)));
}

export function upsertMcpServer(server: McpServerConfig) {
  return saveMcpServers([...loadMcpServers().filter((item) => item.id !== server.id), server]);
}

export function removeMcpServer(id: string) {
  return saveMcpServers(loadMcpServers().filter((server) => server.id !== id));
}
