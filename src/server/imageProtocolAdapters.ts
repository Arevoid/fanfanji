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

export const resolveServerImageProtocol = (protocol?: ImageApiProtocol): ImageApiProtocol => {
  if (!protocol) return "openai-images";
  if (protocol === "openai-images" || protocol === "gemini-native-image" || protocol === "imagen-text") return protocol;
  throw new Error(`不支持的图片 API 协议：${String(protocol)}。`);
};
const cleanBase = (endpoint: string) => endpoint.trim().replace(/\/+$/, "");
const modelName = (model: string) => model.replace(/^models\//, "").trim();
const baseFor = (endpoint: string, protocol: ImageApiProtocol) => {
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

export function parseImageModels(data: any): string[] {
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
  return list.map((item: any) => typeof item === "string" ? item : item?.id || item?.name || item?.model).filter(Boolean).map((model: string) => model.replace(/^models\//, ""));
}

export async function fetchImageModels(input: Pick<ImageProxyRequest, "protocol" | "geminiAuthMode" | "apiKey" | "apiEndpoint">): Promise<string[]> {
  const protocol = resolveServerImageProtocol(input.protocol);
  if (!input.apiKey?.trim() || !input.apiEndpoint?.trim()) throw new Error("请填写图片 API 地址与 API Key。");
  const response = await fetch(`${baseFor(input.apiEndpoint, protocol)}/models`, { headers: headersFor(protocol, input.apiKey.trim(), input.geminiAuthMode) });
  if (!response.ok) throw new Error(`${protocol} 模型列表请求失败 (${response.status})：${await response.text()}`);
  const models = parseImageModels(await response.json());
  if (!models.length) throw new Error(`${protocol} 模型列表响应不可识别；不会伪造可用模型。`);
  return models;
}

async function urlToDataUrl(value: { b64_json?: string; url?: string }) {
  if (value.b64_json) return `data:image/png;base64,${value.b64_json}`;
  if (!value.url) throw new Error("图片响应中没有可解析的图像数据。");
  const response = await fetch(value.url);
  if (!response.ok) throw new Error(`无法下载图片 API 返回的 URL (${response.status})。`);
  return `data:${response.headers.get("content-type") || "image/png"};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

function inlineDataToUrl(inlineData: { mimeType?: string; data?: string } | undefined): string {
  if (!inlineData?.data) throw new Error("Gemini 响应中没有 inline image data。");
  return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
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
    if (!response.ok) throw new Error(`OpenAI Images 请求失败 (${response.status})：${await response.text()}`);
    return urlToDataUrl((await response.json())?.data?.[0] || {});
  }

  if (protocol === "gemini-native-image") {
    const parts: any[] = [{ text: input.prompt }];
    if (reference) parts.push({ inlineData: { mimeType: input.referenceImage?.mimeType || "image/png", data: reference } });
    const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { ...headersFor(protocol, input.apiKey.trim(), input.geminiAuthMode), "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
    });
    if (!response.ok) throw new Error(`Gemini Native Image 请求失败 (${response.status})：${await response.text()}`);
    const payload = await response.json();
    const part = payload?.candidates?.flatMap((candidate: any) => candidate?.content?.parts || []).find((item: any) => item?.inlineData?.data);
    return inlineDataToUrl(part?.inlineData);
  }

  if (reference) throw new Error("Imagen text-to-image 第一版不支持角色参考图或编辑。");
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:predict`, {
    method: "POST", headers: { ...headersFor(protocol, input.apiKey.trim()), "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt: input.prompt }], parameters: { sampleCount: 1 } }),
  });
  if (!response.ok) throw new Error(`Imagen text-to-image 请求失败 (${response.status})：${await response.text()}`);
  const prediction = (await response.json())?.predictions?.[0] || {};
  if (prediction.bytesBase64Encoded) return `data:${prediction.mimeType || "image/png"};base64,${prediction.bytesBase64Encoded}`;
  return urlToDataUrl(prediction);
}
