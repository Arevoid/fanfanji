import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCharacterImagePrompt, buildMomentImagePrompt } from "../src/domain/prompt/characterImagePrompt";
import { assertReferenceImageCapability, imageProtocolCapabilities, inferGeminiImageAuthMode, inferImageProtocol, resolveImageProtocol, supportsReferenceImageForModel } from "../src/features/chat/services/imageProtocol";

const prompt = buildCharacterImagePrompt({
  character: { id: "char", name: "祁澈", avatar: "", personality: "冷静", backstory: "", imageAppearancePrompt: "黑发，白衬衫", imageNegativePrompt: "水印" },
  relationship: { id: "rel-a", characterId: "char", userIdentityId: "user-a", conversationId: "direct:rel-a", relationship: "partner", createdAt: 1, updatedAt: 1 },
  recentMessages: [{ id: "m", characterId: "char", relationId: "rel-a", sender: "user", content: "给我发张照片", timestamp: 1 }],
  userRequest: "给我发张照片",
});
assert.match(prompt, /黑发，白衬衫/);
assert.match(prompt, /Avoid: 水印/);
assert.match(prompt, /Current relationship context only: partner/);
const momentPrompt = buildMomentImagePrompt({
  character: { id: "char", name: "祁澈", avatar: "", personality: "冷静", backstory: "", imageAppearancePrompt: "黑发，白衬衫", imageNegativePrompt: "水印" },
  postContent: "今天在雨后的街头散步。",
  imageDescription: "雨后的街道和一盏温暖的路灯",
});
assert.match(momentPrompt, /雨后的街道和一盏温暖的路灯/);
assert.match(momentPrompt, /黑发，白衬衫/);
assert.match(momentPrompt, /Avoid: 水印/);
assert.match(momentPrompt, /do not render this text inside the image/i);
assert.equal(resolveImageProtocol({ protocol: undefined }), "openai-images", "old presets remain compatible");
assert.equal(inferImageProtocol("gemini-2.5-flash-image"), "gemini-native-image");
assert.equal(inferImageProtocol("gemini-3.1-flash-image-preview"), "gemini-native-image");
assert.equal(inferImageProtocol("imagen-3.0-generate"), "imagen-text");
assert.equal(inferImageProtocol("gpt-image-1"), "openai-images");
assert.equal(inferGeminiImageAuthMode("https://service.example/v1"), "bearer");
assert.equal(supportsReferenceImageForModel("gemini-native-image", "gemini-2.5-flash-image"), true);
assert.equal(supportsReferenceImageForModel("imagen-text", "imagen-3.0-generate"), false);
assert.equal(imageProtocolCapabilities({ protocol: "openai-images" }).supportsReferenceImage, true);
assert.equal(imageProtocolCapabilities({ protocol: "gemini-native-image", referenceImageSupported: false }).supportsReferenceImage, false);
assert.equal(imageProtocolCapabilities({ protocol: "imagen-text" }).supportsReferenceImage, false);
assert.throws(() => assertReferenceImageCapability({ id: "p", name: "Gemini", protocol: "gemini-native-image", apiEndpoint: "x", apiKey: "y", selectedModel: "z", referenceImageSupported: false }, true));
assert.throws(() => assertReferenceImageCapability({ id: "p", name: "Imagen", protocol: "imagen-text", apiEndpoint: "x", apiKey: "y", selectedModel: "z" }, true));
const settingsPage = readFileSync(new URL("../src/components/AppSettings.tsx", import.meta.url), "utf8");
const settingsApiPresetState = readFileSync(new URL("../src/features/settings/hooks/useSettingsApiPresetState.ts", import.meta.url), "utf8");
const imageApiActions = readFileSync(new URL("../src/features/settings/hooks/useSettingsImageApiActions.ts", import.meta.url), "utf8");
const imageSettings = settingsPage.slice(settingsPage.indexOf('activeTab === "image_api"'), settingsPage.indexOf('activeTab === "beauty"'));
assert.doesNotMatch(imageSettings, /Provider Protocol|认证方式|OpenAI Images|Gemini Native|Imagen text-to-image|模型已验证|未验证/);
const storedChatImage = readFileSync(new URL("../src/features/chat/components/StoredChatImage.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
assert.match(storedChatImage, /generated \? "border-0 shadow-none outline-none ring-0" : "border shadow-sm"/);
assert.match(settingsPage, /useSettingsImageApiActions/);
assert.match(imageApiActions, /const updateCurrentImageModel = \(model: string\)/);
assert.match(imageApiActions, /const persistImagePresetDraft =/);
assert.match(imageApiActions, /onSaveSettings\(\(previous\) => \(\{ \.\.\.previous, enableImageGeneration, imageApiPresets: next, activeImageApiPresetId \}\)\)/);
assert.match(imageApiActions, /selectedModel: model/);
assert.match(imageApiActions, /请先选择或输入图片模型。/);
assert.match(settingsApiPresetState, /selectedModel: preset\.selectedModel \|\| \(preset as ImageApiPreset & \{ model\?: string \}\)\.model \|\| ""/);
assert.match(imageApiActions, /apiTestImageConnection\(\{[\s\S]*apiKey: imageApiKey\.trim\(\),[\s\S]*selectedModel: imageSelectedModel\.trim\(\)/);
assert.match(server, /testImageConnectionWithProtocol\(\{ \.\.\.req\.body, model: req\.body\?\.selectedModel \}\)/);
assert.match(server, /ImageApiError/);
console.log("imageApiPayload.test passed");
