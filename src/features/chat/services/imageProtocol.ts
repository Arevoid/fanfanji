import type { ImageApiPreset, ImageApiProtocol } from "../../../types";

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
    throw new Error("当前协议或模型未确认支持参考图。请切换到支持图像输入的 Gemini 模型并确认能力，或移除角色参考图后再生成。");
  }
}
