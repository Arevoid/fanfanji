import { readJson, writeJson } from "../storageAdapter";
import { storageKeys } from "../storageKeys";
import type { McpCharacterPolicy, McpPolicy } from "../../../domain/mcp/mcpTypes";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeCharacterPolicy = (value: unknown): McpCharacterPolicy => ({
  enabled: !(isRecord(value) && value.enabled === false),
  ...(isRecord(value) && Array.isArray(value.allowedServerIds)
    ? { allowedServerIds: value.allowedServerIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()).slice(0, 100) }
    : {}),
});

export function loadMcpPolicy(): McpPolicy {
  const result = readJson<unknown>(storageKeys.mcpPolicy, undefined);
  if (!isRecord(result.value)) return { enabled: true, characterPolicies: {} };
  const rawPolicies = isRecord(result.value.characterPolicies) ? result.value.characterPolicies : {};
  return {
    enabled: result.value.enabled !== false,
    characterPolicies: Object.fromEntries(Object.entries(rawPolicies).filter(([id]) => id.trim()).map(([id, value]) => [id, normalizeCharacterPolicy(value)])),
  };
}

export function saveMcpPolicy(policy: McpPolicy): void {
  writeJson(storageKeys.mcpPolicy, {
    enabled: policy.enabled !== false,
    characterPolicies: Object.fromEntries(Object.entries(policy.characterPolicies || {}).map(([id, value]) => [id, normalizeCharacterPolicy(value)])),
  });
}

export function setMcpMasterEnabled(enabled: boolean): McpPolicy {
  const policy = loadMcpPolicy();
  policy.enabled = enabled;
  saveMcpPolicy(policy);
  return policy;
}

export function setCharacterMcpEnabled(characterId: string, enabled: boolean): McpPolicy {
  const normalizedId = characterId.trim();
  if (!normalizedId) return loadMcpPolicy();
  const policy = loadMcpPolicy();
  policy.characterPolicies[normalizedId] = { ...(policy.characterPolicies[normalizedId] || {}), enabled };
  saveMcpPolicy(policy);
  return policy;
}

export function isMcpEnabledForScope(scope?: { characterId?: string }): boolean {
  const policy = loadMcpPolicy();
  if (!policy.enabled) return false;
  const characterId = scope?.characterId?.trim();
  return !characterId || policy.characterPolicies[characterId]?.enabled !== false;
}

export function isMcpServerAllowedForScope(serverId: string, scope?: { characterId?: string }): boolean {
  const characterId = scope?.characterId?.trim();
  if (!characterId) return true;
  const allowed = loadMcpPolicy().characterPolicies[characterId]?.allowedServerIds;
  return !allowed || allowed.length === 0 || allowed.includes(serverId);
}
