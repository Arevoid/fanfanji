import type { Character, ImageApiPreset, ImageGenerationRecord, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { buildCharacterImagePrompt } from "../../../domain/prompt/characterImagePrompt";
import { assertImageGenerationTrigger } from "./imageGenerationIntent";
import { assertReferenceImageCapability, inferGeminiImageAuthMode, inferImageProtocol, supportsReferenceImageForModel } from "./imageProtocol";
import { imageAssetDb } from "../../../utils/imageAssetDb";

type ImageScope =
  | { kind: "direct"; relationId: string; conversationId: string }
  | { kind: "group"; groupId: string; conversationId: string };

function activePreset(settings: UserSettings): ImageApiPreset | undefined {
  return settings.imageApiPresets?.find((preset) => preset.id === settings.activeImageApiPresetId);
}

export function assertImageGenerationConfiguration(settings: UserSettings, character: Character): ImageApiPreset {
  if (!settings.enableImageGeneration || !character.enableImageGeneration) {
    throw new Error("图片生成未启用：请同时开启全局图片生成和该角色的图片生成开关。");
  }
  const preset = activePreset(settings);
  if (!preset?.selectedModel?.trim()) throw new Error("请先选择或输入图片模型。");
  if (!preset.apiEndpoint.trim() || !preset.apiKey.trim()) throw new Error("图片 API 配置不完整：请填写地址和 API Key。");
  return preset;
}

export function createGeneratedImageMessages(input: {
  messageId: string;
  characterId: string;
  imageAssetId: string;
  imageMimeType: string;
  trigger: "manual" | "explicit-user-text";
  scope: ImageScope;
  timestamp: number;
}): { message: Message; record: ImageGenerationRecord } {
  const common = { id: input.messageId, characterId: input.characterId, sender: "character" as const, content: "[图片]", imageAssetId: input.imageAssetId, imageMimeType: input.imageMimeType, imageSource: "generated" as const, timestamp: input.timestamp };
  const message: Message = input.scope.kind === "direct"
    ? { ...common, relationId: input.scope.relationId, conversationId: input.scope.conversationId }
    : { ...common, characterId: input.scope.groupId, senderId: input.characterId, conversationId: input.scope.conversationId };
  const record: ImageGenerationRecord = input.scope.kind === "direct"
    ? { id: `image-record-${input.messageId}`, messageId: input.messageId, characterId: input.characterId, relationId: input.scope.relationId, conversationId: input.scope.conversationId, imageAssetId: input.imageAssetId, trigger: input.trigger, createdAt: input.timestamp }
    : { id: `image-record-${input.messageId}`, messageId: input.messageId, characterId: input.characterId, groupId: input.scope.groupId, conversationId: input.scope.conversationId, imageAssetId: input.imageAssetId, trigger: input.trigger, createdAt: input.timestamp };
  return { message, record };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(value: string): Blob {
  const [header, body] = value.split(",", 2);
  const mimeType = header.match(/^data:([^;]+);base64$/)?.[1] || "image/png";
  const bytes = Uint8Array.from(atob(body || ""), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export async function generateCharacterImage(input: {
  settings: UserSettings;
  character: Character;
  relationship?: CharacterRelationship;
  recentMessages: readonly Message[];
  scope: ImageScope;
  trigger: "manual" | "explicit-user-text";
  userText: string;
  createId: () => string;
}): Promise<{ message: Message; record: ImageGenerationRecord }> {
  assertImageGenerationTrigger(input.trigger, input.userText);
  const preset = assertImageGenerationConfiguration(input.settings, input.character);

  const reference = input.character.imageReferenceAssetId
    ? await imageAssetDb.getImage(input.character.imageReferenceAssetId)
    : null;
  const protocol = inferImageProtocol(preset.selectedModel, preset.apiEndpoint, preset.protocol);
  const referenceImageSupported = supportsReferenceImageForModel(protocol, preset.selectedModel);
  assertReferenceImageCapability({ ...preset, protocol, referenceImageSupported }, Boolean(reference));
  const response = await fetch("/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: preset.apiKey,
      apiEndpoint: preset.apiEndpoint,
      model: preset.selectedModel,
      protocol,
      geminiAuthMode: protocol === "gemini-native-image" ? inferGeminiImageAuthMode(preset.apiEndpoint) : undefined,
      referenceImageSupported,
      prompt: buildCharacterImagePrompt({ ...input, userRequest: input.userText }),
      trigger: input.trigger,
      userText: input.userText,
      ...(reference ? { referenceImage: { mimeType: reference.type || input.character.imageReferenceMimeType || "image/png", base64: await blobToBase64(reference) } } : {}),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) {
    throw new Error("图片生成失败，请检查图片服务配置和所选模型后重试。");
  }

  const messageId = input.createId();
  const imageAssetId = `generated-image-${messageId}`;
  const imageBlob = dataUrlToBlob(data.dataUrl);
  await imageAssetDb.saveImage(imageAssetId, imageBlob);
  return createGeneratedImageMessages({ messageId, characterId: input.character.id, imageAssetId, imageMimeType: imageBlob.type, trigger: input.trigger, scope: input.scope, timestamp: Date.now() });
}
