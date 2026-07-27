import type { Character, ImageApiPreset, ImageGenerationRecord, Message, UserSettings } from "../../../types";
import type { CharacterRelationship } from "../../../domain/relationship/characterRelationship";
import { buildCharacterImagePrompt } from "../../../domain/prompt/characterImagePrompt";
import { assertImageGenerationTrigger } from "./imageGenerationIntent";
import { imageAssetDb } from "../../../utils/imageAssetDb";

type ImageScope =
  | { kind: "direct"; relationId: string; conversationId: string }
  | { kind: "group"; groupId: string; conversationId: string };

function activePreset(settings: UserSettings): ImageApiPreset | undefined {
  return settings.imageApiPresets?.find((preset) => preset.id === settings.activeImageApiPresetId);
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
  if (!input.settings.enableImageGeneration || !input.character.enableImageGeneration) {
    throw new Error("图片生成未开启：请同时开启全局图片生成和该角色的图片生成开关。");
  }
  const preset = activePreset(input.settings);
  if (!preset?.apiEndpoint.trim() || !preset.apiKey.trim() || !preset.selectedModel.trim()) {
    throw new Error("请先在“图片 API 设置”中完成 OpenAI Images compatible 配置。");
  }

  const reference = input.character.imageReferenceAssetId
    ? await imageAssetDb.getImage(input.character.imageReferenceAssetId)
    : null;
  const response = await fetch("/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: preset.apiKey,
      apiEndpoint: preset.apiEndpoint,
      model: preset.selectedModel,
      prompt: buildCharacterImagePrompt({ ...input, userRequest: input.userText }),
      trigger: input.trigger,
      userText: input.userText,
      ...(reference ? { referenceImage: { mimeType: reference.type || input.character.imageReferenceMimeType || "image/png", base64: await blobToBase64(reference) } } : {}),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:image/")) {
    throw new Error(data.error || "图片 API 未返回可保存的图片结果。");
  }

  const messageId = input.createId();
  const imageAssetId = `generated-image-${messageId}`;
  const imageBlob = dataUrlToBlob(data.dataUrl);
  await imageAssetDb.saveImage(imageAssetId, imageBlob);
  const timestamp = Date.now();
  const common = {
    id: messageId,
    characterId: input.character.id,
    sender: "character" as const,
    content: "[图片]",
    imageAssetId,
    imageMimeType: imageBlob.type,
    imageSource: "generated" as const,
    timestamp,
  };
  const message: Message = input.scope.kind === "direct"
    ? { ...common, relationId: input.scope.relationId, conversationId: input.scope.conversationId }
    // Group Message.characterId remains the group container. senderId retains
    // the canonical character who generated the image.
    : { ...common, characterId: input.scope.groupId, senderId: input.character.id, conversationId: input.scope.conversationId };
  const record: ImageGenerationRecord = input.scope.kind === "direct"
    ? { id: `image-record-${messageId}`, messageId, characterId: input.character.id, relationId: input.scope.relationId, conversationId: input.scope.conversationId, imageAssetId, trigger: input.trigger, createdAt: timestamp }
    : { id: `image-record-${messageId}`, messageId, characterId: input.character.id, groupId: input.scope.groupId, conversationId: input.scope.conversationId, imageAssetId, trigger: input.trigger, createdAt: timestamp };
  return { message, record };
}
