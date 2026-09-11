import { isLoopbackHostname } from "./devOrigin";

export type DevDiagnosticModuleName =
  | "root"
  | "chat"
  | "memory_extraction"
  | "collector"
  | "trace";

export type DevDiagnosticStage =
  | "root_module_evaluated"
  | "chat_module_evaluated"
  | "memory_extraction_module_evaluated"
  | "collector_module_evaluated"
  | "trace_module_evaluated"
  | "install_dev_api_attempted"
  | "install_dev_api_completed"
  | "install_dev_api_skipped";

export type DevDiagnosticMode = "development" | "test" | "production" | "unknown";

export type DevDiagnosticReason =
  | "current_bundle"
  | "module_loaded"
  | "api_installed"
  | "api_skipped"
  | "environment_gate_false"
  | "lazy_module_not_loaded"
  | "hmr_rebind"
  | "unknown";

export interface DevDiagnosticModuleTraceEntry {
  stage: DevDiagnosticStage;
  timestamp: number;
  moduleName: DevDiagnosticModuleName;
  dev: boolean;
  mode: DevDiagnosticMode;
  instanceOrdinal?: number;
  reason?: DevDiagnosticReason;
}

export interface DevDiagnosticModuleTraceApi {
  clear: () => void;
  count: () => number;
  get: () => DevDiagnosticModuleTraceEntry[];
  exportJson: () => string;
}

export interface DevRuntimeProbe {
  schemaVersion: "fanfanji-dev-runtime-probe-1";
  rootBundleLoaded: true;
  dev: boolean;
  mode: DevDiagnosticMode;
  hostClass: "loopback" | "non_loopback" | "unknown";
}

const PROBE_GLOBAL = "__fanfanjiDevRuntimeProbe" as const;
const TRACE_GLOBAL = "__fanfanjiDevModuleTrace" as const;
const TRACE_STORE = "__fanfanjiDevModuleTraceStore" as const;
const MAX_TRACE_ENTRIES = 64;

const STAGES = new Set<DevDiagnosticStage>([
  "root_module_evaluated",
  "chat_module_evaluated",
  "memory_extraction_module_evaluated",
  "collector_module_evaluated",
  "trace_module_evaluated",
  "install_dev_api_attempted",
  "install_dev_api_completed",
  "install_dev_api_skipped",
]);
const MODULE_NAMES = new Set<DevDiagnosticModuleName>([
  "root",
  "chat",
  "memory_extraction",
  "collector",
  "trace",
]);
const MODES = new Set<DevDiagnosticMode>(["development", "test", "production", "unknown"]);
const REASONS = new Set<DevDiagnosticReason>([
  "current_bundle",
  "module_loaded",
  "api_installed",
  "api_skipped",
  "environment_gate_false",
  "lazy_module_not_loaded",
  "hmr_rebind",
  "unknown",
]);

type DiagnosticRoot = typeof globalThis & {
  [PROBE_GLOBAL]?: DevRuntimeProbe;
  [TRACE_GLOBAL]?: DevDiagnosticModuleTraceApi;
  [TRACE_STORE]?: { entries: DevDiagnosticModuleTraceEntry[] };
};

function isNodeTestRuntime(): boolean {
  try {
    return typeof process !== "undefined" && process.env.NODE_ENV === "test";
  } catch {
    return false;
  }
}

export function isDevDiagnosticRuntime(): boolean {
  try {
    return Boolean(typeof import.meta.env !== "undefined" && import.meta.env.DEV) || isNodeTestRuntime();
  } catch {
    return false;
  }
}

export function currentDevDiagnosticMode(): DevDiagnosticMode {
  try {
    if (typeof import.meta.env !== "undefined" && typeof import.meta.env.MODE === "string") {
      const mode = import.meta.env.MODE;
      if (MODES.has(mode as DevDiagnosticMode)) return mode as DevDiagnosticMode;
      if (mode === "development") return "development";
    }
  } catch {
    // Fall through to the Node test fallback.
  }
  return isNodeTestRuntime() ? "test" : "unknown";
}

function currentDevFlag(): boolean {
  try {
    return Boolean(typeof import.meta.env !== "undefined" && import.meta.env.DEV);
  } catch {
    return false;
  }
}

function diagnosticRoot(): DiagnosticRoot {
  return globalThis as DiagnosticRoot;
}

function traceStore(): { entries: DevDiagnosticModuleTraceEntry[] } | null {
  if (!isDevDiagnosticRuntime()) return null;
  const root = diagnosticRoot();
  if (!root[TRACE_STORE]) root[TRACE_STORE] = { entries: [] };
  return root[TRACE_STORE];
}

function safeEntry(entry: DevDiagnosticModuleTraceEntry): DevDiagnosticModuleTraceEntry | null {
  if (!entry || !STAGES.has(entry.stage) || !MODULE_NAMES.has(entry.moduleName) || !MODES.has(entry.mode)) return null;
  const safe: DevDiagnosticModuleTraceEntry = {
    stage: entry.stage,
    timestamp: Number.isFinite(entry.timestamp) ? Math.max(0, Math.floor(entry.timestamp)) : Date.now(),
    moduleName: entry.moduleName,
    dev: entry.dev === true,
    mode: entry.mode,
  };
  if (entry.instanceOrdinal !== undefined && Number.isSafeInteger(entry.instanceOrdinal) && entry.instanceOrdinal >= 0) {
    safe.instanceOrdinal = entry.instanceOrdinal;
  }
  if (entry.reason && REASONS.has(entry.reason)) safe.reason = entry.reason;
  return safe;
}

export function registerDevModuleTrace(entry: DevDiagnosticModuleTraceEntry): void {
  const store = traceStore();
  if (!store) return;
  const safe = safeEntry(entry);
  if (!safe) return;
  store.entries = [...store.entries, safe].slice(-MAX_TRACE_ENTRIES);
}

export function installDevModuleTrace(): void {
  if (!isDevDiagnosticRuntime()) return;
  const root = diagnosticRoot();
  root[TRACE_GLOBAL] = {
    clear: () => {
      const store = traceStore();
      if (store) store.entries = [];
    },
    count: () => traceStore()?.entries.length ?? 0,
    get: () => [...(traceStore()?.entries ?? [])],
    exportJson: () => JSON.stringify({
      schemaVersion: "fanfanji-dev-module-trace-1",
      entryCount: traceStore()?.entries.length ?? 0,
      entries: traceStore()?.entries ?? [],
    }),
  };
}

export function installDevRuntimeProbe(): void {
  if (!isDevDiagnosticRuntime()) return;
  const root = diagnosticRoot();
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const hostClass = hostname
    ? isLoopbackHostname(hostname) ? "loopback" : "non_loopback"
    : "unknown";
  root[PROBE_GLOBAL] = {
    schemaVersion: "fanfanji-dev-runtime-probe-1",
    rootBundleLoaded: true,
    dev: currentDevFlag(),
    mode: currentDevDiagnosticMode(),
    hostClass,
  };
  installDevModuleTrace();
  registerDevModuleTrace({
    stage: "root_module_evaluated",
    timestamp: Date.now(),
    moduleName: "root",
    dev: currentDevFlag(),
    mode: currentDevDiagnosticMode(),
    reason: "current_bundle",
  });
}
