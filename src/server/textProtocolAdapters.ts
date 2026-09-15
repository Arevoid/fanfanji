import {
  prepareGeminiPromptTransport,
  prepareOpenAiPromptTransport,
  toGeminiHistoryEntry,
  toOpenAiHistoryEntry,
  type TransportHistoryEntry,
} from "../domain/prompt/promptTransport";
import { API_REQUEST_TIMEOUTS, describeApiRequestError, fetchWithTimeout, isApiRequestError, readResponseTextWithTimeout } from "../utils/fetchWithTimeout";
import { emptyTextApiErrorDetails, parseTextApiErrorPayload, redactTextApiError, type TextApiErrorCode } from "../utils/textApiError";
import {
  emptyStructuredOutputTelemetry,
  textLengthBucket,
  type StructuredOutputContentKind,
  type StructuredOutputFinishReasonKind,
  type StructuredOutputTelemetry,
} from "../features/characterKnowledge/services/structuredOutputTelemetry";

export class TextApiError extends Error {
  constructor(public status: number, message: string, public code: TextApiErrorCode = "unknown", public reason?: string) {
    super(message);
    this.name = "TextApiError";
  }
}

export function normalizeTextApiError(error: unknown, fallbackMessage: string): TextApiError {
  if (error instanceof TextApiError) return error;
  if (isApiRequestError(error, "timeout")) {
    return new TextApiError(504, describeApiRequestError(error, "智能体"), "timeout");
  }
  if (isApiRequestError(error, "aborted")) {
    return new TextApiError(499, describeApiRequestError(error, "智能体"), "aborted");
  }
  if (isApiRequestError(error, "network")) {
    return new TextApiError(503, describeApiRequestError(error, "智能体"), "network");
  }
  const message = redactTextApiError(error instanceof Error && error.message ? error.message : fallbackMessage);
  return new TextApiError(502, message, "unknown");
}

export interface TextProviderInput {
  message: string;
  history?: readonly TransportHistoryEntry[];
  systemInstruction?: string;
  apiKey: string;
  model: string;
  apiEndpoint?: string;
  temperature?: number;
  streamCompatible?: boolean;
  /** Caller-specific timeout; bounded to keep proxy requests reasonable. */
  timeoutMs?: number;
  /** Maximum provider output tokens for workflows that intentionally generate in segments. */
  maxOutputTokens?: number;
  imageDataUrl?: string;
  /** Extraction may legitimately return an empty candidate set. */
  allowEmptyText?: boolean;
}

function resolveTextGenerationTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return API_REQUEST_TIMEOUTS.textGeneration;
  return Math.min(180_000, Math.max(10_000, Math.floor(timeoutMs)));
}

const openAiEndpoint = (value: string): string => {
  const endpoint = value.trim();
  return endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint.replace(/\/+$/, "")}/chat/completions`;
};

const openAiBase = (value: string): string => value.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");

const finishReasonKind = (value: unknown): StructuredOutputFinishReasonKind => {
  if (typeof value !== "string" || !value.trim()) return "missing";
  const normalized = value.trim().toLowerCase();
  if (normalized === "stop") return "stop";
  if (normalized === "length" || normalized === "max_tokens") return "length";
  if (normalized === "content_filter" || normalized === "content-filter") return "content_filter";
  if (normalized === "tool_calls" || normalized === "tool_call") return "tool_call";
  return "other";
};

const contentKind = (value: unknown): { kind: StructuredOutputContentKind; count: number } => {
  if (typeof value === "string") return { kind: "string", count: 0 };
  if (!Array.isArray(value)) return value === undefined ? { kind: "missing", count: 0 } : { kind: "unknown", count: 0 };
  const parts = value.slice(0, 64);
  if (parts.length === 0) return { kind: "text_parts", count: 0 };
  const textParts = parts.map((part) => typeof part === "string" || (part && typeof part === "object" && typeof (part as any).text === "string"));
  return {
    kind: textParts.every(Boolean) ? "text_parts" : textParts.some(Boolean) ? "mixed_parts" : "unknown",
    count: parts.length,
  };
};

export function parseOpenAiTextWithTelemetry(raw: string): { text: string; structuredOutputTelemetry: StructuredOutputTelemetry } {
  const trimmed = raw.trim();
  let result = "";
  let observedContent: StructuredOutputContentKind = "missing";
  let contentPartCount = 0;
  let choiceCount = 0;
  let finishReason: StructuredOutputFinishReasonKind = "missing";
  let observedEnvelope: "openai_choices" | "unknown" = "unknown";
  if (trimmed.startsWith("data:") || trimmed.includes("\ndata:")) {
    for (const sourceLine of trimmed.split("\n")) {
      const line = sourceLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload);
        if (Array.isArray(chunk.choices)) {
          observedEnvelope = "openai_choices";
          choiceCount = Math.min(64, choiceCount + chunk.choices.length);
        }
        const choice = chunk.choices?.[0];
        finishReason = finishReasonKind(choice?.finish_reason || choice?.finishReason);
        const content = choice?.delta?.content || choice?.message?.content || choice?.text || "";
        const summary = contentKind(content);
        if (summary.kind !== "missing") observedContent = summary.kind;
        contentPartCount = Math.min(64, contentPartCount + summary.count);
        result += content || "";
      } catch {
        // Ignore malformed keep-alive chunks while preserving valid content.
      }
    }
    return {
      text: result,
      structuredOutputTelemetry: emptyStructuredOutputTelemetry({
        protocolFamily: "openai_compatible", transportOk: true, responseEnvelopeKind: observedEnvelope,
        choiceCount, messageContentKind: observedContent, contentPartCount, textPresent: Boolean(result.trim()),
        textLengthBucket: textLengthBucket(result.length), finishReasonKind: finishReason,
      }),
    };
  }
  try {
    const parsed = JSON.parse(trimmed);
    const hasChoices = Array.isArray(parsed.choices);
    if (hasChoices) observedEnvelope = "openai_choices";
    choiceCount = hasChoices ? Math.min(64, parsed.choices.length) : 0;
    const choice = parsed.choices?.[0];
    finishReason = finishReasonKind(choice?.finish_reason || choice?.finishReason);
    const content = choice?.message?.content ?? choice?.text;
    const summary = contentKind(content);
    observedContent = summary.kind;
    contentPartCount = summary.count;
    if (Array.isArray(content)) {
      result = content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
    } else {
      result = typeof content === "string" ? content : "";
    }
  } catch {
    result = trimmed;
  }
  return {
    text: result,
    structuredOutputTelemetry: emptyStructuredOutputTelemetry({
      protocolFamily: "openai_compatible", transportOk: true,
      responseEnvelopeKind: observedEnvelope,
      choiceCount, messageContentKind: observedContent, contentPartCount, textPresent: Boolean(result.trim()),
      textLengthBucket: textLengthBucket(result.length), finishReasonKind: finishReason,
    }),
  };
}

export function parseGeminiTextWithTelemetry(raw: string): { text: string; structuredOutputTelemetry: StructuredOutputTelemetry } {
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch {
    return {
      text: "",
      structuredOutputTelemetry: emptyStructuredOutputTelemetry({
        protocolFamily: "gemini_native", transportOk: true, responseEnvelopeKind: "unknown",
        failureStage: "envelope", failureReasonCode: "unsupported_envelope",
      }),
    };
  }
  const hasCandidates = Array.isArray(parsed.candidates);
  const candidates = hasCandidates ? parsed.candidates : [];
  const parts = candidates[0]?.content?.parts;
  const summary = contentKind(parts);
  const text = Array.isArray(parts) ? parts.map((part: any) => part?.text || "").join("") : "";
  const finishReason = finishReasonKind(candidates[0]?.finishReason || parsed?.promptFeedback?.blockReason);
  return {
    text,
    structuredOutputTelemetry: emptyStructuredOutputTelemetry({
      protocolFamily: "gemini_native", transportOk: true,
      responseEnvelopeKind: hasCandidates ? "gemini_candidates" : "unknown",
      choiceCount: Math.min(64, candidates.length), messageContentKind: summary.kind,
      contentPartCount: summary.count, textPresent: Boolean(text.trim()), textLengthBucket: textLengthBucket(text.length),
      finishReasonKind: finishReason,
    }),
  };
}

export async function callTextProviderWithDiagnostics(input: TextProviderInput): Promise<{ text: string; structuredOutputTelemetry: StructuredOutputTelemetry }> {
  const apiKey = input.apiKey?.trim();
  const model = input.model?.trim();
  const requestTimeoutMs = resolveTextGenerationTimeout(input.timeoutMs);
  if (!apiKey) throw new TextApiError(400, "请先填写 API Key。", "configuration");
  if (!model) throw new TextApiError(400, "请先选择或填写模型名称。", "configuration");

  if (input.apiEndpoint?.trim()) {
    const prompt = prepareOpenAiPromptTransport(input.history, input.systemInstruction);
    const messages: any[] = [];
    if (prompt.systemInstruction) messages.push({ role: "system", content: prompt.systemInstruction });
    messages.push(...prompt.history.map(toOpenAiHistoryEntry));
    if (prompt.finalSystemInstruction) messages.push({ role: "system", content: prompt.finalSystemInstruction });
    messages.push({ role: "user", content: input.imageDataUrl
      ? [{ type: "text", text: input.message || "请结合这张画面回答。" }, { type: "image_url", image_url: { url: input.imageDataUrl } }]
      : input.message });
    const response = await fetchWithTimeout(openAiEndpoint(input.apiEndpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: input.temperature ?? 0.7,
        stream: input.streamCompatible === true,
        ...(typeof input.maxOutputTokens === "number"
          ? { max_tokens: Math.max(128, Math.floor(input.maxOutputTokens)) }
          : {}),
      }),
    }, requestTimeoutMs);
    const raw = await readResponseTextWithTimeout(response, requestTimeoutMs);
    if (!response.ok) {
      const details = parseTextApiErrorPayload(raw, response.status);
      throw new TextApiError(response.status, details.message, details.code, details.reason);
    }
    const parsedOutput = parseOpenAiTextWithTelemetry(raw);
    const text = parsedOutput.text;
    if (!text.trim() && input.allowEmptyText === true) return parsedOutput;
    if (!text.trim()) {
      const details = emptyTextApiErrorDetails();
      throw new TextApiError(502, details.message, details.code, details.reason);
    }
    return parsedOutput;
  }

  const prompt = prepareGeminiPromptTransport(input.history, input.systemInstruction);
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const entry of prompt.history) {
    const normalized = toGeminiHistoryEntry(entry);
    if (!normalized) continue;
    if (contents.at(-1)?.role === normalized.role) contents.at(-1)!.parts[0].text += `\n${normalized.text}`;
    else contents.push({ role: normalized.role, parts: [{ text: normalized.text }] });
  }
  const imageMatch = input.imageDataUrl?.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (contents.at(-1)?.role === "user") {
    if (input.message) contents.at(-1)!.parts.push({ text: input.message });
    if (imageMatch) contents.at(-1)!.parts.push({ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } } as any);
  } else {
    contents.push({ role: "user", parts: [{ text: input.message || " " }, ...(imageMatch ? [{ inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } } as any] : [])] });
  }
  const cleanModel = model.replace(/^models\//, "");
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.7,
        ...(typeof input.maxOutputTokens === "number"
          ? { maxOutputTokens: Math.max(128, Math.floor(input.maxOutputTokens)) }
          : {}),
      },
      ...(prompt.systemInstruction ? { systemInstruction: { parts: [{ text: prompt.systemInstruction }] } } : {}),
    }),
  }, requestTimeoutMs);
  const raw = await readResponseTextWithTimeout(response, requestTimeoutMs);
  if (!response.ok) {
    const details = parseTextApiErrorPayload(raw, response.status);
    throw new TextApiError(response.status, details.message, details.code, details.reason);
  }
  let parsedPayload: any;
  try { parsedPayload = JSON.parse(raw); } catch {
    throw new TextApiError(502, "Gemini 返回了无法解析的响应。", "provider_invalid_response");
  }
  const parsedOutput = parseGeminiTextWithTelemetry(raw);
  const text = parsedOutput.text;
  if (!text.trim() && input.allowEmptyText === true) return parsedOutput;
  if (!text.trim()) {
    const reason = parsedPayload.candidates?.[0]?.finishReason || parsedPayload.promptFeedback?.blockReason;
    const details = emptyTextApiErrorDetails(502, reason || "");
    throw new TextApiError(502, details.message, details.code, details.reason);
  }
  return parsedOutput;
}

export async function callTextProvider(input: TextProviderInput): Promise<string> {
  return (await callTextProviderWithDiagnostics(input)).text;
}

export async function fetchTextModels(input: { apiKey: string; apiEndpoint?: string }): Promise<string[]> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new TextApiError(400, "请先填写 API Key。", "configuration");
  const url = input.apiEndpoint?.trim()
    ? `${openAiBase(input.apiEndpoint).replace(/\/models$/, "")}/models`
    : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(
    url,
    input.apiEndpoint?.trim() ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined,
    API_REQUEST_TIMEOUTS.modelList,
  );
  const raw = await readResponseTextWithTimeout(response, API_REQUEST_TIMEOUTS.modelList);
  if (!response.ok) {
    const details = parseTextApiErrorPayload(raw, response.status);
    throw new TextApiError(response.status, details.message, details.code, details.reason);
  }
  let data: any;
  try { data = JSON.parse(raw); } catch { throw new TextApiError(502, "模型列表响应无法解析。", "provider_invalid_response"); }
  const source = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
  const models = source.map((item: any) => {
    const value = typeof item === "string" ? item : item?.id || item?.name || item?.model || item?.model_id;
    return typeof value === "string" ? value.replace(/^models\//, "") : "";
  }).filter(Boolean);
  if (!models.length) throw new TextApiError(502, "接口没有返回可用的模型列表。", "provider_empty");
  return models;
}

export function buildTranslationPrompt(text: string, targetLanguage = "zh-CN"): string {
  return `你是专业翻译。请将以下文本忠实翻译成 ${targetLanguage}。保留语气、标点、动作描写以及 [FORUM_TITLE]、[FORUM_BODY]、[DIARY_TITLE]、[DIARY_BODY]、[DIARY_EMOTION] 标记；只输出译文，不要解释。\n\n${text}`;
}
