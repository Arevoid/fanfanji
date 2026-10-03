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
  /** Optional non-secret request headers. Values are kept in the active session. */
  customHeaders?: Record<string, string>;
  /** New permission mode. Missing values are treated as read-only for legacy data. */
  permissionMode?: McpPermissionMode;
  /** @deprecated Kept for backwards-compatible persisted configs. */
  readOnlyOnly?: true;
  /** Exact tool names the user or a bundled preset has explicitly trusted as read-only. */
  readOnlyToolAllowlist?: string[];
  discoveredTools: McpDiscoveredTool[];
  /** Live discovery state. Missing values are treated as unverified for legacy data. */
  connectionStatus?: McpConnectionStatus;
  lastError?: string;
  lastCheckedAt?: number;
  updatedAt: number;
}

export type McpConnectionStatus = "unverified" | "checking" | "connected" | "error";

export type McpPermissionMode = "read" | "operate";
export type McpToolAccess = "read" | "operate" | "unknown";

export interface McpDiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** @deprecated Use access for new records. */
  readOnly: boolean;
  /** Capability class derived from the server's tool annotations. */
  access?: McpToolAccess;
  /** Operations always require a user confirmation before execution. */
  requiresConfirmation?: boolean;
  enabled: boolean;
}

export interface McpToolResult {
  isError: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string; uri?: string; resource?: unknown }>;
  structuredContent?: unknown;
}

export interface McpCharacterPolicy {
  enabled: boolean;
  /** Optional server allow-list. Missing means all enabled servers. */
  allowedServerIds?: string[];
}

export interface McpPolicy {
  /** Project-level master switch. Defaults to true for existing users. */
  enabled: boolean;
  characterPolicies: Record<string, McpCharacterPolicy>;
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
  /** Set only after the user confirms an operation tool. */
  confirmed?: boolean;
}
