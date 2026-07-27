import type { ImageApiPreset, ImageApiProtocol } from "../../../types";

export function inferImageProtocol(model: string, endpoint = "", fallback?: ImageApiProtocol): ImageApiProtocol {
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel.startsWith("gemini-")) return "gemini-native-image";
  if (normalizedModel.startsWith("imagen-")) return "imagen-text";
  if (/generativelanguage|googleapis/i.test(endpoint)) return "gemini-native-image";
  return fallback || "openai-images";
}

export function inferGeminiImageAuthMode(endpoint: string): "x-goog-api-key" | "bearer" {
  return /generativelanguage|googleapis/i.test(endpoint) ? "x-goog-api-key" : "bearer";
}

export function supportsReferenceImageForModel(protocol: ImageApiProtocol, model: string): boolean {
  if (protocol === "openai-images") return true;
  return protocol === "gemini-native-image" && /^gemini-[\w.-]*image/i.test(model.trim());
}

export const resolveImageProtocol = (preset: Pick<ImageApiPreset, "protocol">): ImageApiProtocol => {
  if (!preset.protocol) return "openai-images";
  if (preset.protocol === "openai-images" || preset.protocol === "gemini-native-image" || preset.protocol === "imagen-text") return preset.protocol;
  return "openai-images";
};

export function imageProtocolCapabilities(preset: Pick<ImageApiPreset, "protocol" | "referenceImageSupported">) {
  const protocol = resolveImageProtocol(preset);
  if (protocol === "openai-images") return { label: "OpenAI Images Compatible", supportsReferenceImage: true, authModes: ["Bearer API Key"] };
  if (protocol === "gemini-native-image") return { label: "Gemini Native Image", supportsReferenceImage: preset.referenceImageSupported === true, authModes: ["x-goog-api-key", "Authorization: Bearer"] };
  return { label: "Imagen text-to-image", supportsReferenceImage: false, authModes: ["Bearer API Key"] };
}

export function assertReferenceImageCapability(preset: ImageApiPreset, hasReferenceImage: boolean): void {
  if (hasReferenceImage && !imageProtocolCapabilities(preset).supportsReferenceImage) {
    throw new Error("当前图片模型不支持参考图，请更换支持角色参考图的图片模型。");
  }
}
