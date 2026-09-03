import {
  prepareGeminiPromptTransport,
  prepareOpenAiPromptTransport,
  toGeminiHistoryEntry,
  toOpenAiHistoryEntry,
  type TransportHistoryEntry,
} from "../domain/prompt/promptTransport";
import { API_REQUEST_TIMEOUTS, describeApiRequestError, fetchWithTimeout, isApiRequestError } from "../utils/fetchWithTimeout";
import { emptyTextApiErrorDetails, parseTextApiErrorPayload, redactTextApiError, type TextApiErrorCode } from "../utils/textApiError";

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
  imageDataUrl?: string;
}

const openAiEndpoint = (value: string): string => {
  const endpoint = value.trim();
  return endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint.replace(/\/+$/, "")}/chat/completions`;
};

const openAiBase = (value: string): string => value.trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");

const parseOpenAiText = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:") || trimmed.includes("\ndata:")) {
    let result = "";
    for (const sourceLine of trimmed.split("\n")) {
      const line = sourceLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload);
        result += chunk.choices?.[0]?.delta?.content
          || chunk.choices?.[0]?.message?.content
          || chunk.choices?.[0]?.text
          || "";
      } catch {
        // Ignore malformed keep-alive chunks while preserving valid content.
      }
    }
    return result;
  }
  try {
    const parsed = JSON.parse(trimmed);
    const content = parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text;
    if (Array.isArray(content)) {
      return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
    }
    return typeof content === "string" ? content : "";
  } catch {
    return trimmed;
  }
};

export async function callTextProvider(input: TextProviderInput): Promise<string> {
  const apiKey = input.apiKey?.trim();
  const model = input.model?.trim();
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
      }),
    }, API_REQUEST_TIMEOUTS.textGeneration);
    const raw = await response.text();
    if (!response.ok) {
      const details = parseTextApiErrorPayload(raw, response.status);
      throw new TextApiError(response.status, details.message, details.code, details.reason);
    }
    const text = parseOpenAiText(raw);
    if (!text.trim()) {
      const details = emptyTextApiErrorDetails();
      throw new TextApiError(502, details.message, details.code, details.reason);
    }
    return text;
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
      generationConfig: { temperature: input.temperature ?? 0.7 },
      ...(prompt.systemInstruction ? { systemInstruction: { parts: [{ text: prompt.systemInstruction }] } } : {}),
    }),
  }, API_REQUEST_TIMEOUTS.textGeneration);
  const raw = await response.text();
  if (!response.ok) {
    const details = parseTextApiErrorPayload(raw, response.status);
    throw new TextApiError(response.status, details.message, details.code, details.reason);
  }
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { throw new TextApiError(502, "Gemini 返回了无法解析的响应。", "provider_invalid_response"); }
  const text = parsed.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("") || "";
  if (!text.trim()) {
    const reason = parsed.candidates?.[0]?.finishReason || parsed.promptFeedback?.blockReason;
    const details = emptyTextApiErrorDetails(502, reason || "");
    throw new TextApiError(502, details.message, details.code, details.reason);
  }
  return text;
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
  const raw = await response.text();
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
