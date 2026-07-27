import assert from "node:assert/strict";
import { buildCharacterImagePrompt } from "../src/domain/prompt/characterImagePrompt";
import { assertReferenceImageCapability, imageProtocolCapabilities, resolveImageProtocol } from "../src/features/chat/services/imageProtocol";

const prompt = buildCharacterImagePrompt({
  character: { id: "char", name: "祁澈", avatar: "", personality: "冷静", backstory: "", imageAppearancePrompt: "黑发，白衬衫", imageNegativePrompt: "水印" },
  relationship: { id: "rel-a", characterId: "char", userIdentityId: "user-a", conversationId: "direct:rel-a", relationship: "partner", createdAt: 1, updatedAt: 1 },
  recentMessages: [{ id: "m", characterId: "char", relationId: "rel-a", sender: "user", content: "给我发张照片", timestamp: 1 }],
  userRequest: "给我发张照片",
});
assert.match(prompt, /黑发，白衬衫/);
assert.match(prompt, /Avoid: 水印/);
assert.match(prompt, /Current relationship context only: partner/);
assert.equal(resolveImageProtocol({ protocol: undefined }), "openai-images", "old presets remain compatible");
assert.equal(imageProtocolCapabilities({ protocol: "openai-images" }).supportsReferenceImage, true);
assert.equal(imageProtocolCapabilities({ protocol: "gemini-native-image", referenceImageSupported: false }).supportsReferenceImage, false);
assert.equal(imageProtocolCapabilities({ protocol: "imagen-text" }).supportsReferenceImage, false);
assert.throws(() => assertReferenceImageCapability({ id: "p", name: "Gemini", protocol: "gemini-native-image", apiEndpoint: "x", apiKey: "y", selectedModel: "z", referenceImageSupported: false }, true));
assert.throws(() => assertReferenceImageCapability({ id: "p", name: "Imagen", protocol: "imagen-text", apiEndpoint: "x", apiKey: "y", selectedModel: "z" }, true));
console.log("imageApiPayload.test passed");
