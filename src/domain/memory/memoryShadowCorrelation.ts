/**
 * Opaque in-process correlation for one extraction batch. It uses only source
 * references and temporal status; statements, quotes and array positions are
 * deliberately excluded.
 */
export function buildMemoryShadowCorrelationKey(
  sourceIds: readonly string[],
  temporalStatus: string,
): string | undefined {
  const normalized = Array.from(new Set(sourceIds.filter((id) => Boolean(id && id.trim())).map((id) => id.trim()))).sort();
  if (normalized.length === 0) return undefined;
  let hash = 2166136261;
  const value = [...normalized, temporalStatus].join("\u0000");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `source:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
