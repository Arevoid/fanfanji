export type ApiRequestErrorKind = "timeout" | "network" | "aborted";

export class ApiRequestError extends Error {
  readonly kind: ApiRequestErrorKind;
  readonly timeoutMs?: number;

  constructor(kind: ApiRequestErrorKind, message: string, options?: { timeoutMs?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ApiRequestError";
    this.kind = kind;
    this.timeoutMs = options?.timeoutMs;
  }
}

export const API_REQUEST_TIMEOUTS = {
  connectionTest: 20_000,
  modelList: 30_000,
  textGeneration: 90_000,
  memoryTask: 90_000,
  imageGeneration: 120_000,
  speechSynthesis: 60_000,
  remoteAsset: 30_000,
} as const;

export const isApiRequestError = (error: unknown, kind?: ApiRequestErrorKind): error is ApiRequestError =>
  error instanceof ApiRequestError && (!kind || error.kind === kind);

export function describeApiRequestError(error: unknown, label = "API"): string {
  if (isApiRequestError(error, "timeout")) {
    const seconds = Math.max(1, Math.round((error.timeoutMs || 0) / 1000));
    return `${label}请求超时（${seconds} 秒），请检查网络、接口地址或供应商状态。`;
  }
  if (isApiRequestError(error, "aborted")) return `${label}请求已取消。`;
  if (isApiRequestError(error, "network")) return `${label}网络连接失败，请检查网络或接口地址。`;
  return error instanceof Error ? error.message : String(error || `${label}请求失败。`);
}

/** Fetch with a deterministic timeout while preserving caller cancellation. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = API_REQUEST_TIMEOUTS.textGeneration,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;
  let callerAborted = Boolean(callerSignal?.aborted);
  const abortFromCaller = () => {
    callerAborted = true;
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted) {
    throw new ApiRequestError("aborted", "Request was cancelled before it started.");
  }
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new ApiRequestError("timeout", `Request timed out after ${timeoutMs}ms.`, { timeoutMs, cause: error });
    }
    if (callerAborted || callerSignal?.aborted) {
      throw new ApiRequestError("aborted", "Request was cancelled.", { cause: error });
    }
    throw new ApiRequestError("network", "Network request failed.", { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
