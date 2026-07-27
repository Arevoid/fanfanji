import type { GeminiImageAuthMode, ImageApiProtocol } from "../types";

export interface ImageProxyRequest {
  protocol?: ImageApiProtocol;
  geminiAuthMode?: GeminiImageAuthMode;
  referenceImageSupported?: boolean;
  apiKey: string;
  apiEndpoint: string;
  model: string;
  prompt: string;
  referenceImage?: { mimeType?: string; base64?: string };
}

export type ImageConnectionTestResult = { success: boolean; message: string; kind: "model-list" | "image-path" | "manual-model" | "unverified" };

export class ImageApiError extends Error {
  constructor(public readonly status: number | undefined, public readonly code: string, message: string) {
    super(message);
  }
}

export const resolveServerImageProtocol = (protocol?: ImageApiProtocol): ImageApiProtocol => {
  if (!protocol) return "openai-images";
  if (protocol === "openai-images" || protocol === "gemini-native-image" || protocol === "imagen-text") return protocol;
  throw new Error(`不支持的图片 API 协议：${String(protocol)}。`);
};
const cleanBase = (endpoint: string) => endpoint.trim().replace(/\/+$/, "");
const modelName = (model: string) => model.replace(/^models\//, "").trim();
export const baseFor = (endpoint: string, protocol: ImageApiProtocol) => {
  const base = cleanBase(endpoint);
  if (protocol === "openai-images") return base.replace(/\/(?:images\/(?:generations|edits)|chat\/completions)$/, "");
  return base.replace(/\/models(?:\/[^/]+(?::(?:generateContent|predict))?)?$/, "");
};

export const protocolSupportsReferenceImage = (input: Pick<ImageProxyRequest, "protocol" | "referenceImageSupported">) =>
  resolveServerImageProtocol(input.protocol) === "openai-images" || (resolveServerImageProtocol(input.protocol) === "gemini-native-image" && input.referenceImageSupported === true);

function headersFor(protocol: ImageApiProtocol, apiKey: string, authMode?: GeminiImageAuthMode): Record<string, string> {
  if (protocol === "gemini-native-image" && authMode === "x-goog-api-key") return { "x-goog-api-key": apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

async function errorSummary(response: Response): Promise<string> {
  const text = (await response.text()).replace(/(?:Bearer\s+|api[_-]?key["'\s:=]+)[^\s,"'}]+/gi, "$1[REDACTED]").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : "无响应摘要";
}

function statusMessage(status: number, action: "model-list" | "image-path" | "generation", summary: string): string {
  if (action === "model-list") {
    if (status === 401) return "模型列表认证失败：请检查 API Key 是否正确或是否已启用。";
    if (status === 403) return "当前 API Key 没有读取模型列表的权限。";
    if (status === 404 || status === 405) return "未能读取模型列表，可手动填写服务商提供的图片模型名称。";
    if (status === 429) return "读取模型列表过于频繁或额度受限，请稍后重试。";
    if (status >= 500) return "图片服务暂时异常，无法读取模型列表，请稍后重试。";
    return `读取模型列表失败（HTTP ${status}）：${summary}`;
  }
  if (action === "image-path") {
    if (status === 401) return "图片接口认证失败：请检查 API Key 是否正确或是否已启用。";
    if (status === 403) return "当前 API Key 没有使用图片模型的权限。";
    if (status === 404 || status === 405) return "当前服务未开放该图片模型的安全查询接口，无法在不生成图片的情况下验证图片能力。";
    if (status === 429) return "图片服务当前请求受限，请稍后重试。";
    if (status >= 500) return "图片服务暂时异常，请稍后重试。";
    return `图片接口验证失败（HTTP ${status}）：${summary}`;
  }
  if (status === 401) return "API Key 无效、未启用，或未被图片服务接受。";
  if (status === 403) return "当前 API Key 没有图片模型权限。";
  if (status === 404 || status === 405) return "当前中转站不支持 Gemini 图片接口路径，请联系服务商确认 Gemini 图片 API 路径。";
  if (status === 429) return "图片额度不足或请求过于频繁，请稍后重试。";
  if (status >= 500) return "中转站或上游图片服务暂时异常，请稍后重试。";
  if (status === 400 && /model|模型|support|图片/i.test(summary)) return "当前模型不支持图片生成，请确认服务商提供的图片模型名称。";
  return `图片生成请求失败（HTTP ${status}）：${summary}`;
}

async function ensureOk(response: Response, action: "model-list" | "image-path" | "generation"): Promise<void> {
  if (response.ok) return;
  const summary = await errorSummary(response);
  throw new ImageApiError(response.status, action, statusMessage(response.status, action, summary));
}

export function parseImageModels(data: any): string[] {
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
  return list.map((item: any) => typeof item === "string" ? item : item?.id || item?.name || item?.model).filter(Boolean).map((model: string) => model.replace(/^models\//, ""));
}

export async function fetchImageModels(input: Pick<ImageProxyRequest, "protocol" | "geminiAuthMode" | "apiKey" | "apiEndpoint">): Promise<string[]> {
  const protocol = resolveServerImageProtocol(input.protocol);
  if (!input.apiKey?.trim() || !input.apiEndpoint?.trim()) throw new Error("请填写图片 API 地址与 API Key。");
  const response = await fetch(`${baseFor(input.apiEndpoint, protocol)}/models`, { headers: headersFor(protocol, input.apiKey.trim(), input.geminiAuthMode) });
  await ensureOk(response, "model-list");
  const models = parseImageModels(await response.json());
  if (!models.length) throw new ImageApiError(200, "model-list-format", "模型列表响应格式不可识别；可手动填写服务商提供的图片模型名称。");
  return models;
}

export async function testImageConnectionWithProtocol(input: ImageProxyRequest): Promise<ImageConnectionTestResult> {
  const protocol = resolveServerImageProtocol(input.protocol);
  if (!input.apiKey?.trim() || !input.apiEndpoint?.trim() || !input.model?.trim()) {
    throw new ImageApiError(undefined, "configuration", "请填写图片 API 地址、API Key 和图片模型。");
  }
  const base = baseFor(input.apiEndpoint, protocol);
  const headers = headersFor(protocol, input.apiKey.trim(), input.geminiAuthMode);
  if (protocol === "openai-images") {
    try {
      const models = await fetchImageModels(input);
      return { success: true, kind: "model-list", message: models.includes(modelName(input.model)) ? "模型列表已读取，已找到当前图片模型。" : "模型列表已读取；当前模型未在列表中，但可按服务商说明手动使用。" };
    } catch (error) {
      if (error instanceof ImageApiError && (error.status === 404 || error.status === 405 || error.code === "model-list-format")) {
        return { success: true, kind: "manual-model", message: "模型列表不可用，可手动填写模型；实际图片能力将在首次生成时确认。" };
      }
      throw error;
    }
  }
  const response = await fetch(`${base}/models/${encodeURIComponent(modelName(input.model))}`, { headers });
  if (!response.ok) {
    const summary = await errorSummary(response);
    if (response.status === 404 || response.status === 405) {
      return { success: true, kind: "manual-model", message: "认证已由代理转发，但服务未开放安全模型查询接口；实际图片能力将在首次生成时确认。" };
    }
    throw new ImageApiError(response.status, "image-path", statusMessage(response.status, "image-path", summary));
  }
  return { success: true, kind: "image-path", message: "认证和图片接口路径已验证；实际图片能力将在首次生成时确认。" };
}

async function urlToDataUrl(value: { b64_json?: string; url?: string }) {
  if (value.b64_json) return `data:image/png;base64,${value.b64_json}`;
  if (!value.url) throw new Error("图片响应中没有可解析的图像数据。");
  const response = await fetch(value.url);
  if (!response.ok) throw new Error(`无法下载图片 API 返回的 URL (${response.status})。`);
  return `data:${response.headers.get("content-type") || "image/png"};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

type GeminiInlineImage = { mimeType?: string; mime_type?: string; data?: string };

function geminiResponseShape(payload: any): string {
  const parts = payload?.candidates?.flatMap((candidate: any) => candidate?.content?.parts || []) || [];
  const partKeys = [...new Set(parts.flatMap((part: any) => part && typeof part === "object" ? Object.keys(part) : []))].slice(0, 8);
  return partKeys.length ? `候选内容字段：${partKeys.join(", ")}` : "未发现候选图片字段";
}

function inlineDataToUrl(inlineData: GeminiInlineImage | undefined, payload?: any): string {
  if (!inlineData?.data) {
    const rootKeys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 8).join(", ") : "无可用字段";
    const shape = geminiResponseShape(payload);
    throw new ImageApiError(200, "missing-image-data", `当前图片模型只返回了文字，未输出图片数据。请确认中转站已为该模型开启图片输出，并使用支持图片生成的模型（响应字段：${rootKeys}；${shape}）。`);
  }
  return `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`;
}

function findGeminiInlineImage(payload: any): GeminiInlineImage | undefined {
  const parts = payload?.candidates?.flatMap((candidate: any) => candidate?.content?.parts || []) || [];
  return parts.map((part: any) => part?.inlineData || part?.inline_data).find((value: GeminiInlineImage | undefined) => Boolean(value?.data));
}

export async function generateImageWithProtocol(input: ImageProxyRequest): Promise<string> {
  const protocol = resolveServerImageProtocol(input.protocol);
  if (!input.apiKey?.trim() || !input.apiEndpoint?.trim() || !input.model?.trim() || !input.prompt?.trim()) throw new Error("图片 API 配置、模型或提示词不完整。");
  if (input.referenceImage?.base64 && !protocolSupportsReferenceImage(input)) throw new Error(`${protocol} 当前模型未确认支持参考图输入；不会忽略参考图或降级生成。`);
  const reference = input.referenceImage?.base64;
  if (reference && Buffer.from(reference, "base64").byteLength > 8 * 1024 * 1024) throw new Error("参考图超过 8MB 限制。");
  const base = baseFor(input.apiEndpoint, protocol);
  const model = modelName(input.model);

  if (protocol === "openai-images") {
    let response: Response;
    if (reference) {
      const form = new FormData(); form.append("model", model); form.append("prompt", input.prompt);
      form.append("image", new Blob([Buffer.from(reference, "base64")], { type: input.referenceImage?.mimeType || "image/png" }), "character-reference");
      form.append("input_fidelity", "high");
      response = await fetch(`${base}/images/edits`, { method: "POST", headers: headersFor(protocol, input.apiKey.trim()), body: form });
    } else {
      response = await fetch(`${base}/images/generations`, { method: "POST", headers: { ...headersFor(protocol, input.apiKey.trim()), "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: input.prompt, n: 1, size: "1024x1024" }) });
    }
    await ensureOk(response, "generation");
    return urlToDataUrl((await response.json())?.data?.[0] || {});
  }

  if (protocol === "gemini-native-image") {
    const parts: any[] = [{ text: input.prompt }];
    if (reference) parts.push({ inlineData: { mimeType: input.referenceImage?.mimeType || "image/png", data: reference } });
    const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { ...headersFor(protocol, input.apiKey.trim(), input.geminiAuthMode), "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
    });
    await ensureOk(response, "generation");
    const payload = await response.json();
    return inlineDataToUrl(findGeminiInlineImage(payload), payload);
  }

  if (reference) throw new Error("Imagen text-to-image 第一版不支持角色参考图或编辑。");
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:predict`, {
    method: "POST", headers: { ...headersFor(protocol, input.apiKey.trim()), "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt: input.prompt }], parameters: { sampleCount: 1 } }),
  });
  await ensureOk(response, "generation");
  const prediction = (await response.json())?.predictions?.[0] || {};
  if (prediction.bytesBase64Encoded) return `data:${prediction.mimeType || "image/png"};base64,${prediction.bytesBase64Encoded}`;
  return urlToDataUrl(prediction);
}
