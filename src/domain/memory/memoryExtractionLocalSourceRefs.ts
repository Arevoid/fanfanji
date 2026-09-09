import type { Message } from "../../types";
import type { MemoryExtractionSourceEnvelope, MemoryExtractionSourceMessage } from "./memoryExtractionSourceEnvelope";

/** A transport-only reference. It has no meaning outside one extraction request. */
export interface MemoryExtractionLocalSourceRef {
  ref: string;
  messageId: string;
  role: Message["sender"];
  actorId?: string;
  timestamp?: number;
}

export interface MemoryExtractionLocalSourceRefTable {
  refs: readonly MemoryExtractionLocalSourceRef[];
  byRef: ReadonlyMap<string, MemoryExtractionLocalSourceRef>;
  canonicalMessageIds: ReadonlySet<string>;
}

export interface MemoryExtractionSourceRefResolution {
  canonicalMessageIds: string[];
  invalidRefs: string[];
  duplicateRefs: string[];
}

const LOCAL_REF_PATTERN = /^M[1-9]\d*$/u;

const toLocalRef = (source: MemoryExtractionSourceMessage, index: number): MemoryExtractionLocalSourceRef => ({
  ref: `M${index + 1}`,
  messageId: source.messageId,
  role: source.role,
  ...(source.actorId ? { actorId: source.actorId } : {}),
  ...(source.timestamp !== undefined ? { timestamp: source.timestamp } : {}),
});

/**
 * Builds a deterministic, request-scoped source table. The table is never
 * persisted and the canonical IDs remain runtime-only metadata.
 */
export function buildMemoryExtractionLocalSourceRefTable(
  envelope: Pick<MemoryExtractionSourceEnvelope, "messageSources" | "allowedSourceMessageIds">,
): MemoryExtractionLocalSourceRefTable {
  const refs = envelope.messageSources.map(toLocalRef);
  return {
    refs,
    byRef: new Map(refs.map((entry) => [entry.ref, entry] as const)),
    canonicalMessageIds: new Set(envelope.allowedSourceMessageIds),
  };
}

/**
 * Resolves model transport references without guessing. Canonical IDs are
 * accepted only for already-adapted compatibility callers; an actual local
 * ref request still exposes only M# values to the provider.
 */
export function resolveMemoryExtractionSourceRefs(
  refs: readonly unknown[],
  table: MemoryExtractionLocalSourceRefTable,
): MemoryExtractionSourceRefResolution {
  const canonicalMessageIds: string[] = [];
  const invalidRefs: string[] = [];
  const duplicateRefs: string[] = [];
  const seen = new Set<string>();

  for (const rawRef of refs) {
    if (typeof rawRef !== "string") {
      invalidRefs.push(String(rawRef));
      continue;
    }
    const ref = rawRef.trim();
    const localSource = LOCAL_REF_PATTERN.test(ref) ? table.byRef.get(ref) : undefined;
    const canonicalId = localSource?.messageId
      || (table.canonicalMessageIds.has(ref) ? ref : undefined);
    if (!canonicalId) {
      invalidRefs.push(ref);
      continue;
    }
    if (seen.has(canonicalId)) {
      duplicateRefs.push(ref);
      continue;
    }
    seen.add(canonicalId);
    canonicalMessageIds.push(canonicalId);
  }

  return { canonicalMessageIds, invalidRefs, duplicateRefs };
}

export function isMemoryExtractionLocalSourceRef(value: string): boolean {
  return LOCAL_REF_PATTERN.test(value.trim());
}
