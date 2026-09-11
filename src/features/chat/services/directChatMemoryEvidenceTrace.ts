export type DirectChatMemoryEvidenceTraceStage =
  | "extraction_completed"
  | "long_evidence_gate_checked"
  | "before_snapshot_present"
  | "logical_action_id_created"
  | "shadow_result_present"
  | "canonical_after_present"
  | "observer_call_attempted"
  | "observer_entered"
  | "observer_skipped"
  | "collector_append_attempted"
  | "collector_append_succeeded"
  | "collector_append_rejected";

export type DirectChatMemoryEvidenceTraceReason =
  | "collector_inactive"
  | "window_missing"
  | "long_evidence_disabled"
  | "logical_action_missing"
  | "before_snapshot_missing"
  | "shadow_result_missing"
  | "canonical_after_missing"
  | "observer_exception"
  | "record_rejected"
  | "unknown";

export interface DirectChatMemoryEvidenceTraceEntry {
  stage: DirectChatMemoryEvidenceTraceStage;
  timestamp: number;
  reason?: DirectChatMemoryEvidenceTraceReason;
  longEvidenceEnabled?: boolean;
  collectorActive?: boolean;
  hasWindow?: boolean;
  hasLogicalActionId?: boolean;
  hasLongEvidenceBefore?: boolean;
  hasShadowResult?: boolean;
  hasCanonicalAfter?: boolean;
  observerEntered?: boolean;
  shadowCandidateCount?: number;
  collectorRecordCountBefore?: number;
  collectorRecordCountAfter?: number;
  collectorInstanceOrdinal?: number;
  devApiInstanceOrdinal?: number;
}

export interface DirectChatMemoryEvidenceTraceApi {
  clear: () => void;
  count: () => number;
  exportJson: () => string;
  get: () => DirectChatMemoryEvidenceTraceEntry[];
}

const TRACE_GLOBAL = "__fanfanjiMemoryEvidenceTrace" as const;
const TRACE_STORE = "__fanfanjiMemoryEvidenceTraceStore" as const;
const MAX_TRACE_ENTRIES = 64;
const TRACE_STAGES = new Set<DirectChatMemoryEvidenceTraceStage>([
  "extraction_completed",
  "long_evidence_gate_checked",
  "before_snapshot_present",
  "logical_action_id_created",
  "shadow_result_present",
  "canonical_after_present",
  "observer_call_attempted",
  "observer_entered",
  "observer_skipped",
  "collector_append_attempted",
  "collector_append_succeeded",
  "collector_append_rejected",
]);
const TRACE_REASONS = new Set<DirectChatMemoryEvidenceTraceReason>([
  "collector_inactive",
  "window_missing",
  "long_evidence_disabled",
  "logical_action_missing",
  "before_snapshot_missing",
  "shadow_result_missing",
  "canonical_after_missing",
  "observer_exception",
  "record_rejected",
  "unknown",
]);

type TraceRoot = typeof globalThis & {
  [TRACE_GLOBAL]?: DirectChatMemoryEvidenceTraceApi;
  [TRACE_STORE]?: { entries: DirectChatMemoryEvidenceTraceEntry[] };
};

function isTraceRuntime(): boolean {
  try {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
      || (typeof process !== "undefined" && process.env.NODE_ENV === "test");
  } catch {
    return false;
  }
}

function traceStore(): { entries: DirectChatMemoryEvidenceTraceEntry[] } {
  const root = globalThis as TraceRoot;
  if (!root[TRACE_STORE]) root[TRACE_STORE] = { entries: [] };
  return root[TRACE_STORE];
}

function safeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1000, Math.floor(value)));
}

function safeEntry(entry: DirectChatMemoryEvidenceTraceEntry): DirectChatMemoryEvidenceTraceEntry | null {
  if (!entry || !TRACE_STAGES.has(entry.stage)) return null;
  const safe: DirectChatMemoryEvidenceTraceEntry = {
    stage: entry.stage,
    timestamp: Number.isFinite(entry.timestamp) ? Math.max(0, Math.floor(entry.timestamp)) : Date.now(),
  };
  if (entry.reason && TRACE_REASONS.has(entry.reason)) safe.reason = entry.reason;
  for (const key of [
    "longEvidenceEnabled",
    "collectorActive",
    "hasWindow",
    "hasLogicalActionId",
    "hasLongEvidenceBefore",
    "hasShadowResult",
    "hasCanonicalAfter",
    "observerEntered",
  ] as const) {
    if (typeof entry[key] === "boolean") safe[key] = entry[key];
  }
  for (const key of [
    "shadowCandidateCount",
    "collectorRecordCountBefore",
    "collectorRecordCountAfter",
    "collectorInstanceOrdinal",
    "devApiInstanceOrdinal",
  ] as const) {
    if (entry[key] !== undefined) safe[key] = safeCount(entry[key]);
  }
  return safe;
}

export function recordDirectChatMemoryEvidenceTrace(entry: DirectChatMemoryEvidenceTraceEntry): void {
  if (!isTraceRuntime()) return;
  const safe = safeEntry(entry);
  if (!safe) return;
  const store = traceStore();
  store.entries = [...store.entries, safe].slice(-MAX_TRACE_ENTRIES);
}

export function clearDirectChatMemoryEvidenceTrace(): void {
  traceStore().entries = [];
}

export function getDirectChatMemoryEvidenceTrace(): DirectChatMemoryEvidenceTraceEntry[] {
  return traceStore().entries.slice();
}

export function exportDirectChatMemoryEvidenceTraceJson(): string {
  return JSON.stringify({
    schemaVersion: "memory-admission-v2-runtime-trace-1",
    entryCount: traceStore().entries.length,
    entries: getDirectChatMemoryEvidenceTrace(),
  });
}

function installDevApi(): void {
  if (!isTraceRuntime()) return;
  const root = globalThis as TraceRoot;
  root[TRACE_GLOBAL] = {
    clear: clearDirectChatMemoryEvidenceTrace,
    count: () => traceStore().entries.length,
    exportJson: exportDirectChatMemoryEvidenceTraceJson,
    get: getDirectChatMemoryEvidenceTrace,
  };
}

installDevApi();
