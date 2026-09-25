/**
 * MCP configuration that is safe to persist locally. Authentication material
 * is deliberately not part of this type; tokens belong to a request session.
 */
export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  directFetch: boolean;
  readOnlyOnly: true;
  discoveredTools: McpDiscoveredTool[];
  /** Live discovery state. Missing values are treated as unverified for legacy data. */
  connectionStatus?: McpConnectionStatus;
  lastError?: string;
  lastCheckedAt?: number;
  updatedAt: number;
}

export type McpConnectionStatus = "unverified" | "checking" | "connected" | "error";

export interface McpDiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** The user may only enable tools that the server declares as read-only. */
  readOnly: boolean;
  enabled: boolean;
}

export interface McpToolResult {
  isError: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  structuredContent?: unknown;
}

export interface McpRequestScope {
  characterId?: string;
  relationId?: string;
  conversationId?: string;
  userIdentityId?: string;
}

export interface McpToolRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}
