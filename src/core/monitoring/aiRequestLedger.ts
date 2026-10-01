import { createId } from "../id/createId";
import { readJson, remove, writeJson } from "../storage/storageAdapter";

export const AI_REQUEST_LEDGER_KEY = "fanfan_ai_request_ledger_v1";
export const AI_REQUEST_LEDGER_UPDATED_EVENT = "fanfan-ai-request-ledger-updated";
export const AI_REQUEST_LEDGER_RETENTION_DAYS = 30;
export const AI_REQUEST_LEDGER_MAX_RECORDS = 300;
const AI_REQUEST_LEDGER_FLUSH_DELAY_MS = 25;

export const AI_PURPOSES = [
  "chat_reply",
  "group_chat_reply",
  "offline_story_generate",
  "regenerate",
  "proactive_message",
  "memory_extract",
  "translation",
  "personality_summary",
  "inner_voice",
  "moment_generate",
  "moment_comment",
  "moment_reply",
  "diary_generate",
  "character_phone_generate",
  "forum_generate",
  "forum_story_generate",
  "reading_generate",
  "cinema_generate",
  "schedule_generate",
  "image_generate",
  "image_analyze",
  "tts",
  "api_test",
  "model_list",
] as const;

export type AiPurpose = typeof AI_PURPOSES[number];

/** Stable, user-facing names for the built-in prompt used by each AI flow. */
export const AI_PURPOSE_PROMPT_LABELS: Partial<Record<AiPurpose, string>> = {
  chat_reply: "线上对话提示词",
  group_chat_reply: "群聊对话提示词",
  offline_story_generate: "线下剧情提示词",
  regenerate: "重新生成提示词",
  proactive_message: "主动消息提示词",
  memory_extract: "记忆提取提示词",
  translation: "翻译提示词",
  personality_summary: "人设总结提示词",
  inner_voice: "心声提示词",
  moment_generate: "朋友圈发布提示词",
  moment_comment: "朋友圈评论提示词",
  moment_reply: "朋友圈回复提示词",
  diary_generate: "日记提示词",
  character_phone_generate: "角色手机提示词",
  forum_generate: "论坛提示词",
  forum_story_generate: "论坛剧情提示词",
  reading_generate: "阅读提示词",
  cinema_generate: "观影提示词",
  schedule_generate: "角色日程提示词",
};

export type AiRequestTransport = "backend_proxy" | "browser_direct" | "server_provider" | "unknown";
export type AiRequestStatus = "success" | "failure";
export type AiRequestUsageSource = "provider" | "estimated" | "unavailable";

/** Provider-reported usage for one physical upstream request.  It is kept
 * separate from estimates so the UI never presents a guess as a billable
 * provider value. */
export interface AiRequestUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
export type AiRequestErrorCategory =
  | "none"
  | "configuration"
  | "network"
  | "timeout"
  | "aborted"
  | "provider_4xx"
  | "provider_5xx"
  | "provider_safety"
  | "provider_empty"
  | "provider_invalid_response"
  | "unknown";

export interface AiRequestEnvelope {
  requestId: string;
  /** Stable identity for one logical AI action across linked request rows. */
  logicalActionId?: string;
  parentActionId?: string;
  purpose: AiPurpose;
  characterId?: string;
  relationId?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  endpoint?: string;
  transport: AiRequestTransport;
  startedAt: number;
  durationMs: number;
  status: AiRequestStatus;
  errorCategory: AiRequestErrorCategory;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  actualTotalTokens?: number;
  usageSource?: AiRequestUsageSource;
  providerRequestCount: number;
  inputCharacters?: number;
  outputCharacters?: number;
  /** Short, user-facing labels for the context blocks used by this request. */
  contextItems?: string[];
  retryCount: number;
  retryReasons: string[];
  fallbackCount: number;
  fallbackReasons: string[];
  uncertainDelivery: boolean;
  recordedAt: number;
}

export interface AiRequestLedgerInput {
  purpose: AiPurpose;
  /** Stable identity for one logical AI action across linked request rows. */
  logicalActionId?: string;
  parentActionId?: string;
  characterId?: string;
  relationId?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  endpoint?: string;
  transport?: AiRequestTransport;
  inputCharacters?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  /** Short, user-facing labels for the context blocks used by this request. */
  contextItems?: readonly string[];
  retryReasons?: readonly string[];
  fallbackReasons?: readonly string[];
}

export interface AiRequestAttempt {
  provider?: string;
  model?: string;
  endpoint?: string;
  transport?: AiRequestTransport;
}

export interface AiRequestLedgerSession {
  readonly parentActionId?: string;
  readonly logicalActionId?: string;
  markAttempt(attempt?: AiRequestAttempt): void;
  recordUsage(usage?: AiRequestUsage): void;
  markRetry(reason: string): void;
  markFallback(reason: string): void;
  complete(input: {
    succeeded: boolean;
    error?: unknown;
    outputCharacters?: number;
    actualInputTokens?: number;
    actualOutputTokens?: number;
    actualTotalTokens?: number;
  }): AiRequestEnvelope;
}

const RETRY_REASON_ALIASES: Record<string, string> = {
  format_validation: "format_validation",
  "response format validation": "format_validation",
  context_too_large: "context_too_large",
  "context-too-large recovery": "context_too_large",
  degenerate_response: "degenerate_response",
  "degenerate response correction": "degenerate_response",
  alias_identity: "alias_identity",
  "alias identity boundary correction": "alias_identity",
};

const FALLBACK_REASON_ALIASES: Record<string, string> = {
  backend_network: "backend_network",
  "backend network failure -> browser direct": "backend_network",
  backend_route_missing: "backend_route_missing",
  "backend route missing/static host -> browser direct": "backend_route_missing",
  backend_test_key: "backend_test_key",
  "backend test-key failure -> browser direct": "backend_test_key",
  backend_model_list: "backend_model_list",
  "backend model-list failure -> browser direct": "backend_model_list",
  backend_memory_extraction: "backend_memory_extraction",
  "backend memory extraction failure -> browser direct": "backend_memory_extraction",
  backend_personality_summary: "backend_personality_summary",
  "backend personality summary failure -> browser direct": "backend_personality_summary",
  backend_translation: "backend_translation",
  "backend translation failure -> browser direct": "backend_translation",
  translation_route_missing: "translation_route_missing",
  "translation route missing/static host -> browser direct": "translation_route_missing",
};

let memoryLedger: AiRequestEnvelope[] = [];
let pendingLedgerRecords: AiRequestEnvelope[] = [];
let ledgerFlushTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleFlushTarget: Window | null = null;

export function createAiActionId(): string { return createId("ai-action"); }

function finiteNonNegative(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function normalizeReason(reason: unknown, kind: "retry" | "fallback"): string {
  const raw = typeof reason === "string" ? reason.trim() : "";
  const aliases = kind === "retry" ? RETRY_REASON_ALIASES : FALLBACK_REASON_ALIASES;
  return aliases[raw] || (kind === "retry" ? "unknown_retry" : "unknown_fallback");
}

function boundedReasons(reasons: readonly unknown[], kind: "retry" | "fallback"): string[] {
  return reasons.map((reason) => normalizeReason(reason, kind)).slice(0, 12);
}

function boundedContextItems(items: readonly unknown[]): string[] {
  const normalized = items
    .map((item) => typeof item === "string" ? item.trim().replace(/\s+/gu, " ") : "")
    .filter(Boolean)
    .map((item) => item.slice(0, 120));
  return [...new Set(normalized)].slice(0, 12);
}

function contextItemsWithPromptLabel(purpose: AiPurpose, items: readonly unknown[]): string[] {
  const promptLabel = AI_PURPOSE_PROMPT_LABELS[purpose];
  return boundedContextItems(promptLabel ? [promptLabel, ...items] : items);
}

function sumUsageValue(left: number | undefined, right: unknown): number | undefined {
  const value = finiteNonNegative(right);
  if (value === undefined) return left;
  return (left || 0) + value;
}

export function redactAiEndpoint(value?: string): string | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (raw.startsWith("/")) return raw.split(/[?#]/u, 1)[0] || "/";
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/u, "") || parsed.origin;
  } catch {
    return raw.split(/[?#]/u, 1)[0].slice(0, 240);
  }
}

function errorCategory(error: unknown): AiRequestErrorCategory {
  if (!error) return "none";
  const candidate = typeof error === "object" && error !== null ? error as { code?: unknown; kind?: unknown; status?: unknown } : {};
  const code = String(candidate.code || "");
  const kind = String(candidate.kind || "");
  const status = typeof candidate.status === "number" ? candidate.status : undefined;
  if (code === "provider_safety" || /safety|prohibited|content[_ -]?filter/iu.test(code)) return "provider_safety";
  if (code === "provider_empty") return "provider_empty";
  if (code === "provider_invalid_response") return "provider_invalid_response";
  if (code === "configuration") return "configuration";
  if (kind === "timeout" || code === "timeout") return "timeout";
  if (kind === "aborted" || code === "aborted") return "aborted";
  if (kind === "network" || code === "network") return "network";
  if (status !== undefined && status >= 400 && status < 500) return "provider_4xx";
  if (status !== undefined && status >= 500) return "provider_5xx";
  return "unknown";
}

function isUncertainDelivery(category: AiRequestErrorCategory): boolean {
  return category === "timeout" || category === "network";
}

function normalizeRecord(value: unknown): AiRequestEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AiRequestEnvelope>;
  if (typeof candidate.requestId !== "string" || typeof candidate.purpose !== "string" || !AI_PURPOSES.includes(candidate.purpose as AiPurpose)) return null;
  if (candidate.status !== "success" && candidate.status !== "failure") return null;
  const providerRequestCount = Math.max(0, Math.floor(Number(candidate.providerRequestCount) || 0));
  // A ledger row represents a real provider request. Preflight/short-circuit
  // flows that never reached a provider must not create a fake call detail.
  if (providerRequestCount === 0) return null;
  const purpose = candidate.purpose as AiPurpose;
  const contextItems = contextItemsWithPromptLabel(purpose, Array.isArray(candidate.contextItems) ? candidate.contextItems : []);
  return {
    requestId: candidate.requestId,
    ...(typeof candidate.logicalActionId === "string" ? { logicalActionId: candidate.logicalActionId } : {}),
    ...(typeof candidate.parentActionId === "string" ? { parentActionId: candidate.parentActionId } : {}),
    purpose,
    ...(typeof candidate.characterId === "string" ? { characterId: candidate.characterId } : {}),
    ...(typeof candidate.relationId === "string" ? { relationId: candidate.relationId } : {}),
    ...(typeof candidate.conversationId === "string" ? { conversationId: candidate.conversationId } : {}),
    ...(typeof candidate.provider === "string" ? { provider: candidate.provider } : {}),
    ...(typeof candidate.model === "string" ? { model: candidate.model } : {}),
    ...(typeof candidate.endpoint === "string" ? { endpoint: redactAiEndpoint(candidate.endpoint) } : {}),
    transport: candidate.transport || "unknown",
    startedAt: Math.max(0, Number(candidate.startedAt) || 0),
    durationMs: Math.max(0, Number(candidate.durationMs) || 0),
    status: candidate.status,
    errorCategory: candidate.errorCategory || (candidate.status === "success" ? "none" : "unknown"),
    ...(finiteNonNegative(candidate.estimatedInputTokens) !== undefined ? { estimatedInputTokens: finiteNonNegative(candidate.estimatedInputTokens) } : {}),
    ...(finiteNonNegative(candidate.estimatedOutputTokens) !== undefined ? { estimatedOutputTokens: finiteNonNegative(candidate.estimatedOutputTokens) } : {}),
    ...(finiteNonNegative(candidate.actualInputTokens) !== undefined ? { actualInputTokens: finiteNonNegative(candidate.actualInputTokens) } : {}),
    ...(finiteNonNegative(candidate.actualOutputTokens) !== undefined ? { actualOutputTokens: finiteNonNegative(candidate.actualOutputTokens) } : {}),
    ...(finiteNonNegative(candidate.actualTotalTokens) !== undefined ? { actualTotalTokens: finiteNonNegative(candidate.actualTotalTokens) } : {}),
    ...(candidate.usageSource === "provider" || candidate.usageSource === "estimated" || candidate.usageSource === "unavailable"
      ? { usageSource: candidate.usageSource }
      : {}),
    providerRequestCount,
    ...(finiteNonNegative(candidate.inputCharacters) !== undefined ? { inputCharacters: finiteNonNegative(candidate.inputCharacters) } : {}),
    ...(finiteNonNegative(candidate.outputCharacters) !== undefined ? { outputCharacters: finiteNonNegative(candidate.outputCharacters) } : {}),
    ...(contextItems.length > 0 ? { contextItems } : {}),
    retryCount: Math.max(0, Math.floor(Number(candidate.retryCount) || 0)),
    retryReasons: boundedReasons(Array.isArray(candidate.retryReasons) ? candidate.retryReasons : [], "retry"),
    fallbackCount: Math.max(0, Math.floor(Number(candidate.fallbackCount) || 0)),
    fallbackReasons: boundedReasons(Array.isArray(candidate.fallbackReasons) ? candidate.fallbackReasons : [], "fallback"),
    uncertainDelivery: Boolean(candidate.uncertainDelivery),
    recordedAt: Math.max(0, Number(candidate.recordedAt) || 0),
  };
}

function retainLedgerRecords(records: readonly AiRequestEnvelope[], now: number): AiRequestEnvelope[] {
  const cutoff = now - AI_REQUEST_LEDGER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return records
    .filter((record) => record.recordedAt >= cutoff)
    .sort((left, right) => left.recordedAt - right.recordedAt)
    .slice(-AI_REQUEST_LEDGER_MAX_RECORDS);
}

function mergeLedgerRecords(...sources: readonly AiRequestEnvelope[][]): AiRequestEnvelope[] {
  const records = new Map<string, AiRequestEnvelope>();
  for (const source of sources) {
    for (const record of source) records.set(record.requestId, record);
  }
  return [...records.values()];
}

function readStoredLedger(now: number): AiRequestEnvelope[] {
  const raw = readJson<unknown>(AI_REQUEST_LEDGER_KEY, []);
  if (!raw.valid || !Array.isArray(raw.value)) return [];
  return retainLedgerRecords(
    raw.value.map(normalizeRecord).filter((record): record is AiRequestEnvelope => Boolean(record)),
    now,
  );
}

function scheduleLedgerFlush(): void {
  if (typeof window !== "undefined" && typeof window.addEventListener === "function" && lifecycleFlushTarget !== window) {
    window.addEventListener("pagehide", () => flushAiRequestLedger());
    lifecycleFlushTarget = window;
  }
  if (ledgerFlushTimer !== null) return;
  ledgerFlushTimer = setTimeout(() => flushAiRequestLedger(), AI_REQUEST_LEDGER_FLUSH_DELAY_MS);
}

export function loadAiRequestLedger(now = Date.now()): AiRequestEnvelope[] {
  const merged = mergeLedgerRecords(readStoredLedger(now), memoryLedger, pendingLedgerRecords);
  memoryLedger = retainLedgerRecords(merged, now);
  return memoryLedger;
}

export function recordAiRequest(record: AiRequestEnvelope): void {
  try {
    const normalized = normalizeRecord(record);
    if (!normalized) return;
    memoryLedger = retainLedgerRecords(mergeLedgerRecords(memoryLedger, [normalized]), normalized.recordedAt);
    pendingLedgerRecords = retainLedgerRecords(mergeLedgerRecords(pendingLedgerRecords, [normalized]), normalized.recordedAt);
    scheduleLedgerFlush();
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(AI_REQUEST_LEDGER_UPDATED_EVENT));
    }
  } catch (error) {
    console.warn("[monitoring] AI request ledger recording failed; continuing without persistence.", error);
  }
}

export function flushAiRequestLedger(now = Date.now()): void {
  if (ledgerFlushTimer !== null) {
    clearTimeout(ledgerFlushTimer);
    ledgerFlushTimer = null;
  }
  if (pendingLedgerRecords.length === 0) return;

  const pending = pendingLedgerRecords;
  pendingLedgerRecords = [];
  try {
    const records = retainLedgerRecords(mergeLedgerRecords(readStoredLedger(now), memoryLedger, pending), now);
    memoryLedger = records;
    const result = writeJson(AI_REQUEST_LEDGER_KEY, records);
    if (!result.success) {
      pendingLedgerRecords = retainLedgerRecords(mergeLedgerRecords(pendingLedgerRecords, pending), now);
      if (result.error !== "unavailable") {
        console.warn("[monitoring] AI request ledger could not be persisted.", result.error);
      }
    }
  } catch (error) {
    pendingLedgerRecords = retainLedgerRecords(mergeLedgerRecords(pendingLedgerRecords, pending), now);
    console.warn("[monitoring] AI request ledger flush failed; continuing without persistence.", error);
  }
}

export function clearInMemoryAiRequestLedgerForTests(): void {
  memoryLedger = [];
  pendingLedgerRecords = [];
  if (ledgerFlushTimer !== null) {
    clearTimeout(ledgerFlushTimer);
    ledgerFlushTimer = null;
  }
}

/** Clear only diagnostic request metadata; business data is intentionally untouched. */
export function clearAiRequestLedger(): void {
  memoryLedger = [];
  pendingLedgerRecords = [];
  if (ledgerFlushTimer !== null) {
    clearTimeout(ledgerFlushTimer);
    ledgerFlushTimer = null;
  }
  const result = remove(AI_REQUEST_LEDGER_KEY);
  if (!result.success && result.error !== "unavailable") {
    console.warn("[monitoring] AI request ledger could not be cleared.", result.error);
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent(AI_REQUEST_LEDGER_UPDATED_EVENT));
  }
}

export function createAiRequestLedgerSession(input: AiRequestLedgerInput): AiRequestLedgerSession {
  const startedAt = Date.now();
  const requestId = createId("ai-request");
  const retryReasons: string[] = [...(input.retryReasons || [])];
  const fallbackReasons: string[] = [...(input.fallbackReasons || [])];
  let providerRequestCount = 0;
  let latestAttempt: AiRequestAttempt = {
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint,
    transport: input.transport,
  };
  let actualInputTokens: number | undefined;
  let actualOutputTokens: number | undefined;
  let actualTotalTokens: number | undefined;
  let hasProviderUsage = false;
  let completed = false;

  return {
    parentActionId: input.parentActionId,
    logicalActionId: input.logicalActionId,
    markAttempt(attempt = {}) {
      if (completed) return;
      providerRequestCount += 1;
      latestAttempt = { ...latestAttempt, ...attempt };
    },
    recordUsage(usage) {
      if (completed || !usage) return;
      const input = finiteNonNegative(usage.inputTokens);
      const output = finiteNonNegative(usage.outputTokens);
      const total = finiteNonNegative(usage.totalTokens);
      if (input === undefined && output === undefined && total === undefined) return;
      hasProviderUsage = true;
      actualInputTokens = sumUsageValue(actualInputTokens, input);
      actualOutputTokens = sumUsageValue(actualOutputTokens, output);
      actualTotalTokens = sumUsageValue(actualTotalTokens, total ?? (input !== undefined && output !== undefined ? input + output : undefined));
    },
    markRetry(reason) {
      if (!completed) retryReasons.push(String(reason));
    },
    markFallback(reason) {
      if (!completed) fallbackReasons.push(String(reason));
    },
    complete(result) {
      const contextItems = contextItemsWithPromptLabel(input.purpose, input.contextItems || []);
      if (completed) {
        return {
          requestId,
          logicalActionId: input.logicalActionId,
          parentActionId: input.parentActionId,
          purpose: input.purpose,
          transport: latestAttempt.transport || input.transport || "unknown",
          startedAt,
          durationMs: Math.max(0, Date.now() - startedAt),
          status: result.succeeded ? "success" : "failure",
          errorCategory: result.succeeded ? "none" : errorCategory(result.error),
          providerRequestCount,
          ...(actualInputTokens !== undefined ? { actualInputTokens } : {}),
          ...(actualOutputTokens !== undefined ? { actualOutputTokens } : {}),
          ...(actualTotalTokens !== undefined ? { actualTotalTokens } : {}),
          usageSource: hasProviderUsage ? "provider" : (input.estimatedInputTokens !== undefined || input.estimatedOutputTokens !== undefined ? "estimated" : "unavailable"),
          ...(contextItems.length > 0 ? { contextItems } : {}),
          retryCount: retryReasons.length,
          retryReasons: boundedReasons(retryReasons, "retry"),
          fallbackCount: fallbackReasons.length,
          fallbackReasons: boundedReasons(fallbackReasons, "fallback"),
          uncertainDelivery: !result.succeeded && isUncertainDelivery(errorCategory(result.error)),
          recordedAt: Date.now(),
        };
      }
      completed = true;
      const category = result.succeeded ? "none" : errorCategory(result.error);
      const record: AiRequestEnvelope = {
        requestId,
        ...(input.logicalActionId ? { logicalActionId: input.logicalActionId } : {}),
        ...(input.parentActionId ? { parentActionId: input.parentActionId } : {}),
        purpose: input.purpose,
        ...(input.characterId ? { characterId: input.characterId } : {}),
        ...(input.relationId ? { relationId: input.relationId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(latestAttempt.provider || input.provider ? { provider: latestAttempt.provider || input.provider } : {}),
        ...(latestAttempt.model || input.model ? { model: latestAttempt.model || input.model } : {}),
        ...(latestAttempt.endpoint || input.endpoint ? { endpoint: redactAiEndpoint(latestAttempt.endpoint || input.endpoint) } : {}),
        transport: latestAttempt.transport || input.transport || "unknown",
        startedAt,
        durationMs: Math.max(0, Date.now() - startedAt),
        status: result.succeeded ? "success" : "failure",
        errorCategory: category,
        ...(finiteNonNegative(input.estimatedInputTokens) !== undefined ? { estimatedInputTokens: finiteNonNegative(input.estimatedInputTokens) } : {}),
        ...(finiteNonNegative(input.estimatedOutputTokens) !== undefined ? { estimatedOutputTokens: finiteNonNegative(input.estimatedOutputTokens) } : {}),
        ...(finiteNonNegative(result.actualInputTokens) !== undefined || actualInputTokens !== undefined
          ? { actualInputTokens: (actualInputTokens || 0) + (finiteNonNegative(result.actualInputTokens) || 0) }
          : {}),
        ...(finiteNonNegative(result.actualOutputTokens) !== undefined || actualOutputTokens !== undefined
          ? { actualOutputTokens: (actualOutputTokens || 0) + (finiteNonNegative(result.actualOutputTokens) || 0) }
          : {}),
        ...(finiteNonNegative(result.actualTotalTokens) !== undefined || actualTotalTokens !== undefined
          ? { actualTotalTokens: (actualTotalTokens || 0) + (finiteNonNegative(result.actualTotalTokens) || 0) }
          : {}),
        usageSource: hasProviderUsage
          || finiteNonNegative(result.actualInputTokens) !== undefined
          || finiteNonNegative(result.actualOutputTokens) !== undefined
          || finiteNonNegative(result.actualTotalTokens) !== undefined
          ? "provider"
          : (input.estimatedInputTokens !== undefined || input.estimatedOutputTokens !== undefined ? "estimated" : "unavailable"),
        providerRequestCount,
        ...(contextItems.length > 0 ? { contextItems } : {}),
        ...(finiteNonNegative(input.inputCharacters) !== undefined ? { inputCharacters: finiteNonNegative(input.inputCharacters) } : {}),
        ...(finiteNonNegative(result.outputCharacters) !== undefined ? { outputCharacters: finiteNonNegative(result.outputCharacters) } : {}),
        retryCount: retryReasons.length,
        retryReasons: boundedReasons(retryReasons, "retry"),
        fallbackCount: fallbackReasons.length,
        fallbackReasons: boundedReasons(fallbackReasons, "fallback"),
        uncertainDelivery: !result.succeeded && isUncertainDelivery(category),
        recordedAt: Date.now(),
      };
      recordAiRequest(record);
      return record;
    },
  };
}

export async function withAiRequestLedger<T>(
  input: AiRequestLedgerInput,
  request: (session: AiRequestLedgerSession) => Promise<T>,
): Promise<T> {
  const session = createAiRequestLedgerSession(input);
  try {
    const result = await request(session);
    const outputCharacters = typeof result === "object" && result !== null && "text" in result
      ? String((result as { text?: unknown }).text || "").length
      : undefined;
    const recordLike = typeof result === "object" && result !== null ? result as { success?: unknown; error?: unknown } : undefined;
    const succeeded = recordLike?.success === false || (typeof recordLike?.error === "string" && recordLike.error.trim().length > 0) ? false : true;
    session.complete({ succeeded, outputCharacters });
    return result;
  } catch (error) {
    session.complete({ succeeded: false, error });
    throw error;
  }
}

export interface AiRequestLedgerAccountingSummary {
  /** Number of distinct logical action IDs that are authoritative. */
  logicalActionCount: number;
  /** Sum of provider attempts across authoritative and unknown rows. */
  physicalProviderAttemptCount: number;
  /** Rows from before logical lineage was recorded; never heuristically grouped. */
  logicalGroupingUnknownRows: number;
  /** Physical attempts beyond one attempt per known logical action. */
  fallbackAttemptCount: number;
  fallbackAttemptRate?: number;
  physicalAttemptsPerLogicalAction?: number;
}

/**
 * Aggregate only explicit logicalActionId groups. Legacy rows without the
 * additive field remain visible as unknown and are never paired by timestamp,
 * model, array position, or reason text.
 */
export function aggregateAiRequestLedgerAccounting(
  records: readonly AiRequestEnvelope[],
): AiRequestLedgerAccountingSummary {
  const logicalActionIds = new Set<string>();
  let physicalProviderAttemptCount = 0;
  let knownLogicalPhysicalAttempts = 0;
  let logicalGroupingUnknownRows = 0;
  for (const record of records) {
    const logicalActionId = typeof record.logicalActionId === "string" && record.logicalActionId.trim()
      ? record.logicalActionId.trim()
      : undefined;
    const attempts = Math.max(0, Math.floor(Number(record.providerRequestCount) || 0));
    if (logicalActionId) {
      logicalActionIds.add(logicalActionId);
      knownLogicalPhysicalAttempts += attempts;
    } else logicalGroupingUnknownRows += 1;
    physicalProviderAttemptCount += attempts;
  }
  const logicalActionCount = logicalActionIds.size;
  const fallbackAttemptCount = Math.max(0, knownLogicalPhysicalAttempts - logicalActionCount);
  return {
    logicalActionCount,
    physicalProviderAttemptCount,
    logicalGroupingUnknownRows,
    fallbackAttemptCount,
    ...(logicalActionCount > 0
      ? {
        fallbackAttemptRate: fallbackAttemptCount / logicalActionCount,
        physicalAttemptsPerLogicalAction: physicalProviderAttemptCount / logicalActionCount,
      }
      : {}),
  };
}
