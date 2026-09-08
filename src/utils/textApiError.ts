export type TextApiErrorCode =
  | "configuration"
  | "provider_auth"
  | "provider_rate_limit"
  | "provider_safety"
  | "context_too_large"
  | "provider_request"
  | "provider_unavailable"
  | "provider_empty"
  | "provider_invalid_response"
  | "timeout"
  | "network"
  | "aborted"
  | "unknown";

export interface TextApiErrorDetails {
  code: TextApiErrorCode;
  message: string;
  reason?: string;
}

const SAFETY_PATTERN = /PROHIBITED_CONTENT|content[_ -]?filter|content[_ -]?safety|prompt[_ -]?blocked|safety|harmful|unsafe|policy|responsible\s*ai|内容安全|安全策略|内容被拦截|请求被拦截/iu;
const CREDENTIAL_PATTERN = /api[_ -]?key|authentication|unauthorized|invalid[_ -]?(?:key|credential)|quota|billing|余额不足|权限不足/iu;
const CONTEXT_PATTERN = /context[_ -]?(?:length|window)|max[_ -]?tokens?|token[_ -]?limit|too[_ -]?long|prompt[_ -]?too[_ -]?large|输入过长|上下文(?:太长|过长|超出)|令牌数量/iu;
const KNOWN_CODES = new Set<TextApiErrorCode>([
  "configuration", "provider_auth", "provider_rate_limit", "provider_safety", "context_too_large", "provider_request",
  "provider_unavailable", "provider_empty", "provider_invalid_response", "timeout", "network", "aborted", "unknown",
]);

/** Remove credentials that a provider may accidentally echo in an error body. */
export function redactTextApiError(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
    .replace(/(?:api[_-]?key|key|token|authorization)\s*[=:]\s*["']?[^\s,"'}]+/giu, "$1=[REDACTED]")
    .replace(/\s+/gu, " ")
    .trim();
}

export function classifyTextApiErrorCode(status?: number, message = "", reason = ""): TextApiErrorCode {
  const source = `${reason} ${message}`;
  if (SAFETY_PATTERN.test(source)) return "provider_safety";
  if (CREDENTIAL_PATTERN.test(source)) return "provider_auth";
  if (CONTEXT_PATTERN.test(source)) return "context_too_large";
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 408 || status === 413 || status === 422) return "provider_request";
  if (status === 429) return "provider_rate_limit";
  if (typeof status === "number" && status >= 500) return "provider_unavailable";
  if (status && status >= 400) return "provider_request";
  return "unknown";
}

function readProviderMessage(parsed: any, fallback: string): string {
  const candidates = [
    parsed?.detail,
    parsed?.error?.message,
    typeof parsed?.error === "string" ? parsed.error : undefined,
    parsed?.message,
    parsed?.statusMessage,
  ];
  const message = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return redactTextApiError(String(message || fallback));
}

export function parseTextApiErrorPayload(raw: string, status?: number): TextApiErrorDetails {
  const trimmed = raw.trim();
  let parsed: any;
  if (trimmed) {
    try { parsed = JSON.parse(trimmed); } catch { parsed = undefined; }
  }
  const fallback = trimmed || "服务商未返回错误详情。";
  const reason = typeof parsed?.reason === "string"
    ? parsed.reason
    : typeof parsed?.promptFeedback?.blockReason === "string"
      ? parsed.promptFeedback.blockReason
      : typeof parsed?.candidates?.[0]?.finishReason === "string"
        ? parsed.candidates[0].finishReason
        : typeof parsed?.code === "string" ? parsed.code : "";
  const message = readProviderMessage(parsed, fallback);
  const providerCode = typeof parsed?.code === "string" && KNOWN_CODES.has(parsed.code as TextApiErrorCode)
    ? parsed.code as TextApiErrorCode
    : undefined;
  return { message, reason: reason || undefined, code: providerCode || classifyTextApiErrorCode(status, message, reason) };
}

export function emptyTextApiErrorDetails(status = 502, reason = ""): TextApiErrorDetails {
  const message = reason ? `服务商未返回文本：${redactTextApiError(reason)}` : "服务商返回成功，但没有可用的文本内容。";
  return { message, reason: reason || undefined, code: reason && SAFETY_PATTERN.test(reason) ? "provider_safety" : "provider_empty" };
}
